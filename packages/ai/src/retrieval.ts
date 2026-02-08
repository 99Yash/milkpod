import { and, cosineDistance, desc, eq, gt, ne, sql } from 'drizzle-orm';
import { db } from '@milkpod/db';
import type { AssetId, CollectionId, TranscriptId } from '@milkpod/db/helpers';
import {
  embeddings,
  transcriptSegments,
  transcripts,
  collectionItems,
} from '@milkpod/db/schemas';
import { generateEmbedding, EMBEDDING_MODEL_NAME } from './embeddings';

export interface RelevantSegment {
  segmentId: string;
  text: string;
  startTime: number;
  endTime: number;
  speaker: string | null;
  transcriptId: string;
  similarity: number;
}

export interface RetrievalOptions {
  assetId?: AssetId;
  collectionId?: CollectionId;
  limit?: number;
  minSimilarity?: number;
}

export async function findRelevantSegments(
  query: string,
  options: RetrievalOptions = {}
): Promise<RelevantSegment[]> {
  const { assetId, collectionId, limit = 10, minSimilarity = 0.3 } = options;

  const queryEmbedding = await generateEmbedding(query);

  const similarity = sql<number>`1 - (${cosineDistance(embeddings.embedding, queryEmbedding)})`;

  const conditions = [gt(similarity, minSimilarity)];

  if (assetId) {
    conditions.push(eq(transcripts.assetId, assetId));
  }

  let queryBuilder = db
    .select({
      segmentId: transcriptSegments.id,
      text: transcriptSegments.text,
      startTime: transcriptSegments.startTime,
      endTime: transcriptSegments.endTime,
      speaker: transcriptSegments.speaker,
      transcriptId: transcriptSegments.transcriptId,
      similarity,
    })
    .from(embeddings)
    .innerJoin(
      transcriptSegments,
      eq(embeddings.segmentId, transcriptSegments.id)
    )
    .innerJoin(
      transcripts,
      eq(transcriptSegments.transcriptId, transcripts.id)
    );

  if (collectionId) {
    queryBuilder = queryBuilder.innerJoin(
      collectionItems,
      eq(collectionItems.assetId, transcripts.assetId)
    );
    conditions.push(eq(collectionItems.collectionId, collectionId));
  }

  const results = await queryBuilder
    .where(and(...conditions))
    .orderBy(desc(similarity))
    .limit(limit);

  // Warn if any stored embeddings were generated with a different model
  if (results.length > 0) {
    const [mismatch] = await db
      .select({ model: embeddings.model })
      .from(embeddings)
      .where(ne(embeddings.model, EMBEDDING_MODEL_NAME))
      .limit(1);

    if (mismatch) {
      console.warn(
        `[retrieval] Embedding model mismatch: query uses "${EMBEDDING_MODEL_NAME}" but stored embeddings include "${mismatch.model}". Results may be degraded.`
      );
    }
  }

  return results;
}

export async function getTranscriptContext(
  transcriptId: TranscriptId,
  startTime: number,
  endTime: number,
  windowSeconds = 30
): Promise<
  {
    id: string;
    text: string;
    startTime: number;
    endTime: number;
    speaker: string | null;
  }[]
> {
  return db
    .select({
      id: transcriptSegments.id,
      text: transcriptSegments.text,
      startTime: transcriptSegments.startTime,
      endTime: transcriptSegments.endTime,
      speaker: transcriptSegments.speaker,
    })
    .from(transcriptSegments)
    .where(
      and(
        eq(transcriptSegments.transcriptId, transcriptId),
        gt(transcriptSegments.startTime, startTime - windowSeconds),
        gt(sql`${endTime + windowSeconds}`, transcriptSegments.endTime)
      )
    )
    .orderBy(transcriptSegments.startTime);
}
