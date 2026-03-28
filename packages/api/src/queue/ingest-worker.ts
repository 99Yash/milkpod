import type { Job } from 'bullmq';
import type { IngestJobData } from './ingest-queue';
import { enqueueVisualJob } from './ingest-queue';
import { IngestService } from '../modules/ingest/service';
import { AssetService } from '../modules/assets/service';
import { assertSafeExternalSourceUrl } from '../modules/ingest/url-safety';
import { createUploadDownloadUrl } from '../modules/ingest/upload-storage';
import { embedSegments } from '../modules/ingest/embed';
import { emitAssetStatus } from '../events/asset-events';
import { QuotaService } from '../modules/quota/service';
import {
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
  job: Job<IngestJobData>,
): Promise<TranscriptionResult> {
  const { assetId, sourceUrl, sourceType, transcriptionStrategy } = job.data;
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
    emitAssetStatus(job.data.userId, assetId, 'transcribing', 'Falling back to captions...');

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
// Main processor — called by BullMQ Worker for each ingest job
// ---------------------------------------------------------------------------

export async function processIngestJob(job: Job<IngestJobData>): Promise<void> {
  const { assetId, userId, sourceType, mediaType } = job.data;
  const retry = makeRetry(assetId);
  const heartbeat = makeHeartbeat(assetId);

  // ── Stage 1: Transcription (checkpoint-gated) ───────────────────────
  const hasTranscript = await AssetService.hasTranscriptSegments(assetId);

  let lastSegmentEndTime = 0;

  if (!hasTranscript) {
    await IngestService.updateStatus(assetId, 'transcribing');
    emitAssetStatus(userId, assetId, 'transcribing');

    const result = await transcribeAsset(job);

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
  // On retry, partial embeddings may remain from a failed batch insert.
  // Delete them so the stage is fully idempotent.
  const hasEmb = await AssetService.hasEmbeddings(assetId);

  if (!hasEmb || job.attemptsMade > 0) {
    if (hasEmb) {
      await AssetService.deleteEmbeddingsForAsset(assetId);
    }
    await IngestService.updateStatus(assetId, 'embedding');
    emitAssetStatus(userId, assetId, 'embedding');

    const storedSegments = await AssetService.getStoredSegmentsForEmbedding(assetId);

    if (storedSegments.length === 0) {
      throw new Error('No stored segments found for embedding — transcript may be missing');
    }

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
      (mediaType === 'video' && sourceType === 'external' && isDirectVideoFileUrl(job.data.sourceUrl));

    if (shouldExtractVisual) {
      let visualUrl = job.data.sourceUrl;

      // Upload assets need a signed URL for visual extraction
      if (sourceType === 'upload') {
        try {
          visualUrl = await createUploadDownloadUrl(job.data.sourceUrl, {
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
