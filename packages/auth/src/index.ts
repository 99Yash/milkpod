import { db } from '@milkpod/db';
import * as schema from '@milkpod/db/schema/auth';
import { serverEnv } from '@milkpod/env/server';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { Resend } from 'resend';
import { buildOtpEmail } from './otp-email-template';

let _auth: ReturnType<typeof betterAuth<BetterAuthOptions>> | undefined;

const AUTH_FROM_EMAIL = 'Milkpod <noreply@croisillies.xyz>';

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
          const template = buildOtpEmail(type, safeOtp);
          try {
            await resend.emails.send({
              from: AUTH_FROM_EMAIL,
              to: email,
              subject: template.subject,
              html: template.html,
              text: template.text,
            });
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            console.error('Failed to send verification OTP via Resend', {
              type,
              errorMessage,
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
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production',
        httpOnly: true,
        ...(env.NODE_ENV === 'production' ? { domain: env.COOKIE_DOMAIN } : {}),
      },
    },
  });
  return _auth;
}
