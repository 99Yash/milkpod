import { auth } from '@milkpod/auth';
import { Elysia } from 'elysia';

// --- Token Bucket ---

interface BucketConfig {
  /** Max tokens (burst capacity) */
  capacity: number;
  /** Tokens added per second */
  refillRate: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

/** Periodically purge idle buckets to prevent memory leaks */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const BUCKET_TTL_MS = 10 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefill > BUCKET_TTL_MS) {
      buckets.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);

function consume(
  key: string,
  config: BucketConfig
): { allowed: boolean; retryAfterSecs: number } {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket) {
    bucket = { tokens: config.capacity, lastRefill: now };
    buckets.set(key, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(
    config.capacity,
    bucket.tokens + elapsed * config.refillRate
  );
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, retryAfterSecs: 0 };
  }

  // How long until 1 token is available
  const deficit = 1 - bucket.tokens;
  const retryAfterSecs = Math.ceil(deficit / config.refillRate);
  return { allowed: false, retryAfterSecs };
}

// --- Route categorization ---

type RateCategory = 'ingest' | 'chat' | 'crud';

const LIMITS = {
  ingest: { capacity: 10, refillRate: 10 / 60 }, // 10 per minute
  chat: { capacity: 30, refillRate: 30 / 60 }, // 30 per minute
  crud: { capacity: 100, refillRate: 100 / 60 }, // 100 per minute
} satisfies Record<RateCategory, BucketConfig>;

function categorize(path: string): RateCategory | null {
  if (path.startsWith('/api/ingest')) return 'ingest';
  if (path.startsWith('/api/chat')) return 'chat';
  if (
    path.startsWith('/api/assets') ||
    path.startsWith('/api/collections') ||
    path.startsWith('/api/threads') ||
    path.startsWith('/api/shares')
  ) {
    return 'crud';
  }
  return null;
}

// --- Helpers ---

function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

// --- Elysia plugin ---

/**
 * Token bucket rate limiter keyed by authenticated userId (preferred)
 * with IP fallback for unauthenticated routes (health, share validation).
 */
export const rateLimiter = new Elysia({ name: 'rate-limiter' }).onBeforeHandle(
  async (ctx) => {
    const { request, set } = ctx;
    const url = new URL(request.url);
    const path = url.pathname;
    const category = categorize(path);
    if (!category) return;

    let identity: string;
    try {
      const session = await auth().api.getSession({
        headers: request.headers,
      });
      identity = session?.user?.id
        ? `user:${session.user.id}`
        : `ip:${getClientIp(request)}`;
    } catch {
      identity = `ip:${getClientIp(request)}`;
    }

    const key = `${identity}:${category}`;
    const config = LIMITS[category];
    const { allowed, retryAfterSecs } = consume(key, config);

    if (!allowed) {
      set.status = 429;
      set.headers['Retry-After'] = String(retryAfterSecs);
      return { message: 'Too many requests. Please try again later.' };
    }
  }
);
