import { auth } from '@milkpod/auth';
import { db } from '@milkpod/db';
export { closeConnections } from '@milkpod/db';
import { sql } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { requestLogger } from './middleware/logger';
import { rateLimiter } from './middleware/rate-limit';
import { chat } from './modules/chat';
import { assets } from './modules/assets';
import { collections } from './modules/collections';
import { threads } from './modules/threads';
import { ingest } from './modules/ingest';
import { shares } from './modules/shares';
import { podcasts } from './modules/podcasts';

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
  .mount('/api/auth', auth().handler)
  .use(rateLimiter)
  .use(chat)
  .use(assets)
  .use(collections)
  .use(threads)
  .use(ingest)
  .use(shares)
  .use(podcasts);

export type App = typeof app;

