import { Elysia, status, t } from 'elysia';
import { authMacro } from '../../middleware/auth';
import { AssetModel } from './model';
import { AssetService } from './service';
import { TranscriptSearchService } from './search-service';
import { IngestService } from '../ingest/service';
import { orchestratePipeline } from '../ingest/pipeline';
import { assetEvents, type AssetStatusEvent } from '../../events/asset-events';

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
      const asset = await AssetService.getById(params.id, user.id);
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
        q: t.String({ minLength: 1 }),
        limit: t.Optional(t.String()),
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
  .delete('/:id', async ({ params, user }) => {
    const deleted = await AssetService.remove(params.id, user.id);
    if (!deleted) return status(404, { message: 'Asset not found' });
    return deleted;
  }, { auth: true })
  .post('/:id/retry', async ({ params, user }) => {
    const asset = await AssetService.getById(params.id, user.id);
    if (!asset) return status(404, { message: 'Asset not found' });
    if (asset.status !== 'failed') {
      return status(409, { message: 'Only failed assets can be retried' });
    }
    if (!asset.sourceUrl) {
      return status(422, { message: 'Asset has no source URL to retry' });
    }

    await IngestService.resetForRetry(asset.id);

    // Fire-and-forget pipeline retry
    orchestratePipeline(asset.id, asset.sourceUrl, user.id).catch((err) => {
      console.error(`Pipeline failed for asset ${asset.id}:`, err);
    });

    return { message: 'Retry started' };
  }, { auth: true });
