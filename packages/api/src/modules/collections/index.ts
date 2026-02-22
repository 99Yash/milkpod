import { Elysia, status } from 'elysia';
import { authMacro } from '../../middleware/auth';
import { CollectionModel } from './model';
import { CollectionService } from './service';
import { AssetService } from '../assets/service';

export const collections = new Elysia({ prefix: '/api/collections' })
  .use(authMacro)
  .post(
    '/',
    async ({ body, user }) => {
      return CollectionService.create(user.id, body);
    },
    { auth: true, body: CollectionModel.create }
  )
  .get('/', async ({ user }) => {
    return CollectionService.list(user.id);
  }, { auth: true })
  .get('/:id', async ({ params, user }) => {
    const collection = await CollectionService.getWithItems(
      params.id,
      user.id
    );
    if (!collection) return status(404, { message: 'Collection not found' });
    return collection;
  }, { auth: true })
  .patch(
    '/:id',
    async ({ params, body, user }) => {
      const updated = await CollectionService.update(
        params.id,
        user.id,
        body
      );
      if (!updated) return status(404, { message: 'Collection not found' });
      return updated;
    },
    { auth: true, body: CollectionModel.update }
  )
  .delete('/:id', async ({ params, user }) => {
    const deleted = await CollectionService.remove(params.id, user.id);
    if (!deleted) return status(404, { message: 'Collection not found' });
    return deleted;
  }, { auth: true })
  .post(
    '/:id/items',
    async ({ params, body, user }) => {
      const userId = user.id;

      // Verify user owns the collection
      const collection = await CollectionService.getById(params.id, userId);
      if (!collection) {
        return status(403, { message: 'Access denied to collection' });
      }

      // Verify user owns the asset being added
      const asset = await AssetService.getById(body.assetId, userId);
      if (!asset) {
        return status(403, { message: 'Access denied to asset' });
      }

      return CollectionService.addItem(params.id, body);
    },
    { auth: true, body: CollectionModel.addItem }
  )
  .delete('/:id/items/:itemId', async ({ params, user }) => {
    // Verify user owns the collection
    const collection = await CollectionService.getById(
      params.id,
      user.id
    );
    if (!collection) {
      return status(403, { message: 'Access denied to collection' });
    }

    const deleted = await CollectionService.removeItem(params.id, params.itemId);
    if (!deleted) return status(404, { message: 'Item not found' });
    return deleted;
  }, { auth: true });
