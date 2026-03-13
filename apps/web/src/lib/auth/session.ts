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

export const getServerSession = cache(async (): Promise<SessionSnapshot> => {
  try {
    const requestHeaders = await headers();
    const cookie = requestHeaders.get('cookie');
    if (!cookie) return null;

    const res = await fetch(
      `${clientEnv().NEXT_PUBLIC_SERVER_URL}/api/auth/get-session`,
      { headers: { cookie } },
    );
    if (!res.ok) return null;

    const data = await res.json();
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
