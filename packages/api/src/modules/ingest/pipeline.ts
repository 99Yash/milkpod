import { chunkSegmentText, generateEmbeddings, EMBEDDING_MODEL_NAME, EMBEDDING_DIMENSIONS } from '@milkpod/ai/embeddings';
import { resolveAudioUrl } from './ytdlp';
import { transcribeAudio } from './elevenlabs';
import { groupWordsIntoSegments } from './segments';
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
    // Stage 1: Fetch direct audio URL
    await IngestService.updateStatus(assetId, 'fetching');
    emitAssetStatus(userId, assetId, 'fetching');
    const audioUrl = await withRetry('fetching', assetId, () =>
      resolveAudioUrl(sourceUrl)
    );

    // Stage 2: Transcribe audio
    await IngestService.updateStatus(assetId, 'transcribing');
    emitAssetStatus(userId, assetId, 'transcribing');
    const result = await withRetry('transcribing', assetId, () =>
      transcribeAudio(audioUrl)
    );
    const segments = groupWordsIntoSegments(result.words);
    const { segments: storedSegments } = await IngestService.storeTranscript(
      assetId,
      result.language_code,
      segments
    );

    // Stage 3: Generate and store embeddings
    await IngestService.updateStatus(assetId, 'embedding');
    emitAssetStatus(userId, assetId, 'embedding');
    const embeddingItems: {
      segmentId: string;
      content: string;
      embedding: number[];
      model: string;
      dimensions: number;
    }[] = [];

    const totalSegments = storedSegments.length;
    for (let si = 0; si < totalSegments; si++) {
      const seg = storedSegments[si]!;
      const chunks = chunkSegmentText(seg.text);
      if (chunks.length === 0) continue;

      const vectors = await withRetry('embedding', assetId, () =>
        generateEmbeddings(chunks)
      );
      for (let i = 0; i < chunks.length; i++) {
        embeddingItems.push({
          segmentId: seg.id,
          content: chunks[i]!,
          embedding: vectors[i]!,
          model: EMBEDDING_MODEL_NAME,
          dimensions: EMBEDDING_DIMENSIONS,
        });
      }

      // Emit sub-stage progress
      const pct = ((si + 1) / totalSegments) * 100;
      emitAssetProgress(userId, assetId, 'embedding', pct, `Embedding segments (${si + 1}/${totalSegments})`);
    }

    if (embeddingItems.length > 0) {
      await IngestService.storeEmbeddings(embeddingItems);
    }

    // Stage 4: Mark as ready
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
