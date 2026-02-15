import { Elysia, status } from 'elysia';
import { authMacro } from '../../middleware/auth';
import { IngestModel } from './model';
import { IngestService } from './service';
import { AssetService } from '../assets/service';
import { resolveMetadata } from './ytdlp';
import { orchestratePipeline } from './pipeline';

export const ingest = new Elysia({ prefix: '/api/ingest' })
  .use(authMacro)
  .post(
    '/',
    async ({ body, user }) => {
      const userId = user.id;

      // Resolve metadata synchronously — fail fast on bad URLs
      let metadata;
      try {
        metadata = await resolveMetadata(body.url);
      } catch {
        return status(422, { message: 'Could not resolve video metadata. Check the URL.' });
      }

      // Idempotency: check if this video was already ingested
      const existing = await IngestService.findBySourceId(
        metadata.id,
        userId
      );
      if (existing) {
        return existing;
      }

      // Create asset
      const asset = await AssetService.create(userId, {
        title: metadata.title,
        sourceUrl: metadata.webpage_url,
        sourceType: 'youtube',
        mediaType: 'video',
        channelName: metadata.channel,
        thumbnailUrl: metadata.thumbnail,
        sourceId: metadata.id,
      });

      if (!asset) {
        return status(500, { message: 'Failed to create asset' });
      }

      // Update duration
      if (metadata.duration) {
        await IngestService.updateStatus(asset.id, 'queued', {
          duration: metadata.duration,
        });
      }

      // Fire-and-forget pipeline
      orchestratePipeline(asset.id, body.url, userId);

      return asset;
    },
    { auth: true, body: IngestModel.ingest }
  );
