import { DAILY_WORD_BUDGET } from '@milkpod/ai';
import { Elysia } from 'elysia';
import { authMacro } from '../../middleware/auth';
import { isAdminEmail } from './service';
import { UsageService } from './service';

export const usage = new Elysia({ prefix: '/api/usage' })
  .use(authMacro)
  .get(
    '/remaining',
    async ({ user }) => {
      const admin = isAdminEmail(user.email);
      if (admin) {
        return { remaining: DAILY_WORD_BUDGET, budget: DAILY_WORD_BUDGET, isAdmin: true };
      }
      const remaining = await UsageService.getRemainingWords(user.id);
      return { remaining, budget: DAILY_WORD_BUDGET, isAdmin: false };
    },
    { auth: true },
  );
