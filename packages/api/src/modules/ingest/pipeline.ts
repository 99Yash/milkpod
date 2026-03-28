import {
  fetchCaptionsViaYtDlp,
  fetchYouTubeTranscript,
  resolveYouTubeAudioUrl,
  streamAudioViaYtDlp,
} from './youtube';
import { assertSafeExternalSourceUrl } from './url-safety';
import { captionItemsToSegments, groupWordsIntoSegments } from './segments';
import { IngestService } from './service';
import { withRetry, type RetryControl } from './retry';
import { embedSegments } from './embed';
import { emitAssetStatus } from '../../events/asset-events';
import { transcribeAudio, transcribeAudioStream } from './assemblyai';
import { extractVideoContext } from './video-context';
import type { TranscriptionStrategy } from './model';
import { createUploadDownloadUrl } from './upload-storage';
import { QuotaService } from '../quota/service';
import { toSafeErrorMessage } from './error-message';

type TranscriptionMethod = 'audio' | 'captions' | 'audio_fallback_to_captions';

const DIRECT_VIDEO_EXTENSIONS = new Set([
  'avi',
  'm4v',
  'mkv',
  'mov',
  'mp4',
  'mpeg',
  'mpg',
  'webm',
]);

function assertHasSegments(
  segments: { text: string }[],
  source: 'audio' | 'captions',
): void {
  if (segments.length > 0) return;

  throw new Error(
    source === 'audio'
      ? 'Audio transcription produced no transcript segments'
      : 'Caption transcription produced no transcript segments',
  );
}

export function makeRetry(assetId: string) {
  return <T>(stage: string, fn: () => Promise<T>, control?: RetryControl) =>
    withRetry(
      {
        stage,
        entityId: assetId,
        logPrefix: 'ingest',
        onError: IngestService.incrementAttempts,
        ...control,
      },
      fn
    );
}

export function makeHeartbeat(assetId: string) {
  return () => IngestService.touchHeartbeat(assetId);
}

function isNonRetryableDirectAudioError(error: unknown, safeMessage: string): boolean {
  const raw = error instanceof Error ? error.message : '';
  const merged = `${raw} ${safeMessage}`.toLowerCase();

  return (
    /failed to download remote audio \(4\d{2}\)/.test(merged)
    || merged.includes('source audio could not be accessed from the origin url')
    || merged.includes('file does not appear to contain audio')
    || merged.includes('file type is text/html')
  );
}

export function isDirectVideoFileUrl(sourceUrl: string): boolean {
  try {
    const parsed = new URL(sourceUrl);
    const extension = parsed.pathname.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];

    if (extension && DIRECT_VIDEO_EXTENSIONS.has(extension)) {
      return true;
    }

    const explicitContentType =
      parsed.searchParams.get('response-content-type')
      ?? parsed.searchParams.get('content-type')
      ?? parsed.searchParams.get('mime');

    return explicitContentType?.toLowerCase().startsWith('video/') ?? false;
  } catch {
    return false;
  }
}

export async function finalizePipeline(
  assetId: string,
  userId: string,
  language: string,
  segments: { segmentIndex: number; text: string; startTime: number; endTime: number; speaker: string | null }[],
  provider: string,
  retry: ReturnType<typeof makeRetry>,
  metadata?: { transcriptionMethod: TranscriptionMethod; fallbackReason?: string },
  onHeartbeat?: () => Promise<void>,
) {
  // Ensure we never finalize an empty transcript
  const source: 'audio' | 'captions' =
    metadata?.transcriptionMethod === 'captions' ? 'captions' : 'audio';
  assertHasSegments(segments, source);

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
    onHeartbeat,
  });

  // Mark as ready
  await IngestService.updateStatus(assetId, 'ready', {
    lastError: null,
  });
  emitAssetStatus(userId, assetId, 'ready');

  // Increment video minutes quota counter
  const durationMinutes = lastSegment ? Math.ceil(lastSegment.endTime / 60) : 0;
  if (durationMinutes > 0) {
    QuotaService.increment(userId, 'video_minutes', durationMinutes).catch((err) => {
      console.warn(
        `[ingest] Failed to increment video minutes quota for ${assetId}:`,
        err instanceof Error ? err.message : String(err),
      );
    });
  }
}

