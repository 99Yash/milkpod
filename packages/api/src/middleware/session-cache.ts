import { auth } from '@milkpod/auth';

type Session = Awaited<ReturnType<ReturnType<typeof auth>['api']['getSession']>>;

// ---------------------------------------------------------------------------
// Layer 1 — Per-request dedup (WeakMap on Request)
//
// The rate limiter and auth macro both call getSessionCached() for the same
// request.  The WeakMap ensures only one DB query per request; the second
// caller awaits the same promise.
// ---------------------------------------------------------------------------

const perRequest = new WeakMap<Request, Promise<Session>>();

// ---------------------------------------------------------------------------
// Layer 2 — Short-lived token cache (10 s TTL)
//
// A page load fires 6-8 concurrent API calls.  Without this cache each one
// pays a ~500 ms Neon roundtrip just for session validation.  With it, only
// the first call in a 10 s window hits the DB; the rest resolve instantly.
// ---------------------------------------------------------------------------

const TOKEN_TTL_MS = 10_000;
const MAX_TOKEN_CACHE_SIZE = 1_000;
const tokenCache = new Map<string, { session: Session; expiresAt: number }>();

const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of tokenCache) {
    if (entry.expiresAt <= now) tokenCache.delete(key);
  }
}, 60_000);
// Don't keep the process alive just for cache cleanup (e.g. in tests)
if (typeof sweepTimer === 'object' && 'unref' in sweepTimer) sweepTimer.unref();

function extractSessionToken(headers: Headers): string | undefined {
  const cookie = headers.get('cookie');
  if (!cookie) return undefined;
  const match = cookie.match(/better-auth\.session_token=([^;]+)/);
  return match?.[1];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getSessionCached(request: Request): Promise<Session> {
  // 1. Per-request dedup
  let promise = perRequest.get(request);
  if (promise) return promise;

  // 2. Token-level cache
  const token = extractSessionToken(request.headers);
  if (token) {
    const cached = tokenCache.get(token);
    if (cached && cached.expiresAt > Date.now()) {
      promise = Promise.resolve(cached.session);
      perRequest.set(request, promise);
      return promise;
    }
  }

  // 3. DB lookup → populate both caches
  promise = auth()
    .api.getSession({ headers: request.headers })
    .then((session) => {
      if (token) {
        // Evict oldest entry if the cache is full
        if (tokenCache.size >= MAX_TOKEN_CACHE_SIZE) {
          const oldest = tokenCache.keys().next().value;
          if (oldest) tokenCache.delete(oldest);
        }
        tokenCache.set(token, {
          session,
          expiresAt: Date.now() + TOKEN_TTL_MS,
        });
      }
      return session;
    });

  perRequest.set(request, promise);
  return promise;
}
