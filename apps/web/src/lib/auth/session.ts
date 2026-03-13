import 'server-only';
import { sessionAuth } from '@milkpod/auth/session';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { route } from '~/lib/routes';

export type SessionSnapshot = Awaited<
  ReturnType<ReturnType<typeof sessionAuth>['api']['getSession']>
>;

type AuthenticatedSession = NonNullable<SessionSnapshot> & {
  user: NonNullable<NonNullable<SessionSnapshot>['user']>;
};

// ---------------------------------------------------------------------------
// Module-level session cache (survives across React render passes).
//
// React.cache() only deduplicates within a single RSC render.  Every tab
// switch is a NEW render, so getServerSession() would re-check DB session
// state each time.  This token-keyed cache stores the result for 10 s so
// navigating between tabs reuses the session instantly.
// ---------------------------------------------------------------------------

const SESSION_TTL_MS = 10_000;
const MAX_SESSION_CACHE_SIZE = 1_000;
const sessionTokenCache = new Map<string, { data: NonNullable<SessionSnapshot>; expiresAt: number }>();

function pruneExpiredSessions(now: number): void {
  for (const [token, cached] of sessionTokenCache) {
    if (cached.expiresAt <= now) {
      sessionTokenCache.delete(token);
    }
  }
}

function extractToken(cookie: string): string | undefined {
  const match = cookie.match(/better-auth\.session_token=([^;]+)/);
  return match?.[1];
}

export const getServerSession = cache(async (): Promise<SessionSnapshot> => {
  try {
    const requestHeaders = await headers();
    const cookie = requestHeaders.get('cookie');
    if (!cookie) return null;

    // Check module-level cache first
    const token = extractToken(cookie);
    if (token) {
      const cached = sessionTokenCache.get(token);
      const now = Date.now();
      if (cached && cached.expiresAt > now) {
        return cached.data;
      }
      if (cached) {
        sessionTokenCache.delete(token);
      }
    }

    const data = await sessionAuth().api.getSession({ headers: requestHeaders });
    if (!data) return null;

    // Populate cache
    if (token) {
      const now = Date.now();
      pruneExpiredSessions(now);
      if (sessionTokenCache.size >= MAX_SESSION_CACHE_SIZE) {
        const oldest = sessionTokenCache.keys().next().value;
        if (oldest) {
          sessionTokenCache.delete(oldest);
        }
      }

      sessionTokenCache.set(token, {
        data,
        expiresAt: now + SESSION_TTL_MS,
      });
    }

    return data;
  } catch {
    return null;
  }
});

/**
 * Asserts that a session is authenticated, redirecting to sign-in if not.
 * After this call, TypeScript knows `session` has a non-null `user`.
 */
export function assertAuthenticated(
  session: SessionSnapshot | null,
): asserts session is AuthenticatedSession {
  if (!session?.user) {
    redirect(route('/signin'));
  }
}
