import { db } from '@milkpod/db';
import * as schema from '@milkpod/db/schema/auth';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { z } from 'zod';

/**
 * Minimal env validation — only the vars needed to verify a session.
 * This avoids pulling in RESEND_API_KEY, ASSEMBLYAI_API_KEY, etc.
 * that the web app doesn't (and shouldn't) have.
 */
const sessionEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().min(1),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  COOKIE_DOMAIN: z.string().min(1),
});

let _sessionAuth: ReturnType<typeof betterAuth> | undefined;

/**
 * Lightweight Better Auth instance for session checking only.
 * Does NOT include social providers, emailOTP, or any plugin
 * that requires server-only env vars (e.g. RESEND_API_KEY).
 *
 * Use this in the Next.js SSR layer (`getServerSession`).
 * Use `auth()` from the barrel export for the full Elysia server.
 */
export function sessionAuth() {
  if (_sessionAuth) return _sessionAuth;

  const env = sessionEnvSchema.parse(process.env);

  _sessionAuth = betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(db(), { provider: 'pg', schema }),
    trustedOrigins: [env.CORS_ORIGIN],
    advanced: {
      defaultCookieAttributes: {
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production',
        httpOnly: true,
        ...(env.NODE_ENV === 'production' ? { domain: env.COOKIE_DOMAIN } : {}),
      },
    },
  });

  return _sessionAuth;
}
