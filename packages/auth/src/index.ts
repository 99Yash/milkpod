import { db } from '@milkpod/db';
import * as schema from '@milkpod/db/schema/auth';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

// Server-side auth instance (used in the backend auth server)
// This instance has direct database access and handles authentication
export const auth = betterAuth<BetterAuthOptions>({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  trustedOrigins: [process.env.CORS_ORIGIN || 'http://localhost:3000'],
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      display: 'popup',
      prompt: 'select_account',
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
    },
  },
});
