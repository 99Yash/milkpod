import { Elysia } from 'elysia';
import type { ThreadId, UserId } from '@milkpod/db/helpers';
import { authMiddleware } from '../../middleware/auth';
import { ThreadModel } from './model';
import { ThreadService } from './service';

export const threads = new Elysia({ prefix: '/api/threads' })
  .use(authMiddleware)
  .post(
    '/',
    async ({ body, session, set }) => {
      if (!session) {
        set.status = 401;
        return { message: 'Authentication required' };
      }
      return ThreadService.create(session.user.id as UserId, body);
    },
    { body: ThreadModel.create }
  )
  .get('/', async ({ session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }
    return ThreadService.list(session.user.id as UserId);
  })
  .get('/:id', async ({ params, session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }
    const thread = await ThreadService.getWithMessages(
      params.id as ThreadId,
      session.user.id as UserId
    );
    if (!thread) {
      set.status = 404;
      return { message: 'Thread not found' };
    }
    return thread;
  })
  .patch(
    '/:id',
    async ({ params, body, session, set }) => {
      if (!session) {
        set.status = 401;
        return { message: 'Authentication required' };
      }
      const updated = await ThreadService.update(
        params.id as ThreadId,
        session.user.id as UserId,
        body
      );
      if (!updated) {
        set.status = 404;
        return { message: 'Thread not found' };
      }
      return updated;
    },
    { body: ThreadModel.update }
  )
  .delete('/:id', async ({ params, session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }
    const deleted = await ThreadService.remove(params.id as ThreadId, session.user.id as UserId);
    if (!deleted) {
      set.status = 404;
      return { message: 'Thread not found' };
    }
    return deleted;
  });
