import { Elysia } from 'elysia';
import { authMacro } from '../../middleware/auth';
import { isAdminEmail, resolveWordBudget, UsageService } from './service';

export const usage = new Elysia({ prefix: '/api/usage' })
  .use(authMacro)
  .get(
    '/remaining',
    async ({ user }) => {
      const admin = isAdminEmail(user.email);
      const budget = await resolveWordBudget(user.id);
      if (admin) {
        return { remaining: budget, budget, isAdmin: true };
      }
      const remaining = await UsageService.getRemainingWords(user.id, budget);
      return { remaining, budget, isAdmin: false };
    },
    { auth: true },
  )
  .get(
    '/stats',
    async ({ user }) => {
      return UsageService.getUserStats(user.id);
    },
    { auth: true },
  );
