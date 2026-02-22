import { db } from '@milkpod/db';
import * as schema from '@milkpod/db/schema/auth';
import { serverEnv } from '@milkpod/env/server';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

const env = serverEnv();

export const auth = betterAuth<BetterAuthOptions>({
  database: drizzleAdapter(db(), {
    provider: 'pg',
    schema,
  }),
  trustedOrigins: [env.CORS_ORIGIN],
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      display: 'popup',
      prompt: 'select_account',
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      httpOnly: true,
    },
  },
});
