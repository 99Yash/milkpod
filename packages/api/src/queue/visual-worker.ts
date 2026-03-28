import type { Job } from 'bullmq';
import type { VisualJobData } from './ingest-queue';
import { extractVideoContext } from '../modules/ingest/video-context';

/**
 * BullMQ processor for the `visual-context` queue.
 * Simply delegates to the existing `extractVideoContext` function.
 */
export async function processVisualJob(job: Job<VisualJobData>): Promise<void> {
  const { assetId, sourceUrl, userId, duration } = job.data;
  await extractVideoContext(assetId, sourceUrl, userId, duration);
}
