import { Elysia, status, t } from 'elysia';
import { authMacro } from '../../middleware/auth';
import { ThreadModel } from './model';
import { ThreadService } from './service';

export const threads = new Elysia({ prefix: '/api/threads' })
  .use(authMacro)
  .post(
    '/',
    async ({ body, user }) => {
      return ThreadService.create(user.id, body);
    },
    { auth: true, body: ThreadModel.create }
  )
  .get(
    '/',
    async ({ query, user }) => {
      if (query.assetId) {
        const thread = await ThreadService.getLatestForAsset(
          query.assetId,
          user.id
        );
        return thread ? [thread] : [];
      }
      return ThreadService.list(user.id);
    },
    {
      auth: true,
      query: t.Object({ assetId: t.Optional(t.String()) }),
    }
  )
  .get('/:id', async ({ params, user }) => {
    const thread = await ThreadService.getWithMessages(
      params.id,
      user.id
    );
    if (!thread) return status(404, { message: 'Thread not found' });
    return thread;
  }, { auth: true })
  .patch(
    '/:id',
    async ({ params, body, user }) => {
      const updated = await ThreadService.update(
        params.id,
        user.id,
        body
      );
      if (!updated) return status(404, { message: 'Thread not found' });
      return updated;
    },
    { auth: true, body: ThreadModel.update }
  )
  .delete('/:id', async ({ params, user }) => {
    const deleted = await ThreadService.remove(params.id, user.id);
    if (!deleted) return status(404, { message: 'Thread not found' });
    return deleted;
  }, { auth: true });
