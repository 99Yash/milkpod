import { Elysia } from 'elysia';
import type { AssetId, CollectionId, CollectionItemId, UserId } from '@milkpod/db/helpers';
import { authMiddleware } from '../../middleware/auth';
import { CollectionModel } from './model';
import { CollectionService } from './service';
import { AssetService } from '../assets/service';

export const collections = new Elysia({ prefix: '/api/collections' })
  .use(authMiddleware)
  .post(
    '/',
    async ({ body, session, set }) => {
      if (!session) {
        set.status = 401;
        return { message: 'Authentication required' };
      }
      return CollectionService.create(session.user.id as UserId, body);
    },
    { body: CollectionModel.create }
  )
  .get('/', async ({ session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }
    return CollectionService.list(session.user.id as UserId);
  })
  .get('/:id', async ({ params, session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }
    const collection = await CollectionService.getWithItems(
      params.id as CollectionId,
      session.user.id as UserId
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
        params.id as CollectionId,
        session.user.id as UserId,
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
    const deleted = await CollectionService.remove(params.id as CollectionId, session.user.id as UserId);
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

      const userId = session.user.id as UserId;

      // Verify user owns the collection
      const collection = await CollectionService.getById(params.id as CollectionId, userId);
      if (!collection) {
        set.status = 403;
        return { message: 'Access denied to collection' };
      }

      // Verify user owns the asset being added
      const asset = await AssetService.getById(body.assetId as AssetId, userId);
      if (!asset) {
        set.status = 403;
        return { message: 'Access denied to asset' };
      }

      return CollectionService.addItem(params.id as CollectionId, body);
    },
    { body: CollectionModel.addItem }
  )
  .delete('/:id/items/:itemId', async ({ params, session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }

    // Verify user owns the collection
    const collection = await CollectionService.getById(
      params.id as CollectionId,
      session.user.id as UserId
    );
    if (!collection) {
      set.status = 403;
      return { message: 'Access denied to collection' };
    }

    const deleted = await CollectionService.removeItem(params.id as CollectionId, params.itemId as CollectionItemId);
    if (!deleted) {
      set.status = 404;
      return { message: 'Item not found' };
    }
    return deleted;
  });
