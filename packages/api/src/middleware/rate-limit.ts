import { Elysia } from 'elysia';
import { getSessionCached } from './session-cache';

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
  config: BucketConfig,
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
    bucket.tokens + elapsed * config.refillRate,
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

type RateCategory = 'ingest' | 'chat' | 'crud' | 'auth' | 'billing';

const LIMITS = {
  ingest: { capacity: 10, refillRate: 10 / 60 },
  chat: { capacity: 30, refillRate: 30 / 60 },
  crud: { capacity: 100, refillRate: 100 / 60 },
  auth: { capacity: 10, refillRate: 10 / 60 },
  billing: { capacity: 10, refillRate: 10 / 60 },
} satisfies Record<RateCategory, BucketConfig>;

function categorize(path: string): RateCategory | null {
  if (path.startsWith('/api/ingest')) return 'ingest';
  if (path.startsWith('/api/chat')) return 'chat';
  if (path.startsWith('/api/auth/')) return 'auth';
  if (path.startsWith('/api/billing')) return 'billing';
  if (path.startsWith('/api/comments')) return 'ingest';
  if (path.startsWith('/api/admin/')) return 'ingest';
  if (path.startsWith('/api/shares/chat/')) return 'chat';
  if (
    path.startsWith('/api/assets') ||
    path.startsWith('/api/collections') ||
    path.startsWith('/api/threads') ||
    path.startsWith('/api/shares') ||
    path.startsWith('/api/quota') ||
    path.startsWith('/api/usage') ||
    path.startsWith('/api/moments') ||
    path.startsWith('/api/podcasts')
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
 * with IP fallback for unauthenticated routes.
 *
 * Auth endpoints are always IP-keyed to avoid an extra session lookup in the
 * limiter when Better Auth will validate the session in the route itself.
 */
export const rateLimiter = new Elysia({ name: 'rate-limiter' }).onBeforeHandle(
  async (ctx) => {
    const { request, set } = ctx;
    const url = new URL(request.url);
    const path = url.pathname;
    const category = categorize(path);
    if (!category) return;

    let identity = `ip:${getClientIp(request)}`;
    if (category !== 'auth') {
      try {
        const session = await getSessionCached(request);
        if (session?.user?.id) {
          identity = `user:${session.user.id}`;
        }
      } catch {
        // Keep IP fallback
      }
    }

    const key = `${identity}:${category}`;
    const config = LIMITS[category];
    const { allowed, retryAfterSecs } = consume(key, config);

    if (!allowed) {
      set.status = 429;
      set.headers['Retry-After'] = String(retryAfterSecs);
      return { message: 'Too many requests. Please try again later.' };
    }
  },
);