/** Fire visual context extraction without blocking the transcript pipeline (FR9). */
export function triggerVisualExtraction(
  assetId: string,
  sourceUrl: string,
  userId: string,
  segments: { endTime: number }[],
  opts?: { requiresDirectVideoUrl?: boolean },
) {
  const lastSeg = segments[segments.length - 1];
  const duration = lastSeg ? Math.ceil(lastSeg.endTime) : 0;
  if (duration <= 0) return;

  if (opts?.requiresDirectVideoUrl && !isDirectVideoFileUrl(sourceUrl)) {
    console.info(
      `[ingest] Skipping visual context extraction for ${assetId}: external source URL is not a direct video file`
    );
    return;
  }

  // Set initial pending status synchronously before fire-and-forget
  IngestService.updateVisualStatus(assetId, 'pending').catch(() => {});

  extractVideoContext(assetId, sourceUrl, userId, duration).catch((err) => {
    console.warn(
      `[ingest] Visual context extraction failed for ${assetId}:`,
      err instanceof Error ? err.message : String(err),
    );
  });
}

export async function handlePipelineError(assetId: string, userId: string, error: unknown) {
  const message = toSafeErrorMessage(error);
  console.error(`[ingest] Pipeline failed for asset ${assetId}:`, message);
  await IngestService.updateStatus(assetId, 'failed', {
    lastError: message,
  });
  emitAssetStatus(userId, assetId, 'failed', message);
}

export async function transcribeViaAudio(
  sourceUrl: string,
  retry: ReturnType<typeof makeRetry>,
  onHeartbeat: () => Promise<void>,
) {
  const audioUrl = await retry('resolving-audio', () =>
    resolveYouTubeAudioUrl(sourceUrl)
  );

  try {
    const result = await retry(
      'transcribing-audio',
      () =>
        transcribeAudio(audioUrl, {
          allowRemoteFetchFallback: true,
          onHeartbeat,
        }),
      {
        shouldRetry: (error, message) =>
          !isNonRetryableDirectAudioError(error, message),
      },
    );
    const segments = groupWordsIntoSegments(result.words);
    assertHasSegments(segments, 'audio');
    return { language: result.language_code, segments, provider: 'assemblyai' as const };
  } catch (directError) {
    const directMessage = toSafeErrorMessage(directError);

    const directIsNonRetryable = isNonRetryableDirectAudioError(
      directError,
      directMessage,
    );

    console.warn(
      directIsNonRetryable
        ? `[ingest] Direct YouTube audio URL is inaccessible, trying yt-dlp stream fallback: ${directMessage}`
        : `[ingest] Direct YouTube audio URL transcription failed, retrying via yt-dlp stream: ${directMessage}`,
    );

    try {
      const result = await retry(
        'transcribing-audio-stream',
        async () => {
          const streamHandle = await streamAudioViaYtDlp(sourceUrl);

          try {
            const streamedResult = await transcribeAudioStream(streamHandle.stream, onHeartbeat);
            await streamHandle.waitForExit();
            return streamedResult;
          } finally {
            streamHandle.dispose();
          }
        },
        directIsNonRetryable
          ? { maxRetries: 0 }
          : undefined,
      );

      const segments = groupWordsIntoSegments(result.words);
      assertHasSegments(segments, 'audio');
      return { language: result.language_code, segments, provider: 'assemblyai' as const };
    } catch (streamError) {
      const streamMessage =
        toSafeErrorMessage(streamError);

      throw new Error(
        `Audio transcription failed via direct URL (${directMessage}) and yt-dlp stream (${streamMessage})`
      );
    }
  }
}

