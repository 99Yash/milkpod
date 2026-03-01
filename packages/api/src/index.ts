import { auth } from '@milkpod/auth';
import { db } from '@milkpod/db';
export { closeConnections } from '@milkpod/db';
import { serverEnv } from '@milkpod/env/server';
import { sql } from 'drizzle-orm';
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

      const internalRes = await auth().handler(
        new Request(new URL('/api/auth/sign-in/social', env.BETTER_AUTH_URL), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, callbackURL }),
        }),
      );

      const data = (await internalRes.json()) as {
        url?: string;
        redirect?: boolean;
      };
      if (data.url && data.redirect) {
        // Forward the state cookie(s) from Better Auth's response
        const cookies = internalRes.headers.getSetCookie();
        if (cookies.length > 0) {
          set.headers['set-cookie'] = cookies.join(', ');
        }
        set.redirect = data.url;
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
  .mount(auth().handler)
  .use(rateLimiter)
  .use(chat)
  .use(assets)
  .use(collections)
  .use(threads)
  .use(ingest)
  .use(shares)
  .use(podcasts)
  .use(usage);

export type App = typeof app;

