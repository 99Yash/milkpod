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
const tokenInflight = new Map<string, Promise<Session>>();

const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of tokenCache) {
    if (entry.expiresAt <= now) tokenCache.delete(key);
  }
}, 60_000);
// Don't keep the process alive just for cache cleanup (e.g. in tests)
if (typeof sweepTimer === 'object' && 'unref' in sweepTimer) sweepTimer.unref();

const SESSION_COOKIE_NAMES = new Set([
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
  '__Host-better-auth.session_token',
]);

function decodeCookieComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractSessionToken(headers: Headers): string | undefined {
  const cookie = headers.get('cookie');
  if (!cookie) return undefined;

  for (const part of cookie.split(';')) {
    const [rawName, ...valueParts] = part.trim().split('=');
    if (!rawName || valueParts.length === 0) continue;

    const name = decodeCookieComponent(rawName.trim());
    if (!SESSION_COOKIE_NAMES.has(name) && !name.endsWith('better-auth.session_token')) {
      continue;
    }

    const rawValue = valueParts.join('=').trim();
    if (!rawValue) return undefined;

    const decoded = decodeCookieComponent(rawValue);
    if (decoded.startsWith('"') && decoded.endsWith('"') && decoded.length > 1) {
      return decoded.slice(1, -1);
    }
    return decoded;
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Remove the session token from the in-memory cache so the next lookup hits
 * the database.  Called on sign-out so concurrent requests (e.g. the /signin
 * page's session check) don't see a stale valid session.
 */
export function invalidateSessionToken(headers: Headers): void {
  const token = extractSessionToken(headers);
  if (token) {
    tokenCache.delete(token);
    tokenInflight.delete(token);
  }
}

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

    const inflight = tokenInflight.get(token);
    if (inflight) {
      perRequest.set(request, inflight);
      return inflight;
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
    })
    .finally(() => {
      if (token) tokenInflight.delete(token);
    });

  if (token) tokenInflight.set(token, promise);

  perRequest.set(request, promise);
  return promise;
}
