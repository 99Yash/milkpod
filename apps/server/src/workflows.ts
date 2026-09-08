import { WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import {
  AssetService,
  INGEST_MAX_ATTEMPTS,
  VISUAL_MAX_ATTEMPTS,
  handlePipelineError,
  runIngestStages,
  runVisualJob,
  runWithEdgeQueueContext,
  setEdgeDatabaseUrl,
} from '@milkpod/api';
import type {
  EdgeQueueContext,
  IngestJobData,
  QueueProducerBinding,
  VisualJobData,
} from '@milkpod/api';

// ---------------------------------------------------------------------------
// Cloudflare Workflows for the ingest pipeline (issue #42).
//
// Queue-consumer invocations have tight CPU limits; transcription and
// embedding run for minutes. The `queue()` handler in `worker.ts` therefore
// starts one workflow instance per message instead of running the job
// inline. Each workflow wraps the backend-agnostic runners from
// `@milkpod/api` in a durable step with retries + backoff, so progress
// survives isolate restarts and evictions.
//
// These classes must stay exported from the worker entry (`worker.ts`
// re-exports them) — workerd resolves `className` against the bundle's
// named exports, and `alchemy.run.ts` binds them via `Cloudflare.Workflow`.
// They are edge-only: never import this module from `src/index.ts` (Node).
// ---------------------------------------------------------------------------

/** Host-worker env shape available to a workflow run (subset of Api env). */
export interface WorkflowRuntimeEnv {
  HYPERDRIVE?: { connectionString: string };
  INGEST_QUEUE?: QueueProducerBinding;
  VISUAL_QUEUE?: QueueProducerBinding;
}

/**
 * Bridge host bindings into `@milkpod/api` the same way `worker.ts` does
 * for fetch/queue invocations: point `db()` at Hyperdrive and expose the
 * queue producer bindings so nested enqueues (ingest → visual dispatch)
 * stay durable. The producer switch is always on here — a running workflow
 * implies the consumer is live.
 */
export function workflowQueueContext(env: WorkflowRuntimeEnv): EdgeQueueContext {
  const hyperdriveConn = env.HYPERDRIVE?.connectionString;
  if (hyperdriveConn) {
    setEdgeDatabaseUrl(hyperdriveConn);
  }
  return {
    ingestQueue: env.INGEST_QUEUE,
    visualQueue: env.VISUAL_QUEUE,
    queueProducerEnabled: true,
  };
}

/**
 * Ingest workflow: transcribe → embed → ready, with checkpoint resume.
 * `runIngestStages` skips completed stages (transcript segments,
 * embedding row counts), so a step retry resumes from the last completed
 * stage instead of redoing paid transcription work. Failure is persisted
 * to the asset only after step retries are exhausted, mirroring the
 * BullMQ last-attempt behavior in `runIngestJob`.
 */
export class IngestWorkflow extends WorkflowEntrypoint<
  WorkflowRuntimeEnv,
  IngestJobData
> {
  async run(
    event: Readonly<WorkflowEvent<IngestJobData>>,
    step: WorkflowStep,
  ): Promise<void> {
    const { assetId, userId } = event.payload;
    const ctx = workflowQueueContext(this.env);
    await runWithEdgeQueueContext(ctx, async () => {
      // Skip no-op redeliveries: a completed asset needs no further work.
      const asset = await AssetService.getById(assetId, userId);
      if (asset?.status === 'ready') return;

      try {
        await step.do(
          'ingest-pipeline',
          {
            retries: {
              // Total executions (initial + retries) match BullMQ attempts.
              limit: Math.max(INGEST_MAX_ATTEMPTS - 1, 0),
              delay: '30 seconds',
              backoff: 'exponential',
            },
            // Transcription polls AssemblyAI for minutes on long media.
            timeout: '15 minutes',
          },
          async () => {
            await runIngestStages(event.payload);
            return 'done';
          },
        );
      } catch (error) {
        await handlePipelineError(assetId, userId, error);
        throw error;
      }
    });
  }
}

/**
 * Visual-context workflow: Gemini extraction + embeddings for video.
 * `extractVideoContext` persists its own failure status, so no extra
 * failure handling is needed here — the throw marks the instance errored.
 */
export class VisualWorkflow extends WorkflowEntrypoint<
  WorkflowRuntimeEnv,
  VisualJobData
> {
  async run(
    event: Readonly<WorkflowEvent<VisualJobData>>,
    step: WorkflowStep,
  ): Promise<void> {
    const ctx = workflowQueueContext(this.env);
    await runWithEdgeQueueContext(ctx, () =>
      step.do(
        'visual-context',
        {
          retries: {
            limit: Math.max(VISUAL_MAX_ATTEMPTS - 1, 0),
            delay: '15 seconds',
            backoff: 'exponential',
          },
          timeout: '10 minutes',
        },
        async () => {
          await runVisualJob(event.payload);
          return 'done';
        },
      ),
    );
  }
}
