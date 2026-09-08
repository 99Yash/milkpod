import { AsyncLocalStorage } from 'node:async_hooks';

// ---------------------------------------------------------------------------
// Edge queue context — bridges Cloudflare Queue bindings into the
// backend-agnostic enqueue path without threading `env` through every
// Elysia handler (issue #32).
//
// The Worker entry (apps/server/src/worker.ts) wraps each invocation in
// runWithEdgeQueueContext(); enqueue helpers read it via
// getEdgeQueueContext(). On Node the store is empty and BullMQ is used.
// ---------------------------------------------------------------------------

/** Minimal structural type for a CF Queue producer binding. */
export interface QueueProducerBinding {
  send(message: unknown): Promise<void>;
}

export interface EdgeQueueContext {
  ingestQueue?: QueueProducerBinding;
  visualQueue?: QueueProducerBinding;
  /**
   * Master switch: only send to CF Queues once a consumer is live
   * (CF_QUEUE_PRODUCER=1). Otherwise messages would pile up with
   * nothing draining them while the in-process fallback is skipped.
   */
  queueProducerEnabled: boolean;
}

const storage = new AsyncLocalStorage<EdgeQueueContext>();

export function runWithEdgeQueueContext<T>(
  ctx: EdgeQueueContext,
  fn: () => T,
): T {
  return storage.run(ctx, fn);
}

export function getEdgeQueueContext(): EdgeQueueContext | undefined {
  return storage.getStore();
}
