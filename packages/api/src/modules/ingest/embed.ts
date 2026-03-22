import {
  chunkTranscript,
  generateEmbeddings,
  EMBEDDING_DIMENSIONS,
} from '@milkpod/ai/embeddings';
import { emitAssetProgress } from '../../events/asset-events';
import { IngestService } from './service';

type StoredSegment = {
  id: string;
  text: string;
  [key: string]: unknown;
};

const EMBED_BATCH = 64;

/**
 * Chunk stored transcript segments, generate embeddings in batches,
 * and persist them. Shared between YouTube ingest and podcast episode pipelines.
 */
export async function embedSegments(opts: {
  entityId: string;
  userId: string;
  assetId: string;
  storedSegments: StoredSegment[];
  retry: <T>(stage: string, fn: () => Promise<T>) => Promise<T>;
}): Promise<void> {
  const { entityId, userId, assetId, storedSegments, retry } = opts;

  const chunkItems = chunkTranscript(storedSegments);
  const embeddingItems: {
    segmentId: string;
    content: string;
    embedding: number[];
    model: string;
    dimensions: number;
  }[] = [];

  for (let i = 0; i < chunkItems.length; i += EMBED_BATCH) {
    const batch = chunkItems.slice(i, i + EMBED_BATCH);
    const result = await retry('embedding', () =>
      generateEmbeddings(batch.map((c) => c.content))
    );
    for (const [j, chunk] of batch.entries()) {
      const vector = result.embeddings[j];
      if (!vector) {
        console.warn(`Missing embedding vector at index ${j} for ${entityId}`);
        continue;
      }
      embeddingItems.push({
        segmentId: chunk.segmentId,
        content: chunk.content,
        embedding: vector,
        model: result.model,
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
}
