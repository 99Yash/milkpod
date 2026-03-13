import { clientEnv } from '@milkpod/env/client';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { route } from '~/lib/routes';

export type SessionSnapshot = {
  session: { id: string; userId: string; token: string; expiresAt: string };
  user: {
    id: string;
    email: string;
    name: string;
    image: string | null;
    emailVerified: boolean;
    createdAt: string;
    updatedAt: string;
  };
} | null;

type AuthenticatedSession = NonNullable<SessionSnapshot> & {
  user: NonNullable<NonNullable<SessionSnapshot>['user']>;
};

// ---------------------------------------------------------------------------
// Module-level session cache (survives across React render passes).
//
// React.cache() only deduplicates within a single RSC render.  Every tab
// switch is a NEW render, so getServerSession() fires a fresh ~600ms HTTP
// call each time.  This token-keyed cache stores the result for 10 s so
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

    const res = await fetch(
      `${clientEnv().NEXT_PUBLIC_SERVER_URL}/api/auth/get-session`,
      { headers: { cookie } },
    );
    if (!res.ok) return null;

    const data = await res.json();
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