export async function transcribeViaCaptions(
  sourceUrl: string,
  retry: ReturnType<typeof makeRetry>,
) {
  const result = await retry('transcribing-captions', () =>
    fetchYouTubeTranscript(sourceUrl)
  );
  const segments = captionItemsToSegments(result.items);
  assertHasSegments(segments, 'captions');
  return { language: result.language, segments, provider: 'youtube' as const };
}

export async function transcribeViaExternalAudio(
  sourceUrl: string,
  retry: ReturnType<typeof makeRetry>,
  onHeartbeat: () => Promise<void>,
) {
  try {
    const result = await retry(
      'transcribing-external-url',
      () => transcribeAudio(sourceUrl, { onHeartbeat }),
      {
        shouldRetry: (error, message) =>
          !isNonRetryableDirectAudioError(error, message),
      },
    );

    const segments = groupWordsIntoSegments(result.words);
    assertHasSegments(segments, 'audio');

    return {
      language: result.language_code,
      segments,
      provider: 'assemblyai' as const,
    };
  } catch (directError) {
    const directMessage = toSafeErrorMessage(directError);
    const directIsNonRetryable = isNonRetryableDirectAudioError(
      directError,
      directMessage,
    );

    console.warn(
      directIsNonRetryable
        ? `[ingest] Direct external URL is not a usable media file, trying yt-dlp stream fallback: ${directMessage}`
        : `[ingest] Direct URL transcription failed, retrying via yt-dlp stream: ${directMessage}`
    );

    try {
      const result = await retry('transcribing-external-stream', async () => {
        const streamHandle = await streamAudioViaYtDlp(sourceUrl);

        try {
          const streamedResult = await transcribeAudioStream(streamHandle.stream, onHeartbeat);
          await streamHandle.waitForExit();
          return streamedResult;
        } finally {
          streamHandle.dispose();
        }
      });

      const segments = groupWordsIntoSegments(result.words);
      assertHasSegments(segments, 'audio');

      return {
        language: result.language_code,
        segments,
        provider: 'assemblyai' as const,
      };
    } catch (streamError) {
      const streamMessage = toSafeErrorMessage(streamError);

      throw new Error(
        `Audio extraction failed via direct URL (${directMessage}) and yt-dlp stream (${streamMessage})`
      );
    }
  }
}

export async function transcribeViaExternalCaptions(
  sourceUrl: string,
  retry: ReturnType<typeof makeRetry>,
) {
  const result = await retry('transcribing-external-captions', () =>
    fetchCaptionsViaYtDlp(sourceUrl)
  );

  const segments = captionItemsToSegments(result.items);
  assertHasSegments(segments, 'captions');

  return {
    language: result.language,
    segments,
    provider: 'yt-dlp-captions' as const,
  };
}

export async function orchestratePipeline(
  assetId: string,
  sourceUrl: string,
  userId: string,
  strategy: TranscriptionStrategy = 'audio-first',
): Promise<void> {
  const retry = makeRetry(assetId);
  const heartbeat = makeHeartbeat(assetId);

  try {
    await IngestService.updateStatus(assetId, 'transcribing');
    emitAssetStatus(userId, assetId, 'transcribing');

    if (strategy === 'captions-first') {
      const { language, segments, provider } = await transcribeViaCaptions(sourceUrl, retry);
      await finalizePipeline(assetId, userId, language, segments, provider, retry, {
        transcriptionMethod: 'captions',
      }, heartbeat);
      triggerVisualExtraction(assetId, sourceUrl, userId, segments);
      return;
    }

    // audio-first or auto: try audio, fallback to captions
    let audioError: string | undefined;

    try {
      const { language, segments, provider } = await transcribeViaAudio(sourceUrl, retry, heartbeat);
      await finalizePipeline(assetId, userId, language, segments, provider, retry, {
        transcriptionMethod: 'audio',
      }, heartbeat);
      triggerVisualExtraction(assetId, sourceUrl, userId, segments);
      return;
    } catch (err) {
      audioError = toSafeErrorMessage(err);
      console.warn(
        `[ingest] Audio transcription failed for asset ${assetId}, falling back to captions: ${audioError}`
      );
      emitAssetStatus(userId, assetId, 'transcribing', 'Falling back to captions...');
    }

    // Fallback to captions
    const { language, segments, provider } = await transcribeViaCaptions(sourceUrl, retry);
    await finalizePipeline(assetId, userId, language, segments, provider, retry, {
      transcriptionMethod: 'audio_fallback_to_captions',
      fallbackReason: audioError,
    }, heartbeat);
    triggerVisualExtraction(assetId, sourceUrl, userId, segments);
  } catch (error) {
    await handlePipelineError(assetId, userId, error);
  }
}

