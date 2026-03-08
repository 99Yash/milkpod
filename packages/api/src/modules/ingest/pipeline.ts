import { fetchYouTubeTranscript } from './youtube';
import { captionItemsToSegments, groupWordsIntoSegments } from './segments';
import { IngestService } from './service';
import { withRetry } from './retry';
import { embedSegments } from './embed';
import { emitAssetStatus } from '../../events/asset-events';
import { transcribeFile } from './elevenlabs';

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
    provider
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

async function handlePipelineError(assetId: string, userId: string, error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Unknown pipeline error';
  console.error(`[ingest] Pipeline failed for asset ${assetId}:`, message);
  await IngestService.updateStatus(assetId, 'failed', {
    lastError: message,
  });
  emitAssetStatus(userId, assetId, 'failed', message);
}

export async function orchestratePipeline(
  assetId: string,
  sourceUrl: string,
  userId: string
): Promise<void> {
  const retry = makeRetry(assetId);

  try {
    await IngestService.updateStatus(assetId, 'transcribing');
    emitAssetStatus(userId, assetId, 'transcribing');
    const result = await retry('transcribing', () =>
      fetchYouTubeTranscript(sourceUrl)
    );
    const segments = captionItemsToSegments(result.items);

    await finalizePipeline(assetId, userId, result.language, segments, 'youtube', retry);
  } catch (error) {
    await handlePipelineError(assetId, userId, error);
  }
}

export async function orchestrateUploadPipeline(
  assetId: string,
  file: File,
  userId: string
): Promise<void> {
  const retry = makeRetry(assetId);

  try {
    await IngestService.updateStatus(assetId, 'transcribing');
    emitAssetStatus(userId, assetId, 'transcribing');

    const result = await retry('transcribing', () => transcribeFile(file));
    const segments = groupWordsIntoSegments(result.words);

    await finalizePipeline(assetId, userId, result.language_code, segments, 'elevenlabs', retry);
  } catch (error) {
    await handlePipelineError(assetId, userId, error);
  }
}
