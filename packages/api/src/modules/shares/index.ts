import { Elysia } from 'elysia';
import type { AssetId, CollectionId, ShareLinkId, UserId } from '@milkpod/db/helpers';
import { authMiddleware } from '../../middleware/auth';
import { ShareModel } from './model';
import { ShareService } from './service';
import { AssetService } from '../assets/service';
import { CollectionService } from '../collections/service';

export const shares = new Elysia({ prefix: '/api/shares' })
  .use(authMiddleware)
  // Create a share link
  .post(
    '/',
    async ({ body, session, set }) => {
      if (!session) {
        set.status = 401;
        return { message: 'Authentication required' };
      }

      const userId = session.user.id as UserId;

      // Must scope to exactly one of asset or collection
      if (!body.assetId && !body.collectionId) {
        set.status = 400;
        return { message: 'Either assetId or collectionId is required' };
      }
      if (body.assetId && body.collectionId) {
        set.status = 400;
        return { message: 'Provide either assetId or collectionId, not both' };
      }

      // Verify ownership of the resource being shared
      if (body.assetId) {
        const asset = await AssetService.getById(body.assetId as AssetId, userId);
        if (!asset) {
          set.status = 403;
          return { message: 'Access denied to asset' };
        }
      }
      if (body.collectionId) {
        const collection = await CollectionService.getById(
          body.collectionId as CollectionId,
          userId
        );
        if (!collection) {
          set.status = 403;
          return { message: 'Access denied to collection' };
        }
      }

      return ShareService.create(userId, body);
    },
    { body: ShareModel.create }
  )
  // List user's active share links
  .get('/', async ({ session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }
    return ShareService.list(session.user.id as UserId);
  })
  // Revoke a share link
  .delete('/:id', async ({ params, session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }
    const revoked = await ShareService.revoke(
      params.id as ShareLinkId,
      session.user.id as UserId
    );
    if (!revoked) {
      set.status = 404;
      return { message: 'Share link not found or already revoked' };
    }
    return revoked;
  })
  // Validate a share token (public endpoint — no auth required)
  .get('/validate/:token', async ({ params, set }) => {
    const result = await ShareService.getSharedResource(params.token);
    if (!result) {
      set.status = 404;
      return { message: 'Invalid or expired share link' };
    }
    return {
      type: result.type,
      resource: result.resource,
      canQuery: result.link.canQuery,
      expiresAt: result.link.expiresAt,
    };
  });
