import { auth } from '@milkpod/auth';
import { db } from '@milkpod/db';
export { closeConnections } from '@milkpod/db';
import * as authSchema from '@milkpod/db/schema/auth';
import { serverEnv } from '@milkpod/env/server';
import { eq, sql } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
import { requestLogger } from './middleware/logger';
import { rateLimiter } from './middleware/rate-limit';
import { chat } from './modules/chat';
import { assets } from './modules/assets';
import { collections } from './modules/collections';
import { threads } from './modules/threads';
import { ingest } from './modules/ingest';
import { shares } from './modules/shares';
import { podcasts } from './modules/podcasts';
import { usage } from './modules/usage';
import { moments } from './modules/moments';

export const app = new Elysia({ name: 'api' })
  .use(requestLogger)
  .get('/health', async ({ set }) => {
    try {
      await db().execute(sql`SELECT 1`);
      return { status: 'ok', db: 'connected' };
    } catch {
      set.status = 503;
      return { status: 'error', db: 'disconnected' };
    }
  })
  .get('/ready', async ({ set }) => {
    const checks: Record<string, 'ok' | 'error'> = {};

    try {
      await db().execute(sql`SELECT 1`);
      checks.db = 'ok';
    } catch {
      checks.db = 'error';
    }

    const allOk = Object.values(checks).every((v) => v === 'ok');

    if (!allOk) {
      set.status = 503;
    }

    return { status: allOk ? 'ok' : 'error', checks };
  })
  // Redirect-based social sign-in: browser navigates here directly (top-level
  // navigation) so the state cookie is first-party. This avoids the cross-origin
  // fetch cookie issue on Railway where frontend/backend are different sites.
  .get(
    '/auth/social-redirect',
    async ({ query, set }) => {
      const env = serverEnv();
      const { provider, callbackURL } = query;

      // Make a real HTTP request to the auth endpoint so it goes through the
      // full Elysia lifecycle (CORS, mount, etc.) instead of calling the
      // handler directly which can hang in the Node adapter.
      const res = await fetch(
        `${env.BETTER_AUTH_URL}/api/auth/sign-in/social`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: env.CORS_ORIGIN,
          },
          body: JSON.stringify({ provider, callbackURL }),
        },
      );

      const data = (await res.json()) as {
        url?: string;
        redirect?: boolean;
      };
      if (data.url && data.redirect) {
        const cookies = res.headers.getSetCookie();
        if (cookies.length > 0) {
          set.headers['set-cookie'] = cookies.join(', ');
        }
        set.status = 302;
        set.headers['Location'] = data.url;
        return;
      }

      set.status = 500;
      return { error: 'OAuth initiation failed' };
    },
    {
      query: t.Object({
        provider: t.String(),
        callbackURL: t.String(),
      }),
    },
  )
  .post(
    '/auth/check-email-provider',
    async ({ body }) => {
      const { email } = body;
      const database = db();

      const [user] = await database
        .select({ id: authSchema.user.id })
        .from(authSchema.user)
        .where(eq(authSchema.user.email, email))
        .limit(1);

      if (!user) {
        return { conflict: false };
      }

      const accounts = await database
        .select({ providerId: authSchema.account.providerId })
        .from(authSchema.account)
        .where(eq(authSchema.account.userId, user.id));

      const hasEmailOtp = accounts.some(
        (a) => a.providerId === 'email-otp',
      );
      if (hasEmailOtp || accounts.length === 0) {
        return { conflict: false };
      }

      return {
        conflict: true,
        existingProvider: accounts[0]!.providerId,
      };
    },
    {
      body: t.Object({
        email: t.String(),
      }),
    },
  )
  .mount(auth().handler)
  .use(rateLimiter)
  .use(chat)
  .use(assets)
  .use(collections)
  .use(threads)
  .use(ingest)
  .use(shares)
  .use(podcasts)
  .use(usage)
  .use(moments);

export type App = typeof app;

