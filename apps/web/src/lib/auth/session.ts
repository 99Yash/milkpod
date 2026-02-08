import { auth } from '@milkpod/auth';
import { headers } from 'next/headers';
import { cache } from 'react';

export type SessionSnapshot = Awaited<ReturnType<typeof auth.api.getSession>>;

export const getServerSession = cache(async () => {
  try {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({ headers: requestHeaders });
    return session ?? null;
  } catch {
    return null;
  }
});
