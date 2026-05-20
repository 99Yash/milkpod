import { db } from '@milkpod/db';
import * as schema from '@milkpod/db/schema/auth';
import { serverEnv } from '@milkpod/env/server';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { Resend } from 'resend';
import { buildOtpEmail } from './otp-email-template';
import { claimPendingInvitesOnSignup } from './signup-hooks';

let _auth: ReturnType<typeof betterAuth<BetterAuthOptions>> | undefined;

// Resend's SDK doesn't expose AbortSignal on emails.send (see
// resend@6.9.3/dist/index.d.mts: PostOptions = { query?, headers? } only).
// OTP send sits on the critical path of sign-in/sign-up — without a cap, a
// hung Resend request would keep the betterAuth handler pending until the
// upstream HTTP request times out (or forever, if the client never gives up).
const OTP_EMAIL_TIMEOUT_MS = 30_000;

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
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              resend.emails.send({
                from: env.AUTH_FROM_EMAIL,
                to: email,
                subject: template.subject,
                html: template.html,
                text: template.text,
              }),
              new Promise<never>((_, reject) => {
                timer = setTimeout(
                  () =>
                    reject(
                      new Error(
                        `OTP email send timed out after ${OTP_EMAIL_TIMEOUT_MS}ms`,
                      ),
                    ),
                  OTP_EMAIL_TIMEOUT_MS,
                );
              }),
            ]);
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            console.error('Failed to send verification OTP via Resend', {
              type,
              errorMessage,
            });
            throw error;
          } finally {
            if (timer) clearTimeout(timer);
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
          after: async (user) => {
            // Convert any pending asset invites targeted at this email into
            // real memberships + notifications. Fire-and-forget — signup must
            // not fail because an invite claim hit a transient error.
            await claimPendingInvitesOnSignup(user.id, user.email);
          },
        },
      },
    },
    advanced: {
      defaultCookieAttributes: {
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production',
        httpOnly: true,
        ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
      },
    },
  });
  return _auth;
}
