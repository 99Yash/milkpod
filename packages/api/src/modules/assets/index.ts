import { Elysia, status, t } from 'elysia';
import { authMacro } from '../../middleware/auth';
import { AssetModel } from './model';
import { AssetService } from './service';
import { TranscriptSearchService } from './search-service';
import { IngestService } from '../ingest/service';
import {
  orchestrateExternalPipeline,
  orchestratePipeline,
  orchestrateUploadPipeline,
} from '../ingest/pipeline';
import { assetEvents, emitAssetStatus, type AssetStatusEvent } from '../../events/asset-events';
import { fetchOutboxEvents, isEdgeRealtimeAvailable } from '../../events/realtime-outbox';
import { deleteStoredUpload } from '../ingest/upload-storage';
import { isProcessingStatus, STALE_ASSET_THRESHOLD_MS } from '../../types';
import { isQueueEnabled } from '../../queue/connection';
import { enqueueIngestJob } from '../../queue/ingest-queue';

export const assets = new Elysia({ prefix: '/api/assets' })
  .use(authMacro)
  .post(
    '/',
    async ({ body, user }) => {
      return AssetService.create(user.id, body);
    },
    { auth: true, body: AssetModel.create }
  )
  .get(
    '/',
    async ({ user, query }) => {
      if (query.paginate === 'true') {
        const limit = query.limit
          ? Math.min(Math.max(Number(query.limit) || 12, 1), 100)
          : 12;

        return AssetService.listPage(user.id, query, limit);
      }

      const hasFilters = query.q || query.status || query.sourceType;
      if (hasFilters) {
        return AssetService.search(user.id, query);
      }
      return AssetService.list(user.id);
    },
    { auth: true, query: AssetModel.listQuery }
  )
  .get('/events', ({ user }) => {
    const userId = user.id;

    const encoder = new TextEncoder();
    let cleanup: (() => void) | undefined;

    const stream = new ReadableStream({
      start(controller) {
        const write = (text: string) => {
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            // stream already closed
          }
        };

        // Send initial comment so client knows connection is alive
        write(': connected\n\n');

        // Edge (Worker) path: isolates share no memory and Redis is
        // absent, so poll the DB outbox (issue #33). The poll is the
        // sole delivery path here — no local subscription, so events
        // are never delivered twice.
        if (isEdgeRealtimeAvailable()) {
          let afterId = 0;
          let stopped = false;
          const poll = async () => {
            if (stopped) return;
            try {
              const rows = await fetchOutboxEvents(userId, afterId);
              for (const row of rows) {
                // Cursor advances over every row (including pokes, which
                // this stream ignores) — the replicache stream keeps its
                // own cursor over the same table.
                afterId = Math.max(afterId, row.id);
                if (row.kind !== 'asset-status') continue;
                write(`data: ${JSON.stringify(row.payload)}\n\n`);
              }
            } catch {
              // transient DB error — keep the stream open; the next
              // tick retries and the client polls as a last resort
            }
          };
          const poller = setInterval(() => void poll(), 1000);
          void poll();
          const heartbeat = setInterval(() => {
            write(': heartbeat\n\n');
          }, 30_000);

          cleanup = () => {
            stopped = true;
            clearInterval(poller);
            clearInterval(heartbeat);
          };
          return;
        }

        const listener = (event: AssetStatusEvent) => {
          if (event.userId !== userId) return;
          const data = JSON.stringify({
            assetId: event.assetId,
            status: event.status,
            message: event.message,
            progress: event.progress,
          });
          write(`data: ${data}\n\n`);
        };

        assetEvents.on('status', listener);

        const heartbeat = setInterval(() => {
          write(': heartbeat\n\n');
        }, 30_000);

        // Send initial comment so client knows connection is alive
        write(': connected\n\n');

        cleanup = () => {
          assetEvents.off('status', listener);
          clearInterval(heartbeat);
        };
      },
      cancel() {
        cleanup?.();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    }) as Response;
  }, { auth: true })
  .get('/:id', async ({ params, user }) => {
    const asset = await AssetService.getWithTranscript(params.id, user.id);
    if (!asset) return status(404, { message: 'Asset not found' });
    return asset;
  }, { auth: true })
  .get(
    '/:id/search',
    async ({ params, query, user }) => {
      const asset = await AssetService.getByIdAsMember(params.id, user.id);
      if (!asset) return status(404, { message: 'Asset not found' });
      const limit = query.limit ? Math.min(Math.max(Number(query.limit) || 50, 1), 100) : undefined;
      return TranscriptSearchService.search(
        params.id,
        query.q,
        limit
      );
    },
    {
      auth: true,
      query: t.Object({
        q: t.String({ minLength: 1, maxLength: 200 }),
        limit: t.Optional(t.String({ maxLength: 10 })),
      }),
    }
  )
  .patch(
    '/:id',
    async ({ params, body, user }) => {
      const updated = await AssetService.update(params.id, user.id, body);
      if (!updated) return status(404, { message: 'Asset not found' });
      return updated;
    },
    { auth: true, body: AssetModel.update }
  )
  .patch(
    '/:id/speakers',
    async ({ params, body, user }) => {
      const asset = await AssetService.getById(params.id, user.id);
      if (!asset) return status(404, { message: 'Asset not found' });

      const speakerNames = await AssetService.updateSpeakerNames(
        params.id,
        body.speakerNames,
      );

      if (!speakerNames) {
        return status(404, { message: 'Transcript not found' });
      }

      return { speakerNames };
    },
    { auth: true, body: AssetModel.speakerNamesUpdate }
  )
  .delete('/:id', async ({ params, user }) => {
    const deleted = await AssetService.remove(params.id, user.id);
    if (!deleted) return status(404, { message: 'Asset not found' });

    if (deleted.sourceType === 'upload' && deleted.sourceUrl) {
      deleteStoredUpload(deleted.sourceUrl).catch((err) => {
        console.warn(
          `[assets] Failed to delete stored upload for ${deleted.id}:`,
          err instanceof Error ? err.message : String(err)
        );
      });
    }

    return deleted;
  }, { auth: true })
  .post('/:id/retry', async ({ params, user }) => {
    const asset = await AssetService.getById(params.id, user.id);
    if (!asset) return status(404, { message: 'Asset not found' });
    const isStaleProcessing =
      isProcessingStatus(asset.status) &&
      asset.updatedAt != null &&
      Date.now() - new Date(asset.updatedAt).getTime() > STALE_ASSET_THRESHOLD_MS;

    const isRetryable =
      asset.status === 'failed' ||
      asset.status === 'queued' ||
      isStaleProcessing;

    if (!isRetryable) {
      return status(409, { message: 'Only failed, queued, or stale assets can be retried' });
    }
    if (asset.sourceType === 'podcast') {
      return status(409, {
        message: 'Podcast assets must be retried from the podcast episode ingest flow.',
      });
    }
    if (!asset.sourceUrl) {
      return status(422, { message: 'Asset has no source URL to retry' });
    }

    await IngestService.resetForRetry(asset.id);
    emitAssetStatus(user.id, asset.id, 'queued', 'Retrying...');

    if (isQueueEnabled()) {
      try {
        await enqueueIngestJob({
          assetId: asset.id,
          sourceUrl: asset.sourceUrl,
          userId: user.id,
          sourceType: asset.sourceType === 'youtube' ? 'youtube' : asset.sourceType === 'upload' ? 'upload' : 'external',
          mediaType: asset.mediaType,
        });
        return { message: 'Retry started' };
      } catch (err) {
        console.error(`[retry] Failed to enqueue job for ${asset.id}, falling back to in-process:`, err instanceof Error ? err.message : String(err));
        // Fall through to fire-and-forget below
      }
    }

    // Fallback: fire-and-forget when Redis is unavailable or enqueue failed
    if (asset.sourceType === 'upload') {
      orchestrateUploadPipeline(asset.id, asset.sourceUrl, user.id, asset.mediaType).catch((err) => {
        console.error(`Upload pipeline failed for asset ${asset.id}:`, err instanceof Error ? err.message : String(err));
      });
      return { message: 'Retry started' };
    }

    if (asset.sourceType === 'youtube') {
      orchestratePipeline(asset.id, asset.sourceUrl, user.id).catch((err) => {
        console.error(`Pipeline failed for asset ${asset.id}:`, err instanceof Error ? err.message : String(err));
      });
      return { message: 'Retry started' };
    }

    orchestrateExternalPipeline(asset.id, asset.sourceUrl, user.id, asset.mediaType).catch((err) => {
      console.error(`Pipeline failed for asset ${asset.id}:`, err instanceof Error ? err.message : String(err));
    });

    return { message: 'Retry started' };
  }, { auth: true });
