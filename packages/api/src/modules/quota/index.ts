import { Elysia, status } from 'elysia';
import { authMacro } from '../../middleware/auth';
import { isAdminEmail } from '../usage/service';
import { QuotaService } from './service';
import { resolveUserPlan } from './plans';

export const quota = new Elysia({ prefix: '/api/quota' })
  .use(authMacro)
  .get(
    '/',
    async ({ user }) => {
      const usage = await QuotaService.getMonthlyUsage(user.id);
      const plan = resolveUserPlan(user.id);

      return {
        plan,
        periodStart: usage.periodStart,
        usage: {
          videoMinutes: { used: usage.videoMinutesUsed, limit: usage.limits.videoMinutesMonthly },
          visualSegments: { used: usage.visualSegmentsUsed, limit: usage.limits.visualSegmentsMonthly },
          comments: { used: usage.commentsGenerated, limit: usage.limits.commentsMonthly },
        },
      };
    },
    { auth: true },
  );

export const quotaAdmin = new Elysia({ prefix: '/api/admin/quota' })
  .use(authMacro)
  .get(
    '/stats',
    async ({ user }) => {
      if (!isAdminEmail(user.email)) {
        return status(403, { message: 'Admin access required' });
      }

      return QuotaService.getAggregateStats();
    },
    { auth: true },
  );
