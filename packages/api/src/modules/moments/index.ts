import { Elysia, status } from 'elysia';
import { authMacro } from '../../middleware/auth';
import { AssetService } from '../assets/service';
import { generateMoments } from './generate';
import { MomentModel } from './model';
import { MomentService } from './service';

export const moments = new Elysia({ prefix: '/api/moments' })
  .use(authMacro)
  .post(
    '/generate',
    async ({ body, user }) => {
      const asset = await AssetService.getById(body.assetId, user.id);
      if (!asset) return status(404, { message: 'Asset not found' });
      if (asset.status !== 'ready') {
        return status(422, { message: 'Asset is not ready for moment extraction' });
      }

      if (body.regenerate) {
        await MomentService.deleteByAssetAndPreset(
          body.assetId,
          user.id,
          body.preset,
        );
      } else {
        const existing = await MomentService.list(
          user.id,
          body.assetId,
          body.preset,
        );
        if (existing.length > 0) return existing;
      }

      return generateMoments(body.assetId, user.id, body.preset);
    },
    { auth: true, body: MomentModel.generate },
  )
  .get(
    '/',
    async ({ user, query }) => {
      const asset = await AssetService.getById(query.assetId, user.id);
      if (!asset) return status(404, { message: 'Asset not found' });

      return MomentService.list(
        user.id,
        query.assetId,
        query.preset as Parameters<typeof MomentService.list>[2],
      );
    },
    { auth: true, query: MomentModel.listQuery },
  )
  .post(
    '/:id/feedback',
    async ({ params, body, user }) => {
      const moment = await MomentService.getById(params.id, user.id);
      if (!moment) return status(404, { message: 'Moment not found' });

      if (body.action === 'save') {
        await MomentService.saveMoment(params.id, user.id);
      } else if (body.action === 'dismiss') {
        await MomentService.dismissMoment(params.id, user.id);
      }

      const feedback = await MomentService.addFeedback(
        params.id,
        user.id,
        body.action,
      );
      if (!feedback) return status(500, { message: 'Failed to record feedback' });
      return feedback;
    },
    { auth: true, body: MomentModel.feedback },
  );
