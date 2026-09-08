import type { Job } from 'bullmq';
import type { VisualJobData } from './ingest-queue';
import { extractVideoContext } from '../modules/ingest/video-context';

/**
 * Backend-agnostic visual-context runner over plain job data.
 * BullMQ, CF Queues/Workflows, and tests all enter here.
 */
export async function runVisualJob(data: VisualJobData): Promise<void> {
  const { assetId, sourceUrl, userId, duration } = data;
  await extractVideoContext(assetId, sourceUrl, userId, duration);
}

/**
 * BullMQ processor adapter — unwraps the Job and delegates to runVisualJob.
 */
export async function processVisualJob(job: Job<VisualJobData>): Promise<void> {
  await runVisualJob(job.data);
}
