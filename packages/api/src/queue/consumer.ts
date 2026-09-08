import { runIngestJob } from './ingest-worker';
import { runVisualJob } from './visual-worker';
import type { IngestJobData, VisualJobData } from './ingest-queue';

// ---------------------------------------------------------------------------
// CF Queues consumer (issue #32).
//
// The Worker `queue()` handler parses each batch message into a
// QueueMessage and runs it here. Checkpoint guards inside the runners
// (hasTranscriptSegments / hasEmbeddings) make at-least-once redelivery
// safe. Messages run sequentially so a throw fails the batch fast and
// Cloudflare redelivers the remainder.
//
// NOTE: attemptsMade starts at 0 because the batch envelope carries no
// retry counter — the first failure persists a "failed" status while a
// redelivery may still succeed (checkpoints resume it). The Workflows
// follow-up will carry proper step-retry counts.
// ---------------------------------------------------------------------------

export type QueueMessage =
  | { type: 'ingest'; data: IngestJobData }
  | { type: 'visual'; data: VisualJobData };

export function isQueueMessage(value: unknown): value is QueueMessage {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.type !== 'ingest' && record.type !== 'visual') return false;
  const data = record.data as Record<string, unknown> | null;
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.assetId === 'string' &&
    typeof data.userId === 'string'
  );
}

export async function handleQueueMessage(message: QueueMessage): Promise<void> {
  if (message.type === 'ingest') {
    await runIngestJob(message.data);
    return;
  }
  await runVisualJob(message.data);
}

export async function handleQueueBatch(messages: QueueMessage[]): Promise<void> {
  for (const message of messages) {
    await handleQueueMessage(message);
  }
}
