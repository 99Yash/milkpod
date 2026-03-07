import { fetchYouTubeTranscript } from './youtube';
import { captionItemsToSegments } from './segments';
import { IngestService } from './service';
import { withRetry } from './retry';
import { embedSegments } from './embed';
import { emitAssetStatus } from '../../events/asset-events';

export async function orchestratePipeline(
  assetId: string,
  sourceUrl: string,
  userId: string
): Promise<void> {
  const retry = <T>(stage: string, fn: () => Promise<T>) =>
    withRetry(
      { stage, entityId: assetId, logPrefix: 'ingest', onError: IngestService.incrementAttempts },
      fn
    );

  try {
    // Stage 1: Fetch YouTube captions
    await IngestService.updateStatus(assetId, 'transcribing');
    emitAssetStatus(userId, assetId, 'transcribing');
    const result = await retry('transcribing', () =>
      fetchYouTubeTranscript(sourceUrl)
    );
    const segments = captionItemsToSegments(result.items);

    // Derive duration from the last caption
    const lastSegment = segments[segments.length - 1];
    if (lastSegment) {
      await IngestService.updateStatus(assetId, 'transcribing', {
        duration: Math.ceil(lastSegment.endTime),
      });
    }

    const { segments: storedSegments } = await IngestService.storeTranscript(
      assetId,
      result.language,
      segments,
      'youtube'
    );

    // Stage 2: Generate and store embeddings
    await IngestService.updateStatus(assetId, 'embedding');
    emitAssetStatus(userId, assetId, 'embedding');

    await embedSegments({
      entityId: assetId,
      userId,
      assetId,
      storedSegments,
      retry,
    });

    // Stage 3: Mark as ready
    await IngestService.updateStatus(assetId, 'ready');
    emitAssetStatus(userId, assetId, 'ready');
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown pipeline error';
    console.error(`[ingest] Pipeline failed for asset ${assetId}:`, message);
    await IngestService.updateStatus(assetId, 'failed', {
      lastError: message,
    });
    emitAssetStatus(userId, assetId, 'failed', message);
  }
}
