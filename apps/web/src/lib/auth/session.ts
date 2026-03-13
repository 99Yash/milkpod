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
const sessionTokenCache = new Map<string, { data: NonNullable<SessionSnapshot>; expiresAt: number }>();

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
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }
    }

    const data = await sessionAuth().api.getSession({ headers: requestHeaders });
    if (!data) return null;

    // Populate cache
    if (token) {
      sessionTokenCache.set(token, {
        data,
        expiresAt: Date.now() + SESSION_TTL_MS,
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
