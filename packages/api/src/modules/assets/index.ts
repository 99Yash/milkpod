import { Elysia } from 'elysia';
import { authMiddleware } from '../../middleware/auth';
import { AssetModel } from './model';
import { AssetService } from './service';

export const assets = new Elysia({ prefix: '/api/assets' })
  .use(authMiddleware)
  .post(
    '/',
    async ({ body, session, set }) => {
      if (!session) {
        set.status = 401;
        return { message: 'Authentication required' };
      }
      return AssetService.create(session.user.id, body);
    },
    { body: AssetModel.create }
  )
  .get('/', async ({ session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }
    return AssetService.list(session.user.id);
  })
  .get('/:id', async ({ params, session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }
    const asset = await AssetService.getWithTranscript(params.id, session.user.id);
    if (!asset) {
      set.status = 404;
      return { message: 'Asset not found' };
    }
    return asset;
  })
  .patch(
    '/:id',
    async ({ params, body, session, set }) => {
      if (!session) {
        set.status = 401;
        return { message: 'Authentication required' };
      }
      const updated = await AssetService.update(params.id, session.user.id, body);
      if (!updated) {
        set.status = 404;
        return { message: 'Asset not found' };
      }
      return updated;
    },
    { body: AssetModel.update }
  )
  .delete('/:id', async ({ params, session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }
    const deleted = await AssetService.remove(params.id, session.user.id);
    if (!deleted) {
      set.status = 404;
      return { message: 'Asset not found' };
    }
    return deleted;
  });
