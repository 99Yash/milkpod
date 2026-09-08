import type { Job } from 'bullmq';
import type { IngestJobData } from './ingest-queue';
import { INGEST_MAX_ATTEMPTS } from './ingest-queue';
import { enqueueVisualJob } from './ingest-queue';
import { IngestService } from '../modules/ingest/service';
import { AssetService } from '../modules/assets/service';
import { assertSafeExternalSourceUrl } from '../modules/ingest/url-safety';
import { createUploadDownloadUrl } from '../modules/ingest/upload-storage';
import { embedSegments } from '../modules/ingest/embed';
import { emitAssetStatus } from '../events/asset-events';
import { QuotaService } from '../modules/quota/service';
import {
  handlePipelineError,
  makeRetry,
  makeHeartbeat,
  transcribeViaAudio,
  transcribeViaCaptions,
  transcribeViaExternalAudio,
  transcribeViaExternalCaptions,
  isDirectVideoFileUrl,
} from '../modules/ingest/pipeline';
import { groupWordsIntoSegments } from '../modules/ingest/segments';
import { transcribeAudio } from '../modules/ingest/assemblyai';
import { toSafeErrorMessage } from '../modules/ingest/error-message';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TranscriptionResult {
  language: string;
  segments: {
    segmentIndex: number;
    text: string;
    startTime: number;
    endTime: number;
    speaker: string | null;
  }[];
  provider: string;
  method: 'audio' | 'captions' | 'audio_fallback_to_captions';
  fallbackReason?: string;
}

// ---------------------------------------------------------------------------
// Transcription stage — delegates to the appropriate strategy
// ---------------------------------------------------------------------------

