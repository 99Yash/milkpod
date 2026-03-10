import { Elysia, status, t } from 'elysia';
import { authMacro } from '../../middleware/auth';
import { isAdminEmail } from '../usage/service';
import { RetentionService } from './service';

function requireAdmin(user: { email: string }) {
  if (!isAdminEmail(user.email)) {
    return status(403, { message: 'Admin access required' });
  }
}

export const retention = new Elysia({ prefix: '/api/admin/retention' })
  .use(authMacro)
  .post(
    '/purge',
    async ({ user, query }) => {
      const denied = requireAdmin(user);
      if (denied) return denied;

      const limit = query.limit ? Math.min(Math.max(Number(query.limit) || 100, 1), 500) : 100;
      const result = await RetentionService.purge(limit);

      if (result.failed > 0) {
        console.warn(
          `[retention] Purge completed with ${result.failed} failures:`,
          result.errors,
        );
      }

      return result;
    },
    {
      auth: true,
      query: t.Object({
        limit: t.Optional(t.String()),
      }),
    },
  )
  .post(
    '/hold/:assetId',
    async ({ user, params, body }) => {
      const denied = requireAdmin(user);
      if (denied) return denied;

      const updated = await RetentionService.setRetentionHold(params.assetId, body.hold);
      if (!updated) return status(404, { message: 'Asset not found' });
      return updated;
    },
    {
      auth: true,
      body: t.Object({
        hold: t.Boolean(),
      }),
    },
  )
  .get('/stats', async ({ user }) => {
    const denied = requireAdmin(user);
    if (denied) return denied;

    return RetentionService.getStats();
  }, { auth: true });
