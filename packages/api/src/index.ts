import { auth } from '@milkpod/auth';
import { Elysia } from 'elysia';
import { chat } from './modules/chat';
import { assets } from './modules/assets';
import { collections } from './modules/collections';
import { threads } from './modules/threads';

export const app = new Elysia({ name: 'api' })
  .all('/api/auth/*', ({ request, set }) => {
    if (request.method === 'GET' || request.method === 'POST') {
      return auth.handler(request);
    }

    if (request.method === 'OPTIONS') {
      set.status = 204;
      return null;
    }

    set.status = 405;
    return 'Method Not Allowed';
  })
  .derive(async ({ request }) => {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    return {
      session,
    };
  })
  .get('/health', () => 'OK')
  .use(chat)
  .use(assets)
  .use(collections)
  .use(threads);

export type App = typeof app;