async function transcribeAsset(
  data: IngestJobData,
): Promise<TranscriptionResult> {
  const { assetId, sourceUrl, sourceType, transcriptionStrategy } = data;
  const strategy = transcriptionStrategy ?? 'audio-first';
  const retry = makeRetry(assetId);
  const heartbeat = makeHeartbeat(assetId);

  if (sourceType === 'upload') {
    const transcriptionUrl = await retry('resolving-upload-url', () =>
      createUploadDownloadUrl(sourceUrl),
    );
    const result = await retry('transcribing', () =>
      transcribeAudio(transcriptionUrl, {
        allowRemoteFetchFallback: true,
        onHeartbeat: heartbeat,
      }),
    );
    const segments = groupWordsIntoSegments(result.words);
    return {
      language: result.language_code,
      segments,
      provider: 'assemblyai',
      method: 'audio',
    };
  }

  if (sourceType === 'external') {
    await assertSafeExternalSourceUrl(sourceUrl);
  }

  // YouTube or external with caption fallback
  const isYouTube = sourceType === 'youtube';

  if (strategy === 'captions-first') {
    const transcribeCaptions = isYouTube
      ? transcribeViaCaptions
      : transcribeViaExternalCaptions;
    const { language, segments, provider } = await transcribeCaptions(sourceUrl, retry);
    return { language, segments, provider, method: 'captions' };
  }

  // audio-first or auto: try audio, fallback to captions
  const transcribeAudioFn = isYouTube
    ? () => transcribeViaAudio(sourceUrl, retry, heartbeat)
    : () => transcribeViaExternalAudio(sourceUrl, retry, heartbeat);
  const transcribeCaptionsFn = isYouTube
    ? transcribeViaCaptions
    : transcribeViaExternalCaptions;

  try {
    const { language, segments, provider } = await transcribeAudioFn();
    return { language, segments, provider, method: 'audio' };
  } catch (audioErr) {
    const audioError = toSafeErrorMessage(audioErr);
    console.warn(
      `[queue] Audio transcription failed for ${assetId}, falling back to captions: ${audioError}`,
    );
    emitAssetStatus(data.userId, assetId, 'transcribing', 'Falling back to captions...');

    try {
      const { language, segments, provider } = await transcribeCaptionsFn(sourceUrl, retry);
      return {
        language,
        segments,
        provider,
        method: 'audio_fallback_to_captions',
        fallbackReason: audioError,
      };
    } catch (captionErr) {
      const captionMessage = toSafeErrorMessage(captionErr);
      throw new Error(
        `Audio transcription failed (${audioError}) and captions fallback failed (${captionMessage})`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Runner — backend-agnostic ingest pipeline over plain job data.
// BullMQ, CF Queues/Workflows, and tests all enter here; only the BullMQ
// adapter below knows about `Job`. Checkpoint guards (hasTranscriptSegments,
// embedding row-count comparison) make re-delivery safe on every backend.
// ---------------------------------------------------------------------------

export async function runIngestJob(
  data: IngestJobData,
  opts?: { attemptsMade?: number; maxAttempts?: number },
): Promise<void> {
  const attemptsMade = opts?.attemptsMade ?? 0;
  const maxAttempts = opts?.maxAttempts ?? INGEST_MAX_ATTEMPTS;
  try {
    await runIngestStages(data);
  } catch (error) {
    // Persist failure to DB only on the last attempt so intermediate
    // retries don't flash a false "failed" status to the user.
    if (attemptsMade + 1 >= maxAttempts) {
      await handlePipelineError(data.assetId, data.userId, error);
    }
    throw error; // re-throw so the backend marks the job as failed / retries
  }
}

/**
 * BullMQ processor adapter — unwraps the Job and delegates to runIngestJob.
 */
export async function processIngestJob(job: Job<IngestJobData>): Promise<void> {
  await runIngestJob(job.data, {
    attemptsMade: job.attemptsMade,
    maxAttempts: job.opts.attempts ?? INGEST_MAX_ATTEMPTS,
  });
}

/**
 * Backend-agnostic stage runner WITHOUT failure persistence.
 * BullMQ (`runIngestJob`), CF Queues inline fallback, and Workflows all
 * enter here. Each stage is checkpoint-gated so at-least-once delivery
 * (queue redelivery, workflow step retry) resumes instead of duplicating:
 * - Transcription is skipped when segments exist (storeTranscript is
 *   transactional, so partial transcripts cannot linger).
 * - Embedding compares row counts: a complete set is skipped, partial
 *   rows are deleted and re-embedded. No attempt counter needed, so
 *   platform-managed retries (which carry no counter) stay correct.
 */
export async function runIngestStages(data: IngestJobData): Promise<void> {
  const { assetId, userId, sourceType, mediaType } = data;
  const retry = makeRetry(assetId);
  const heartbeat = makeHeartbeat(assetId);

  // ── Stage 1: Transcription (checkpoint-gated) ───────────────────────
  const hasTranscript = await AssetService.hasTranscriptSegments(assetId);

  let lastSegmentEndTime = 0;

  if (!hasTranscript) {
    await IngestService.updateStatus(assetId, 'transcribing');
    emitAssetStatus(userId, assetId, 'transcribing');

    const result = await transcribeAsset(data);

    if (result.segments.length === 0) {
      throw new Error('Transcription produced no segments');
    }

    // Update duration
    const lastSegment = result.segments[result.segments.length - 1];
    if (lastSegment) {
      lastSegmentEndTime = lastSegment.endTime;
      await IngestService.updateStatus(assetId, 'transcribing', {
        duration: Math.ceil(lastSegmentEndTime),
      });
    }

    await IngestService.storeTranscript(
      assetId,
      result.language,
      result.segments,
      result.provider,
      result.method !== 'audio'
        ? { transcriptionMethod: result.method, fallbackReason: result.fallbackReason }
        : { transcriptionMethod: result.method },
    );

    // Upload assets: set raw media retention deadline
    if (sourceType === 'upload') {
      await IngestService.setRetentionDeadline(assetId);
    }
  }

  // ── Stage 2: Embedding (checkpoint-gated) ───────────────────────────
  // Compare row counts instead of trusting an attempt counter: a complete
  // set is skipped, partial rows from a failed batch insert are deleted
  // so the stage is fully idempotent on every backend.
  const storedSegments = await AssetService.getStoredSegmentsForEmbedding(assetId);

  if (storedSegments.length === 0) {
    const embCount = await AssetService.countEmbeddingsForAsset(assetId);
    if (embCount === 0) {
      throw new Error('No stored segments found for embedding — transcript may be missing');
    }
    // Embeddings exist without segments (stale rows) — fall through to
    // finalize so a redelivery cannot stall here.
  } else {
    const embCount = await AssetService.countEmbeddingsForAsset(assetId);
    if (embCount < storedSegments.length) {
      if (embCount > 0) {
        await AssetService.deleteEmbeddingsForAsset(assetId);
      }
      await IngestService.updateStatus(assetId, 'embedding');
      emitAssetStatus(userId, assetId, 'embedding');

      // Compute lastSegmentEndTime from stored data if we skipped transcription
      if (lastSegmentEndTime === 0) {
        const last = storedSegments[storedSegments.length - 1];
        if (last) lastSegmentEndTime = last.endTime;
      }

      await embedSegments({
        entityId: assetId,
        userId,
        assetId,
        storedSegments,
        retry,
        onHeartbeat: heartbeat,
      });
    } else if (lastSegmentEndTime === 0) {
      const last = storedSegments[storedSegments.length - 1];
      if (last) lastSegmentEndTime = last.endTime;
    }
  }

  // ── Stage 3: Finalize ───────────────────────────────────────────────
  await IngestService.updateStatus(assetId, 'ready', { lastError: null });
  emitAssetStatus(userId, assetId, 'ready');

  // Increment video minutes quota
  const durationMinutes = lastSegmentEndTime > 0
    ? Math.ceil(lastSegmentEndTime / 60)
    : 0;
  if (durationMinutes > 0) {
    QuotaService.increment(userId, 'video_minutes', durationMinutes).catch((err) => {
      console.warn(
        `[queue] Failed to increment video minutes quota for ${assetId}:`,
        err instanceof Error ? err.message : String(err),
      );
    });
  }

  // ── Dispatch visual context job ─────────────────────────────────────
  if (lastSegmentEndTime > 0) {
    const shouldExtractVisual =
      sourceType === 'youtube' ||
      (mediaType === 'video' && sourceType === 'upload') ||
      (mediaType === 'video' && sourceType === 'external' && isDirectVideoFileUrl(data.sourceUrl));

    if (shouldExtractVisual) {
      let visualUrl = data.sourceUrl;

      // Upload assets need a signed URL for visual extraction
      if (sourceType === 'upload') {
        try {
          visualUrl = await createUploadDownloadUrl(data.sourceUrl, {
            expiresInSeconds: 3600,
          });
        } catch {
          console.warn(`[queue] Failed to create visual URL for upload asset ${assetId}`);
        }
      }

      await enqueueVisualJob({
        assetId,
        sourceUrl: visualUrl,
        userId,
        duration: Math.ceil(lastSegmentEndTime),
        requiresDirectVideoUrl: sourceType === 'external',
      });
    }
  }
}
