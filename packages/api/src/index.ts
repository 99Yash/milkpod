import { auth } from '@milkpod/auth';
import { Elysia } from 'elysia';

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
  .get('/private', ({ session, set }) => {
    if (!session) {
      set.status = 401;
      return {
        message: 'Authentication required',
      };
    }

    return {
      message: 'This is private',
      user: session.user,
    };
  });

export type App = typeof app;
