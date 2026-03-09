import { Elysia, status } from 'elysia';
import { authMacro } from '../../middleware/auth';
import { AssetService } from '../assets/service';
import { generateComments } from './generate';
import { CommentModel } from './model';
import { CommentService } from './service';

export const comments = new Elysia({ prefix: '/api/comments' })
  .use(authMacro)
  .post(
    '/generate',
    async ({ body, user }) => {
      const asset = await AssetService.getById(body.assetId, user.id);
      if (!asset) return status(404, { message: 'Asset not found' });
      if (asset.status !== 'ready') {
        return status(422, {
          message: 'Asset is not ready for comment generation',
        });
      }

      if (body.regenerate) {
        await CommentService.deleteByAsset(body.assetId, user.id);
      } else {
        const existing = await CommentService.list(user.id, body.assetId);
        if (existing.length > 0) return existing;
      }

      return generateComments(body.assetId, user.id);
    },
    { auth: true, body: CommentModel.generate },
  )
  .get(
    '/',
    async ({ user, query }) => {
      const asset = await AssetService.getById(query.assetId, user.id);
      if (!asset) return status(404, { message: 'Asset not found' });

      return CommentService.list(user.id, query.assetId);
    },
    { auth: true, query: CommentModel.listQuery },
  )
  .post(
    '/:id/feedback',
    async ({ params, body, user }) => {
      const comment = await CommentService.getById(params.id, user.id);
      if (!comment) return status(404, { message: 'Comment not found' });

      if (body.action === 'dismiss') {
        const dismissed = await CommentService.dismissComment(
          params.id,
          user.id,
        );
        return dismissed ?? status(500, { message: 'Failed to dismiss' });
      }

      return comment;
    },
    { auth: true, body: CommentModel.feedback },
  );
