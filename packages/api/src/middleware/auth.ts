import { auth } from '@milkpod/auth';
import { Elysia } from 'elysia';

export const authMiddleware = new Elysia({ name: 'auth-middleware' }).derive(
  { as: 'scoped' },
  async ({ request }) => {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    return { session };
  }
);
