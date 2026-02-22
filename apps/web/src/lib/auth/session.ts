import { auth } from '@milkpod/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { route } from '~/lib/routes';

export type SessionSnapshot = Awaited<ReturnType<typeof auth.api.getSession>>;

type AuthenticatedSession = NonNullable<SessionSnapshot> & {
  user: NonNullable<NonNullable<SessionSnapshot>['user']>;
};

export const getServerSession = cache(async () => {
  try {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({ headers: requestHeaders });
    return session ?? null;
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
