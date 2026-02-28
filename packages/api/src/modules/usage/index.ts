import { Elysia } from 'elysia';
import { authMacro } from '../../middleware/auth';
import { UsageService } from './service';

export const usage = new Elysia({ prefix: '/api/usage' })
  .use(authMacro)
  .get(
    '/remaining',
    async ({ user }) => {
      const remaining = await UsageService.getRemainingWords(user.id);
      return { remaining };
    },
    { auth: true },
  );
