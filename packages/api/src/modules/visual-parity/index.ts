import { Elysia, t } from 'elysia';
import { authMacro } from '../../middleware/auth';
import { requireAdmin } from '../../utils';
import { VisualParityService } from './service';

export const visualParity = new Elysia({ prefix: '/api/admin/visual' })
  .use(authMacro)
  .post(
    '/requeue',
    async ({ user, query }) => {
      const denied = requireAdmin(user);
      if (denied) return denied;

      const limit = query.limit
        ? Math.min(Math.max(Number(query.limit) || 50, 1), 200)
        : 50;
      const result = await VisualParityService.requeue(limit);

      if (result.errors.length > 0) {
        console.warn(
          `[visual-parity] Requeue completed with ${result.errors.length} errors:`,
          result.errors,
        );
      }

      return result;
    },
    {
      auth: true,
      query: t.Object({
        limit: t.Optional(t.String({ maxLength: 10 })),
      }),
    },
  )
  .get('/stats', async ({ user }) => {
    const denied = requireAdmin(user);
    if (denied) return denied;

    return VisualParityService.getParityStats();
  }, { auth: true });
