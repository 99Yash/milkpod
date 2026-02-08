import { Elysia } from 'elysia';
import type { AssetId, UserId } from '@milkpod/db/helpers';
import { authMiddleware } from '../../middleware/auth';
import { AssetModel } from './model';
import { AssetService } from './service';
import { IngestService } from '../ingest/service';
import { orchestratePipeline } from '../ingest/pipeline';

export const assets = new Elysia({ prefix: '/api/assets' })
  .use(authMiddleware)
  .post(
    '/',
    async ({ body, session, set }) => {
      if (!session) {
        set.status = 401;
        return { message: 'Authentication required' };
      }
      return AssetService.create(session.user.id as UserId, body);
    },
    { body: AssetModel.create }
  )
  .get('/', async ({ session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }
    return AssetService.list(session.user.id as UserId);
  })
  .get('/:id', async ({ params, session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }
    const asset = await AssetService.getWithTranscript(params.id as AssetId, session.user.id as UserId);
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
      const updated = await AssetService.update(params.id as AssetId, session.user.id as UserId, body);
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
    const deleted = await AssetService.remove(params.id as AssetId, session.user.id as UserId);
    if (!deleted) {
      set.status = 404;
      return { message: 'Asset not found' };
    }
    return deleted;
  })
  .post('/:id/retry', async ({ params, session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }
    const asset = await AssetService.getById(params.id as AssetId, session.user.id as UserId);
    if (!asset) {
      set.status = 404;
      return { message: 'Asset not found' };
    }
    if (asset.status !== 'failed') {
      set.status = 409;
      return { message: 'Only failed assets can be retried' };
    }
    if (!asset.sourceUrl) {
      set.status = 422;
      return { message: 'Asset has no source URL to retry' };
    }

    await IngestService.resetForRetry(asset.id);

    // Fire-and-forget pipeline retry
    orchestratePipeline(asset.id, asset.sourceUrl);

    return { message: 'Retry started' };
  });
