import { Elysia } from 'elysia';
import { authMacro } from '../../middleware/auth';
import { requireAdmin } from '../../utils';
import { QuotaService } from './service';

export const quota = new Elysia({ prefix: '/api/quota' })
  .use(authMacro)
  .get(
    '/',
    async ({ user }) => {
      const usage = await QuotaService.getMonthlyUsage(user.id);

      return {
        plan: usage.planId,
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
      const denied = requireAdmin(user);
      if (denied) return denied;

      return QuotaService.getAggregateStats();
    },
    { auth: true },
  );
