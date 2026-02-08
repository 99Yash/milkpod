import { Elysia } from 'elysia';
import { authMiddleware } from '../../middleware/auth';
import { CollectionModel } from './model';
import { CollectionService } from './service';

export const collections = new Elysia({ prefix: '/api/collections' })
  .use(authMiddleware)
  .post(
    '/',
    async ({ body, session, set }) => {
      if (!session) {
        set.status = 401;
        return { message: 'Authentication required' };
      }
      return CollectionService.create(session.user.id, body);
    },
    { body: CollectionModel.create }
  )
  .get('/', async ({ session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }
    return CollectionService.list(session.user.id);
  })
  .get('/:id', async ({ params, session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }
    const collection = await CollectionService.getWithItems(
      params.id,
      session.user.id
    );
    if (!collection) {
      set.status = 404;
      return { message: 'Collection not found' };
    }
    return collection;
  })
  .patch(
    '/:id',
    async ({ params, body, session, set }) => {
      if (!session) {
        set.status = 401;
        return { message: 'Authentication required' };
      }
      const updated = await CollectionService.update(
        params.id,
        session.user.id,
        body
      );
      if (!updated) {
        set.status = 404;
        return { message: 'Collection not found' };
      }
      return updated;
    },
    { body: CollectionModel.update }
  )
  .delete('/:id', async ({ params, session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }
    const deleted = await CollectionService.remove(params.id, session.user.id);
    if (!deleted) {
      set.status = 404;
      return { message: 'Collection not found' };
    }
    return deleted;
  })
  .post(
    '/:id/items',
    async ({ params, body, session, set }) => {
      if (!session) {
        set.status = 401;
        return { message: 'Authentication required' };
      }
      return CollectionService.addItem(params.id, body);
    },
    { body: CollectionModel.addItem }
  )
  .delete('/:id/items/:itemId', async ({ params, session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }
    const deleted = await CollectionService.removeItem(params.id, params.itemId);
    if (!deleted) {
      set.status = 404;
      return { message: 'Item not found' };
    }
    return deleted;
  });
