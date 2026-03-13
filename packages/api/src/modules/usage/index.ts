import { Elysia } from 'elysia';
import { authMacro } from '../../middleware/auth';
import { getRemainingWordsSummary, isAdminEmail, UsageService } from './service';

export const usage = new Elysia({ prefix: '/api/usage' })
  .use(authMacro)
  .get(
    '/remaining',
    async ({ user }) => {
      const admin = isAdminEmail(user.email);
      const { budget, remaining } = await getRemainingWordsSummary(user.id);
      if (admin) {
        return { remaining: budget, budget, isAdmin: true };
      }
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
