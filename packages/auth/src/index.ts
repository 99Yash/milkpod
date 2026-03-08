import { db } from '@milkpod/db';
import * as schema from '@milkpod/db/schema/auth';
import { serverEnv } from '@milkpod/env/server';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { Resend } from 'resend';

let _auth: ReturnType<typeof betterAuth<BetterAuthOptions>> | undefined;

export function auth() {
  if (_auth) return _auth;
  const env = serverEnv();
  const resend = new Resend(env.RESEND_API_KEY);

  _auth = betterAuth<BetterAuthOptions>({
    database: drizzleAdapter(db(), {
      provider: 'pg',
      schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN],
    socialProviders: {
      google: {
        display: 'popup',
        prompt: 'select_account',
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    account: {
      accountLinking: {
        enabled: false,
      },
    },
    plugins: [
      emailOTP({
        sendVerificationOTP: async ({ email, otp, type }) => {
          const safeOtp = String(otp).replace(/[^0-9]/g, '');
          try {
            await resend.emails.send({
              from: 'Milkpod <noreply@milkpod.app>',
              to: email,
              subject:
                type === 'forget-password'
                  ? `Reset your password — ${safeOtp}`
                  : `Your sign-in code — ${safeOtp}`,
              html: `<p>Your verification code is: <strong>${safeOtp}</strong></p><p>This code expires in 5 minutes.</p>`,
            });
          } catch (error) {
            console.error('Failed to send verification OTP via Resend', {
              email,
              type,
              error,
            });
            throw error;
          }
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!user.name) {
              const prefix = user.email?.split('@')[0] ?? 'User';
              return { data: { ...user, name: prefix } };
            }
          },
        },
      },
    },
    advanced: {
      defaultCookieAttributes: {
        sameSite:
          env.NODE_ENV === 'production'
            ? env.COOKIE_DOMAIN
              ? 'lax'
              : 'none'
            : 'lax',
        secure: env.NODE_ENV === 'production',
        httpOnly: true,
        ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
      },
    },
  });
  return _auth;
}
