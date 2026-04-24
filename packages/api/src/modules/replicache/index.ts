import { Elysia, status, t } from 'elysia';
import { authMacro } from '../../middleware/auth';
import { subscribeUserPokes } from '../../events/replicache-events';
import { handlePull, type PullRequestBody } from './pull';
import { handlePush, type PushRequestBody } from './push';

export const replicache = new Elysia({ prefix: '/api/replicache' })
  .use(authMacro)
  .post(
    '/pull',
    async ({ body, user }) => {
      const result = await handlePull(user.id, body as PullRequestBody);
      if ('forbidden' in result) {
        return status(403, {
          message: 'Client group is bound to another user',
        });
      }
      return result;
    },
    {
      auth: true,
      body: t.Object({
        pullVersion: t.Literal(1),
        clientGroupID: t.String({ minLength: 1, maxLength: 200 }),
        cookie: t.Nullable(t.Number()),
        profileID: t.Optional(t.String()),
        schemaVersion: t.Optional(t.String()),
      }),
    },
  )
  .post(
    '/push',
    async ({ body, user }) => {
      const result = await handlePush(user.id, body as PushRequestBody);
      if ('forbidden' in result) {
        return status(403, {
          message: 'Client group is bound to another user',
        });
      }
      return result;
    },
    {
      auth: true,
      body: t.Object({
        pushVersion: t.Literal(1),
        clientGroupID: t.String({ minLength: 1, maxLength: 200 }),
        mutations: t.Array(
          t.Object({
            id: t.Number(),
            clientID: t.String(),
            name: t.String(),
            args: t.Unknown(),
            timestamp: t.Number(),
          }),
        ),
        profileID: t.Optional(t.String()),
        schemaVersion: t.Optional(t.String()),
      }),
    },
  )
  .get(
    '/events',
    ({ user }) => {
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

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      }) as Response;
    },
    { auth: true },
  );
