import { Elysia, status, t } from 'elysia';
import { authMacro } from '../../middleware/auth';
import { IngestModel } from './model';
import { IngestService } from './service';
import { AssetService } from '../assets/service';
import { resolveYouTubeMetadata } from './youtube';
import { orchestratePipeline, orchestrateUploadPipeline } from './pipeline';
import { isUploadStorageConfigured, storeUploadedMedia } from './upload-storage';

/** 100 MB */
const MAX_UPLOAD_SIZE = 100 * 1024 * 1024;

const ACCEPTED_MIME_PREFIXES = ['audio/', 'video/'] as const;

export const ingest = new Elysia({ prefix: '/api/ingest' })
  .use(authMacro)
  .post(
    '/',
    async ({ body, user }) => {
      const userId = user.id;

      // Resolve metadata synchronously — fail fast on bad URLs
      let metadata;
      try {
        metadata = await resolveYouTubeMetadata(body.url);
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

      // Fire-and-forget pipeline
      const strategy = body.transcriptionStrategy ?? 'audio-first';
      orchestratePipeline(asset.id, body.url, userId, strategy).catch((err) => {
        console.error(`Pipeline failed for asset ${asset.id}:`, err);
      });

      return asset;
    },
    { auth: true, body: IngestModel.ingest }
  )
  .post(
    '/upload',
    async ({ body, user }) => {
      const userId = user.id;
      const { file, title } = body;

      // Validate MIME type
      if (!ACCEPTED_MIME_PREFIXES.some((p) => file.type.startsWith(p))) {
        return status(422, {
          message: 'Unsupported file type. Please upload an audio or video file.',
        });
      }

      // Validate file size
      if (file.size > MAX_UPLOAD_SIZE) {
        return status(422, {
          message: `File too large. Maximum size is ${MAX_UPLOAD_SIZE / (1024 * 1024)}MB.`,
        });
      }

      const mediaType = file.type.startsWith('video/') ? 'video' as const : 'audio' as const;
      const assetTitle = title?.trim() || file.name.replace(/\.[^.]+$/, '');

      if (!isUploadStorageConfigured()) {
        return status(503, {
          message: 'Upload storage is not configured on the server.',
        });
      }

      let storedUpload;
      try {
        storedUpload = await storeUploadedMedia({ file, userId });
      } catch (error) {
        console.error('[ingest] Failed to persist upload before pipeline start:', error);
        return status(500, { message: 'Failed to store uploaded file' });
      }

      const asset = await AssetService.create(userId, {
        title: assetTitle,
        sourceUrl: storedUpload.canonicalUrl,
        sourceType: 'upload',
        mediaType,
        sourceId: storedUpload.key,
      });

      if (!asset) {
        return status(500, { message: 'Failed to create asset' });
      }

      // Fire-and-forget pipeline
      orchestrateUploadPipeline(asset.id, storedUpload.canonicalUrl, userId, mediaType).catch((err) => {
        console.error(`Upload pipeline failed for asset ${asset.id}:`, err);
      });

      return asset;
    },
    {
      auth: true,
      body: t.Object({
        file: t.File(),
        title: t.Optional(t.String()),
      }),
    }
  );
