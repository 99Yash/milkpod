import { Elysia, status } from 'elysia';
import { authMacro } from '../../middleware/auth';
import { AssetModel } from './model';
import { AssetService } from './service';
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
    orchestratePipeline(asset.id, asset.sourceUrl, user.id);

    return { message: 'Retry started' };
  }, { auth: true });
