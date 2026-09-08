import { Queue } from 'bullmq';
import { createRedisConnection, isQueueEnabled } from './connection';
import { getEdgeQueueContext } from './edge-context';
import type { TranscriptionStrategy } from '../modules/ingest/model';

// ---------------------------------------------------------------------------
// Job data types
// ---------------------------------------------------------------------------

export interface IngestJobData {
  assetId: string;
  sourceUrl: string;
  userId: string;
  sourceType: 'youtube' | 'external' | 'upload';
  mediaType: 'audio' | 'video';
  transcriptionStrategy?: TranscriptionStrategy;
}

export interface VisualJobData {
  assetId: string;
  sourceUrl: string;
  userId: string;
  duration: number;
  requiresDirectVideoUrl?: boolean;
}

// ---------------------------------------------------------------------------
// Retry budgets (mirrored in defaultJobOptions below)
// ---------------------------------------------------------------------------

export const INGEST_MAX_ATTEMPTS = 3;
export const VISUAL_MAX_ATTEMPTS = 2;

// ---------------------------------------------------------------------------
// Queue instances (created lazily on first enqueue)
// ---------------------------------------------------------------------------

let _ingestQueue: Queue<IngestJobData> | undefined;
let _visualQueue: Queue<VisualJobData> | undefined;

export function getIngestQueue(): Queue<IngestJobData> {
  if (!_ingestQueue) {
    _ingestQueue = new Queue<IngestJobData>('ingest-pipeline', {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: INGEST_MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 3_600 },   // keep completed jobs 1h
        removeOnFail: { age: 604_800 },      // keep failed jobs 7d
      },
    });
  }
  return _ingestQueue;
}

export function getVisualQueue(): Queue<VisualJobData> {
  if (!_visualQueue) {
    _visualQueue = new Queue<VisualJobData>('visual-context', {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: VISUAL_MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: 15_000 },
        removeOnComplete: { age: 3_600 },
        removeOnFail: { age: 604_800 },
      },
    });
  }
  return _visualQueue;
}

// ---------------------------------------------------------------------------
// Enqueue helpers — backend-agnostic: CF Queue when the Worker provides a
// binding (and the producer flag is on), else BullMQ on Node, else no-op
// with the caller falling back to in-process orchestration.
// ---------------------------------------------------------------------------

/**
 * Try the edge (CF Queue) backend. Returns true when the job was accepted
 * for durable delivery — the caller must not run any fallback then.
 */
async function tryEnqueueEdge(
  kind: 'ingest' | 'visual',
  data: IngestJobData | VisualJobData,
): Promise<boolean> {
  const ctx = getEdgeQueueContext();
  const binding = kind === 'ingest' ? ctx?.ingestQueue : ctx?.visualQueue;
  if (!binding || !ctx?.queueProducerEnabled) return false;
  await binding.send({ type: kind, data });
  return true;
}

export async function enqueueIngestJob(data: IngestJobData): Promise<void> {
  if (await tryEnqueueEdge('ingest', data)) return;
  if (!isQueueEnabled()) return;

  const jobId = `ingest_${data.assetId}`;
  const queue = getIngestQueue();

  // Remove any stale completed/failed job for this asset so we can re-use the jobId.
  // If the job is still active/waiting/delayed, skip — it's already being processed.
  try {
    const existing = await queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'completed' || state === 'failed') {
        await existing.remove();
      } else if (state === 'active' || state === 'waiting' || state === 'delayed') {
        return;
      }
    }
  } catch {
    // Job doesn't exist or already removed — safe to continue
  }

  await queue.add('ingest', data, { jobId });
}

export async function enqueueVisualJob(data: VisualJobData): Promise<void> {
  if (await tryEnqueueEdge('visual', data)) return;
  if (!isQueueEnabled()) return;

  const jobId = `visual_${data.assetId}`;
  const queue = getVisualQueue();

  try {
    const existing = await queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'completed' || state === 'failed') {
        await existing.remove();
      } else if (state === 'active' || state === 'waiting' || state === 'delayed') {
        return;
      }
    }
  } catch {
    // safe to continue
  }

  await queue.add('visual', data, { jobId });
}

/** Close queue connections (call during shutdown, before closeRedis). */
export async function closeQueues(): Promise<void> {
  await Promise.all([
    _ingestQueue?.close(),
    _visualQueue?.close(),
  ]);
  _ingestQueue = undefined;
  _visualQueue = undefined;
}
