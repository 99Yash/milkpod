import {
  app,
  handleQueueBatch,
  isQueueMessage,
  runWithEdgeQueueContext,
  setEdgeDatabaseUrl,
} from '@milkpod/api';
import type { EdgeQueueContext, QueueMessage } from '@milkpod/api';

// Cloudflare Workers entry (Alchemy-managed; see alchemy.run.ts).
// Reuses the same Elysia `app` as Node, but without `@elysiajs/node`.
// Node-only bootstrapping (pg Pool warmup, BullMQ workers, Redis bridges)
// stays in `src/index.ts` and runs only on Railway/VPS, not on the edge.
//
// Bindings declared in `alchemy.run.ts`:
// - HYPERDRIVE → Neon Postgres (edge-aware db client)
// - UPLOAD_BUCKET → R2 manual uploads
// - INGEST_QUEUE / VISUAL_QUEUE → CF Queues producer bindings
//   (durable enqueue goes live with CF_QUEUE_PRODUCER=1, once a
//   consumer is attached — until then the in-process fallback runs)

interface QueueProducerEnv {
  send(message: unknown): Promise<void>;
}

interface WorkerEnv {
  HYPERDRIVE?: { connectionString: string };
  UPLOAD_BUCKET?: unknown;
  INGEST_QUEUE?: QueueProducerEnv;
  VISUAL_QUEUE?: QueueProducerEnv;
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
    const messages: QueueMessage[] = [];
    const pending: QueueBatchMessage[] = [];
    for (const msg of batch.messages) {
      if (!isQueueMessage(msg.body)) {
        console.warn('[queue] Dropping malformed message');
        msg.ack();
        continue;
      }
      messages.push(msg.body);
      pending.push(msg);
    }
    // Throwing redelivers the batch; checkpoints make that safe.
    await runWithEdgeQueueContext(ctx, () => handleQueueBatch(messages));
    for (const msg of pending) msg.ack();
  },
};

export type WorkerApp = typeof app;
