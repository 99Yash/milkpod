import { clientEnv } from '@milkpod/env/client';
import { nextCookies } from 'better-auth/next-js';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: clientEnv().NEXT_PUBLIC_SERVER_URL,
  plugins: [nextCookies()],
});
