import { Worker } from 'bullmq';
import { createRedisConnection, isQueueEnabled } from './connection';
import { processIngestJob } from './ingest-worker';
import { processVisualJob } from './visual-worker';
import type { IngestJobData, VisualJobData } from './ingest-queue';
import { handlePipelineError } from '../modules/ingest/pipeline';

let ingestWorker: Worker<IngestJobData> | undefined;
let visualWorker: Worker<VisualJobData> | undefined;

/**
 * Start BullMQ workers.
 * Should be called once at server startup.
 */
export async function startWorkers(): Promise<void> {
  if (!isQueueEnabled()) return;

  ingestWorker = new Worker<IngestJobData>(
    'ingest-pipeline',
    async (job) => {
      try {
        await processIngestJob(job);
      } catch (error) {
        // Persist failure to DB so the UI shows the error
        await handlePipelineError(job.data.assetId, job.data.userId, error);
        throw error; // re-throw so BullMQ marks the job as failed
      }
    },
    {
      connection: createRedisConnection(),
      concurrency: 5,
      lockDuration: 300_000,     // 5 min — long-running transcription stages
      lockRenewTime: 150_000,    // renew lock every 2.5 min
    },
  );

  visualWorker = new Worker<VisualJobData>(
    'visual-context',
    async (job) => {
      await processVisualJob(job);
    },
    {
      connection: createRedisConnection(),
      concurrency: 2,
      lockDuration: 300_000,
      lockRenewTime: 150_000,
    },
  );

  // Log worker events for observability
  for (const [name, worker] of [
    ['ingest', ingestWorker],
    ['visual', visualWorker],
  ] as const) {
    worker.on('completed', (job) => {
      console.info(`[queue:${name}] Job ${job.id} completed`);
    });
    worker.on('failed', (job, err) => {
      console.error(
        `[queue:${name}] Job ${job?.id ?? 'unknown'} failed:`,
        err.message,
      );
    });
  }

  console.info('[queue] Workers started (ingest concurrency=5, visual concurrency=2)');
}

/**
 * Gracefully stop all workers (drain in-progress jobs).
 * Called during server shutdown before closing Redis/DB connections.
 */
export async function stopWorkers(): Promise<void> {
  await Promise.all([
    ingestWorker?.close(),
    visualWorker?.close(),
  ]);
  ingestWorker = undefined;
  visualWorker = undefined;
}
