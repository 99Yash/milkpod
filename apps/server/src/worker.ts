import {
  app,
  handleQueueMessage,
  isQueueMessage,
  runWithEdgeQueueContext,
  setEdgeDatabaseUrl,
} from '@milkpod/api';
import type {
  EdgeQueueContext,
  IngestJobData,
  QueueMessage,
  VisualJobData,
} from '@milkpod/api';
import { IngestWorkflow, VisualWorkflow } from './workflows';

// Workflow entrypoints must be named exports of the worker bundle —
// workerd resolves `className` (see `alchemy.run.ts`) against them.
export { IngestWorkflow, VisualWorkflow };

// Cloudflare Workers entry (Alchemy-managed; see alchemy.run.ts).
// Reuses the same Elysia `app` as Node, but without `@elysiajs/node`.
// Node-only bootstrapping (pg Pool warmup, BullMQ workers, Redis bridges)
// stays in `src/index.ts` and runs only on Railway/VPS, not on the edge.
//
// Bindings declared in `alchemy.run.ts`:
// - HYPERDRIVE → Neon Postgres (edge-aware db client)
// - UPLOAD_BUCKET → R2 manual uploads
// - INGEST_QUEUE / VISUAL_QUEUE → CF Queues producer bindings
//   (durable enqueue goes live with CF_QUEUE_PRODUCER=1, once the
//   queue consumers below are attached)
// - INGEST_WORKFLOW / VISUAL_WORKFLOW → durable step-retry runtime for
//   long ingest jobs (issue #42)

interface QueueProducerEnv {
  send(message: unknown): Promise<void>;
}

interface WorkflowBinding<P = unknown> {
  create(options: { id?: string; params?: P }): Promise<{ id: string }>;
}

interface WorkerEnv {
  HYPERDRIVE?: { connectionString: string };
  UPLOAD_BUCKET?: unknown;
  INGEST_QUEUE?: QueueProducerEnv;
  VISUAL_QUEUE?: QueueProducerEnv;
  INGEST_WORKFLOW?: WorkflowBinding<IngestJobData>;
  VISUAL_WORKFLOW?: WorkflowBinding<VisualJobData>;
  CF_QUEUE_PRODUCER?: string;
  NODE_ENV?: string;
}

interface QueueBatchMessage {
  body: unknown;
  ack(): void;
  retry(): void;
}

interface QueueBatch {
  messages: QueueBatchMessage[];
}

function edgeContextFromEnv(env: WorkerEnv): EdgeQueueContext {
  const hyperdriveConn = env.HYPERDRIVE?.connectionString;
  if (hyperdriveConn) {
    setEdgeDatabaseUrl(hyperdriveConn);
  }
  return {
    ingestQueue: env.INGEST_QUEUE,
    visualQueue: env.VISUAL_QUEUE,
    queueProducerEnabled: env.CF_QUEUE_PRODUCER === '1',
  };
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const ctx = edgeContextFromEnv(env);
    return runWithEdgeQueueContext(ctx, () => app.handle(request));
  },

  async queue(batch: QueueBatch, env: WorkerEnv): Promise<void> {
    const ctx = edgeContextFromEnv(env);
    await runWithEdgeQueueContext(ctx, async () => {
      // Dispatch each message to its Workflow (issue #42). Queue-consumer
      // invocations have tight CPU limits; transcription/embedding run for
      // minutes, so workflows provide the durable step-retry runtime.
      // Per-message ack keeps a single bad message from redelivering the
      // whole batch; checkpoint guards make redelivery safe.
      for (const msg of batch.messages) {
        if (!isQueueMessage(msg.body)) {
          console.warn('[queue] Dropping malformed message');
          msg.ack();
          continue;
        }
        try {
          const message: QueueMessage = msg.body;
          if (message.type === 'ingest') {
            if (env.INGEST_WORKFLOW) {
              await env.INGEST_WORKFLOW.create({ params: message.data });
            } else {
              // No workflow binding (alchemy dev / pre-consumer deploy):
              // run inline in the consumer, as before.
              await handleQueueMessage(message);
            }
          } else if (env.VISUAL_WORKFLOW) {
            await env.VISUAL_WORKFLOW.create({ params: message.data });
          } else {
            await handleQueueMessage(message);
          }
          msg.ack();
        } catch (error) {
          console.error(
            '[queue] Dispatch failed, scheduling retry:',
            error instanceof Error ? error.message : String(error),
          );
          msg.retry();
        }
      }
    });
  },
};

export type WorkerApp = typeof app;
