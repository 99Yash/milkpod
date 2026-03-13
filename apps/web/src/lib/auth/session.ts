import 'server-only';
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

/**
 * Fetch the current session from the Elysia backend.
 *
 * Uses `React.cache()` to deduplicate within a single RSC render pass.
 * We intentionally avoid a longer-lived module-level cache because the
 * browser's `fetch()` may not process `Set-Cookie` headers from the
 * signout response — so the stale session token can arrive on the very
 * next navigation, and a TTL cache would serve the invalidated session.
 */
export const getServerSession = cache(async (): Promise<SessionSnapshot> => {
  try {
    const requestHeaders = await headers();
    const cookie = requestHeaders.get('cookie');
    if (!cookie) return null;

    const res = await fetch(
      `${clientEnv().NEXT_PUBLIC_SERVER_URL}/api/auth/get-session`,
      {
        headers: { cookie },
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!res.ok) return null;

    const data: SessionSnapshot = await res.json();
    return data ?? null;
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
