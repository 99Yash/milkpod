import { Elysia, status } from 'elysia';
import { authMacro } from '../../middleware/auth';
import { subscribeUserPokes } from '../../events/replicache-events';
import { fetchOutboxEvents, isEdgeRealtimeAvailable } from '../../events/realtime-outbox';
import { ReplicacheModel } from './model';
import { handlePull } from './pull';
import { handlePush } from './push';

export const replicache = new Elysia({ prefix: '/api/replicache' })
  .use(authMacro)
  .guard({ auth: true }, (app) =>
    app
      .post(
        '/pull',
        async ({ body, user }) => {
          const result = await handlePull(user.id, body);
          if ('forbidden' in result) {
            return status(403, {
              message: 'Client group is bound to another user',
            });
          }
          return result;
        },
        { body: ReplicacheModel.pull },
      )
      .post(
        '/push',
        async ({ body, user }) => {
          if (body.mutations.length > ReplicacheModel.MAX_MUTATIONS) {
            return status(413, {
              message: `Push exceeds ${ReplicacheModel.MAX_MUTATIONS} mutations`,
            });
          }
          const result = await handlePush(user.id, body);
          if ('forbidden' in result) {
            return status(403, {
              message: 'Client group is bound to another user',
            });
          }
          return result;
        },
        { body: ReplicacheModel.push },
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

            write(': connected\n\n');

            // Edge (Worker) path — poll the DB outbox (issue #33).
            // Own cursor over the shared table; asset-status rows are
            // skipped here but still advance the cursor.
            if (isEdgeRealtimeAvailable()) {
              let afterId = 0;
              let stopped = false;
              const poll = async () => {
                if (stopped) return;
                try {
                  const rows = await fetchOutboxEvents(userId, afterId);
                  for (const row of rows) {
                    afterId = Math.max(afterId, row.id);
                    if (row.kind !== 'poke') continue;
                    write(
                      `event: poke\ndata: ${JSON.stringify(row.payload)}\n\n`,
                    );
                  }
                } catch {
                  // transient DB error — next tick retries
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

            // Subscribe to this user's dedicated poke channel. The helper
            // owns the per-user Redis SUBSCRIBE/UNSUBSCRIBE lifecycle, so
            // this replica only receives pokes for users it actually serves.
            const unsubscribe = subscribeUserPokes(userId, (event) => {
              write(
                `event: poke\ndata: ${JSON.stringify({ assetId: event.assetId })}\n\n`,
              );
            });

            const heartbeat = setInterval(() => {
              write(': heartbeat\n\n');
            }, 30_000);

            write(': connected\n\n');

            cleanup = () => {
              unsubscribe();
              clearInterval(heartbeat);
            };
          },
          cancel() {
            cleanup?.();
          },
        });

        // `as Response` short-circuits Elysia's response-type inference, which
        // otherwise tries to portably name `Response` and fails because the
        // global is augmented by undici-types. Same idiom as assets/index.ts.
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        }) as Response;
      }),
  );
