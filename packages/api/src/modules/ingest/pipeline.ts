import { fetchYouTubeTranscript, resolveYouTubeAudioUrl } from './youtube';
import { captionItemsToSegments, groupWordsIntoSegments } from './segments';
import { IngestService } from './service';
import { withRetry } from './retry';
import { embedSegments } from './embed';
import { emitAssetStatus } from '../../events/asset-events';
import { transcribeAudio } from './elevenlabs';
import { extractVideoContext } from './video-context';
import type { TranscriptionStrategy } from './model';
import { createUploadDownloadUrl } from './upload-storage';

type TranscriptionMethod = 'audio' | 'captions' | 'audio_fallback_to_captions';

function makeRetry(assetId: string) {
  return <T>(stage: string, fn: () => Promise<T>) =>
    withRetry(
      { stage, entityId: assetId, logPrefix: 'ingest', onError: IngestService.incrementAttempts },
      fn
    );
}

async function finalizePipeline(
  assetId: string,
  userId: string,
  language: string,
  segments: { segmentIndex: number; text: string; startTime: number; endTime: number; speaker: string | null }[],
  provider: string,
  retry: ReturnType<typeof makeRetry>,
  metadata?: { transcriptionMethod: TranscriptionMethod; fallbackReason?: string },
) {
  // Derive duration from the last segment
  const lastSegment = segments[segments.length - 1];
  if (lastSegment) {
    await IngestService.updateStatus(assetId, 'transcribing', {
      duration: Math.ceil(lastSegment.endTime),
    });
  }

  const { segments: storedSegments } = await IngestService.storeTranscript(
    assetId,
    language,
    segments,
    provider,
    metadata ? { transcriptionMethod: metadata.transcriptionMethod, fallbackReason: metadata.fallbackReason } : undefined,
  );

  // Generate and store embeddings
  await IngestService.updateStatus(assetId, 'embedding');
  emitAssetStatus(userId, assetId, 'embedding');

  await embedSegments({
    entityId: assetId,
    userId,
    assetId,
    storedSegments,
    retry,
  });

  // Mark as ready
  await IngestService.updateStatus(assetId, 'ready');
  emitAssetStatus(userId, assetId, 'ready');
}

/** Fire visual context extraction without blocking the transcript pipeline (FR9). */
function triggerVisualExtraction(
  assetId: string,
  sourceUrl: string,
  userId: string,
  segments: { endTime: number }[],
) {
  const lastSeg = segments[segments.length - 1];
  const duration = lastSeg ? Math.ceil(lastSeg.endTime) : 0;
  if (duration <= 0) return;

  extractVideoContext(assetId, sourceUrl, userId, duration).catch((err) => {
    console.warn(
      `[ingest] Visual context extraction failed for ${assetId}:`,
      err instanceof Error ? err.message : err
    );
  });
}

async function handlePipelineError(assetId: string, userId: string, error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Unknown pipeline error';
  console.error(`[ingest] Pipeline failed for asset ${assetId}:`, message);
  await IngestService.updateStatus(assetId, 'failed', {
    lastError: message,
  });
  emitAssetStatus(userId, assetId, 'failed', message);
}

async function transcribeViaAudio(
  sourceUrl: string,
  retry: ReturnType<typeof makeRetry>,
) {
  const audioUrl = await retry('resolving-audio', () =>
    resolveYouTubeAudioUrl(sourceUrl)
  );
  const result = await retry('transcribing-audio', () =>
    transcribeAudio(audioUrl)
  );
  const segments = groupWordsIntoSegments(result.words);
  return { language: result.language_code, segments, provider: 'elevenlabs' as const };
}

async function transcribeViaCaptions(
  sourceUrl: string,
  retry: ReturnType<typeof makeRetry>,
) {
  const result = await retry('transcribing-captions', () =>
    fetchYouTubeTranscript(sourceUrl)
  );
  const segments = captionItemsToSegments(result.items);
  return { language: result.language, segments, provider: 'youtube' as const };
}

export async function orchestratePipeline(
  assetId: string,
  sourceUrl: string,
  userId: string,
  strategy: TranscriptionStrategy = 'audio-first',
): Promise<void> {
  const retry = makeRetry(assetId);

  try {
    await IngestService.updateStatus(assetId, 'transcribing');
    emitAssetStatus(userId, assetId, 'transcribing');

    if (strategy === 'captions-first') {
      const { language, segments, provider } = await transcribeViaCaptions(sourceUrl, retry);
      await finalizePipeline(assetId, userId, language, segments, provider, retry, {
        transcriptionMethod: 'captions',
      });
      triggerVisualExtraction(assetId, sourceUrl, userId, segments);
      return;
    }

    // audio-first or auto: try audio, fallback to captions
    let audioError: string | undefined;

    try {
      const { language, segments, provider } = await transcribeViaAudio(sourceUrl, retry);
      await finalizePipeline(assetId, userId, language, segments, provider, retry, {
        transcriptionMethod: 'audio',
      });
      triggerVisualExtraction(assetId, sourceUrl, userId, segments);
      return;
    } catch (err) {
      audioError = err instanceof Error ? err.message : 'Unknown audio transcription error';
      console.warn(
        `[ingest] Audio transcription failed for asset ${assetId}, falling back to captions: ${audioError}`
      );
    }

    // Fallback to captions
    const { language, segments, provider } = await transcribeViaCaptions(sourceUrl, retry);
    await finalizePipeline(assetId, userId, language, segments, provider, retry, {
      transcriptionMethod: 'audio_fallback_to_captions',
      fallbackReason: audioError,
    });
    triggerVisualExtraction(assetId, sourceUrl, userId, segments);
  } catch (error) {
    await handlePipelineError(assetId, userId, error);
  }
}

export async function orchestrateUploadPipeline(
  assetId: string,
  sourceUrl: string,
  userId: string,
  mediaType: 'audio' | 'video'
): Promise<void> {
  const retry = makeRetry(assetId);

  try {
    await IngestService.updateStatus(assetId, 'transcribing');
    emitAssetStatus(userId, assetId, 'transcribing');

    const transcriptionUrl = await retry('resolving-upload-url', () =>
      createUploadDownloadUrl(sourceUrl)
    );

    const result = await retry('transcribing', () => transcribeAudio(transcriptionUrl));
    const segments = groupWordsIntoSegments(result.words);

    await finalizePipeline(assetId, userId, result.language_code, segments, 'elevenlabs', retry, {
      transcriptionMethod: 'audio',
    });

    if (mediaType === 'video') {
      const visualUrl = await retry('resolving-upload-visual-url', () =>
        createUploadDownloadUrl(sourceUrl, { expiresInSeconds: 3600 })
      );
      triggerVisualExtraction(assetId, visualUrl, userId, segments);
    }
  } catch (error) {
    await handlePipelineError(assetId, userId, error);
  }
}