export async function orchestrateExternalPipeline(
  assetId: string,
  sourceUrl: string,
  userId: string,
  mediaType: 'audio' | 'video',
  strategy: TranscriptionStrategy = 'audio-first',
): Promise<void> {
  const retry = makeRetry(assetId);
  const heartbeat = makeHeartbeat(assetId);

  try {
    await IngestService.updateStatus(assetId, 'transcribing');
    emitAssetStatus(userId, assetId, 'transcribing');
    await assertSafeExternalSourceUrl(sourceUrl);

    if (strategy === 'captions-first') {
      const { language, segments, provider } = await transcribeViaExternalCaptions(
        sourceUrl,
        retry,
      );

      await finalizePipeline(assetId, userId, language, segments, provider, retry, {
        transcriptionMethod: 'captions',
      }, heartbeat);

      if (mediaType === 'video') {
        triggerVisualExtraction(assetId, sourceUrl, userId, segments, {
          requiresDirectVideoUrl: true,
        });
      }

      return;
    }

    let audioError: string | undefined;

    try {
      const { language, segments, provider } = await transcribeViaExternalAudio(
        sourceUrl,
        retry,
        heartbeat,
      );

      await finalizePipeline(assetId, userId, language, segments, provider, retry, {
        transcriptionMethod: 'audio',
      }, heartbeat);

      if (mediaType === 'video') {
        triggerVisualExtraction(assetId, sourceUrl, userId, segments, {
          requiresDirectVideoUrl: true,
        });
      }

      return;
    } catch (error) {
      audioError = toSafeErrorMessage(error);
      console.warn(
        `[ingest] Audio transcription failed for external asset ${assetId}, falling back to captions: ${audioError}`
      );
      emitAssetStatus(userId, assetId, 'transcribing', 'Falling back to captions...');
    }

    try {
      const { language, segments, provider } = await transcribeViaExternalCaptions(
        sourceUrl,
        retry,
      );

      await finalizePipeline(assetId, userId, language, segments, provider, retry, {
        transcriptionMethod: 'audio_fallback_to_captions',
        fallbackReason: audioError,
      }, heartbeat);

      if (mediaType === 'video') {
        triggerVisualExtraction(assetId, sourceUrl, userId, segments, {
          requiresDirectVideoUrl: true,
        });
      }
    } catch (captionError) {
      const captionMessage = toSafeErrorMessage(captionError);
      throw new Error(
        `Audio transcription failed (${audioError ?? 'unknown reason'}) and captions fallback failed (${captionMessage})`
      );
    }
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
  const heartbeat = makeHeartbeat(assetId);

  try {
    await IngestService.updateStatus(assetId, 'transcribing');
    emitAssetStatus(userId, assetId, 'transcribing');

    const transcriptionUrl = await retry('resolving-upload-url', () =>
      createUploadDownloadUrl(sourceUrl)
    );

    const result = await retry('transcribing', () =>
      transcribeAudio(transcriptionUrl, {
        allowRemoteFetchFallback: true,
        onHeartbeat: heartbeat,
      })
    );
    const segments = groupWordsIntoSegments(result.words);

    await finalizePipeline(assetId, userId, result.language_code, segments, 'assemblyai', retry, {
      transcriptionMethod: 'audio',
    }, heartbeat);

    // Set raw media retention deadline for upload assets
    await IngestService.setRetentionDeadline(assetId);

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
