import { Elysia, status, t } from 'elysia';
import { authMacro } from '../../middleware/auth';
import { IngestModel } from './model';
import { IngestService } from './service';
import { AssetService } from '../assets/service';
import { resolveUrlSource } from './url-source';
import {
  orchestrateExternalPipeline,
  orchestratePipeline,
  orchestrateUploadPipeline,
} from './pipeline';
import { isUploadStorageConfigured, storeUploadedMedia } from './upload-storage';
import { QuotaService } from '../quota/service';
import { isAdminEmail } from '../usage/service';
import { toSafeErrorMessage } from './error-message';
import { isQueueEnabled } from '../../queue/connection';
import { enqueueIngestJob } from '../../queue/ingest-queue';

/** 2 GB */
const MAX_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024;

const ACCEPTED_MIME_PREFIXES = ['audio/', 'video/'] as const;

async function checkVideoQuota(userId: string, email: string) {
  if (isAdminEmail(email)) return null;
  const quota = await QuotaService.checkQuota(userId, 'video_minutes');
  if (quota.allowed) return null;
  return status(402, {
    message: 'Monthly video processing limit reached. Upgrade your plan for more minutes.',
    code: 'QUOTA_EXCEEDED',
    unit: quota.unit,
    used: quota.used,
    limit: quota.limit,
  });
}

function fireAndForgetPipeline(
  assetId: string,
  sourceType: 'youtube' | 'external',
  sourceUrl: string,
  userId: string,
  strategy: IngestModel.Ingest['transcriptionStrategy'],
  mediaType: 'audio' | 'video',
) {
  if (sourceType === 'youtube') {
    orchestratePipeline(assetId, sourceUrl, userId, strategy ?? 'audio-first').catch((err) => {
      console.error(`Pipeline failed for asset ${assetId}:`, toSafeErrorMessage(err));
    });
    return;
  }

  orchestrateExternalPipeline(assetId, sourceUrl, userId, mediaType, strategy ?? 'audio-first').catch((err) => {
    console.error(`Pipeline failed for asset ${assetId}:`, toSafeErrorMessage(err));
  });
}

function startUrlIngestPipeline(
  assetId: string,
  sourceType: 'youtube' | 'external',
  sourceUrl: string,
  userId: string,
  strategy: IngestModel.Ingest['transcriptionStrategy'],
  mediaType: 'audio' | 'video',
) {
  if (isQueueEnabled()) {
    enqueueIngestJob({
      assetId,
      sourceUrl,
      userId,
      sourceType,
      mediaType,
      transcriptionStrategy: strategy ?? 'audio-first',
    }).catch((err) => {
      console.error(`Failed to enqueue job for ${assetId}, falling back to in-process:`, toSafeErrorMessage(err));
      fireAndForgetPipeline(assetId, sourceType, sourceUrl, userId, strategy, mediaType);
    });
    return;
  }

  fireAndForgetPipeline(assetId, sourceType, sourceUrl, userId, strategy, mediaType);
}

export const ingest = new Elysia({ prefix: '/api/ingest' })
  .use(authMacro)
  .post(
    '/',
    async ({ body, user }) => {
      const userId = user.id;

      // Resolve metadata synchronously — fail fast on bad URLs
      let metadata: Awaited<ReturnType<typeof resolveUrlSource>>;
      try {
        metadata = await resolveUrlSource(body.url);
      } catch (error) {
        return status(422, {
          message: toSafeErrorMessage(error) || 'Could not resolve media metadata. Check the URL.',
        });
      }

      // Idempotency: check if this video was already ingested
      const existing = await IngestService.findBySourceId(
        metadata.sourceId,
        userId
      );
      if (existing) {
        if (existing.status === 'ready' && existing.sourceUrl) {
          const hasTranscript = await AssetService.hasTranscriptSegments(existing.id);

          if (!hasTranscript) {
            await IngestService.resetForRetry(existing.id);

            startUrlIngestPipeline(
              existing.id,
              existing.sourceType === 'youtube' ? 'youtube' : 'external',
              existing.sourceUrl ?? metadata.sourceUrl,
              userId,
              body.transcriptionStrategy,
              existing.mediaType,
            );

            return {
              ...existing,
              status: 'queued',
              attempts: 0,
              lastError: null,
            };
          }
        }

        return existing;
      }

      const quotaError = await checkVideoQuota(userId, user.email);
      if (quotaError) return quotaError;

      // Create asset
      const asset = await AssetService.create(userId, {
        title: metadata.title,
        sourceUrl: metadata.sourceUrl,
        sourceType: metadata.sourceType,
        mediaType: metadata.mediaType,
        channelName: metadata.channelName,
        thumbnailUrl: metadata.thumbnailUrl,
        sourceId: metadata.sourceId,
      });

      if (!asset) {
        return status(500, { message: 'Failed to create asset' });
      }

      // Fire-and-forget pipeline
      startUrlIngestPipeline(
        asset.id,
        metadata.sourceType,
        metadata.sourceUrl,
        userId,
        body.transcriptionStrategy,
        metadata.mediaType,
      );

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

      const quotaError = await checkVideoQuota(userId, user.email);
      if (quotaError) return quotaError;

      let storedUpload;
      try {
        storedUpload = await storeUploadedMedia({ file, userId });
      } catch (error) {
        console.error('[ingest] Failed to persist upload before pipeline start:', toSafeErrorMessage(error));
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

      // Enqueue via BullMQ when Redis is available, otherwise fire-and-forget
      const startUploadFallback = () => {
        orchestrateUploadPipeline(asset.id, storedUpload.canonicalUrl, userId, mediaType).catch((err) => {
          console.error(`Upload pipeline failed for asset ${asset.id}:`, toSafeErrorMessage(err));
        });
      };

      if (isQueueEnabled()) {
        enqueueIngestJob({
          assetId: asset.id,
          sourceUrl: storedUpload.canonicalUrl,
          userId,
          sourceType: 'upload',
          mediaType,
        }).catch((err) => {
          console.error(`Failed to enqueue upload job for ${asset.id}, falling back to in-process:`, toSafeErrorMessage(err));
          startUploadFallback();
        });
      } else {
        startUploadFallback();
      }

      return asset;
    },
    {
      auth: true,
      body: t.Object({
        file: t.File(),
        title: t.Optional(t.String({ maxLength: 200 })),
      }),
    }
  );
