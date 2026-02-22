import { chunkTranscript, generateEmbeddings, EMBEDDING_MODEL_NAME, EMBEDDING_DIMENSIONS } from '@milkpod/ai/embeddings';
import { fetchYouTubeTranscript } from './youtube';
import { captionItemsToSegments } from './segments';
import { IngestService } from './service';
import { emitAssetStatus, emitAssetProgress } from '../../events/asset-events';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function delayWithJitter(attempt: number): Promise<void> {
  const exponential = BASE_DELAY_MS * 2 ** attempt;
  const jitter = Math.random() * exponential;
  return new Promise((resolve) => setTimeout(resolve, exponential + jitter));
}

async function withRetry<T>(
  stage: string,
  assetId: string,
  fn: () => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      await IngestService.incrementAttempts(assetId, message);
      console.error(
        `[ingest] Stage "${stage}" failed for asset ${assetId} (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`,
        message
      );
      if (attempt < MAX_RETRIES) {
        await delayWithJitter(attempt);
      } else {
        throw error;
      }
    }
  }
  // Unreachable, but satisfies TypeScript
  throw new Error(`Stage "${stage}" exhausted retries`);
}

export async function orchestratePipeline(
  assetId: string,
  sourceUrl: string,
  userId: string
): Promise<void> {
  try {
    // Stage 1: Fetch YouTube captions
    await IngestService.updateStatus(assetId, 'transcribing');
    emitAssetStatus(userId, assetId, 'transcribing');
    const result = await withRetry('transcribing', assetId, () =>
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

    // Concatenate all segments into full transcript, then chunk recursively
    const chunkItems = chunkTranscript(storedSegments);
    const embeddingItems: {
      segmentId: string;
      content: string;
      embedding: number[];
      model: string;
      dimensions: number;
    }[] = [];

    const EMBED_BATCH = 64;
    for (let i = 0; i < chunkItems.length; i += EMBED_BATCH) {
      const batch = chunkItems.slice(i, i + EMBED_BATCH);
      const vectors = await withRetry('embedding', assetId, () =>
        generateEmbeddings(batch.map((c) => c.content))
      );
      for (const [j, chunk] of batch.entries()) {
        const vector = vectors[j];
        if (!vector) {
          console.warn(`Missing embedding vector at index ${j} for asset ${assetId}`);
          continue;
        }
        embeddingItems.push({
          segmentId: chunk.segmentId,
          content: chunk.content,
          embedding: vector,
          model: EMBEDDING_MODEL_NAME,
          dimensions: EMBEDDING_DIMENSIONS,
        });
      }

      const done = Math.min(i + EMBED_BATCH, chunkItems.length);
      const pct = (done / chunkItems.length) * 100;
      emitAssetProgress(userId, assetId, 'embedding', pct, `Embedding chunks (${done}/${chunkItems.length})`);
    }

    if (embeddingItems.length > 0) {
      await IngestService.storeEmbeddings(embeddingItems);
    }

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
