import { Elysia } from 'elysia';
import { authMiddleware } from '../../middleware/auth';
import { AssetModel } from './model';
import { AssetService } from './service';
import { IngestService } from '../ingest/service';
import { orchestratePipeline } from '../ingest/pipeline';
import { assetEvents, type AssetStatusEvent } from '../../events/asset-events';

export const assets = new Elysia({ prefix: '/api/assets' })
  .use(authMiddleware)
  .post(
    '/',
    async ({ body, session, set }) => {
      if (!session) {
        set.status = 401;
        return { message: 'Authentication required' };
      }
      return AssetService.create(session.user.id, body);
    },
    { body: AssetModel.create }
  )
  .get(
    '/',
    async ({ session, set, query }) => {
      if (!session) {
        set.status = 401;
        return { message: 'Authentication required' };
      }
      const hasFilters = query.q || query.status || query.sourceType;
      if (hasFilters) {
        return AssetService.search(session.user.id, query);
      }
      return AssetService.list(session.user.id);
    },
    { query: AssetModel.listQuery }
  )
  .get('/events', ({ session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }

    const userId = session.user.id;

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
  })
  .get('/:id', async ({ params, session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }
    const asset = await AssetService.getWithTranscript(params.id, session.user.id);
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
      const updated = await AssetService.update(params.id, session.user.id, body);
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
    const deleted = await AssetService.remove(params.id, session.user.id);
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
    const asset = await AssetService.getById(params.id, session.user.id);
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
    orchestratePipeline(asset.id, asset.sourceUrl, session.user.id);

    return { message: 'Retry started' };
  });
