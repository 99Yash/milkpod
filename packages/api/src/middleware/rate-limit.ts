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

const LIMITS: Record<RateCategory, BucketConfig> = {
  ingest: { capacity: 10, refillRate: 10 / 60 }, // 10 per minute
  chat: { capacity: 30, refillRate: 30 / 60 }, // 30 per minute
  crud: { capacity: 100, refillRate: 100 / 60 }, // 100 per minute
};

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

// --- Elysia plugin ---

/**
 * Per-IP token bucket rate limiter.
 *
 * User identity is not available at this point in the lifecycle (the auth
 * macro resolves per-route, after onBeforeHandle). All requests are keyed
 * by IP address.
 */
export const rateLimiter = new Elysia({ name: 'rate-limiter' }).onBeforeHandle(
  (ctx) => {
    const { request, set } = ctx;
    const url = new URL(request.url);
    const path = url.pathname;
    const category = categorize(path);
    if (!category) return;

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown';

    const identity = `ip:${ip}`;
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
