import { and, asc, cosineDistance, count, desc, eq, gt, ne, sql } from 'drizzle-orm';
import { db } from '@milkpod/db';
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
  assetId?: string;
  collectionId?: string;
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

  let queryBuilder = db()
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
    const [mismatch] = await db()
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

export interface TranscriptOverview {
  transcriptId: string;
  totalSegments: number;
  sampledSegments: {
    id: string;
    text: string;
    startTime: number;
    endTime: number;
    speaker: string | null;
  }[];
}

/**
 * Returns an evenly-sampled overview of the full transcript.
 * Used for broad tasks like summarization, key points, and action items
 * where vector search isn't appropriate.
 */
export async function getTranscriptOverview(
  assetId: string,
  maxSegments = 60
): Promise<TranscriptOverview | null> {
  // Find the transcript for this asset
  const [transcript] = await db()
    .select({ id: transcripts.id })
    .from(transcripts)
    .where(eq(transcripts.assetId, assetId))
    .limit(1);

  if (!transcript) return null;

  // Get total count
  const countResult = await db()
    .select({ total: count() })
    .from(transcriptSegments)
    .where(eq(transcriptSegments.transcriptId, transcript.id));

  const total = countResult[0]?.total ?? 0;
  if (total === 0) return null;

  // If total is within budget, return all segments
  if (total <= maxSegments) {
    const segments = await db()
      .select({
        id: transcriptSegments.id,
        text: transcriptSegments.text,
        startTime: transcriptSegments.startTime,
        endTime: transcriptSegments.endTime,
        speaker: transcriptSegments.speaker,
      })
      .from(transcriptSegments)
      .where(eq(transcriptSegments.transcriptId, transcript.id))
      .orderBy(asc(transcriptSegments.startTime));

    return { transcriptId: transcript.id, totalSegments: total, sampledSegments: segments };
  }

  // Evenly sample using modular arithmetic on segment_index
  const step = Math.floor(total / maxSegments);
  const segments = await db()
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
        eq(transcriptSegments.transcriptId, transcript.id),
        sql`${transcriptSegments.segmentIndex} % ${step} = 0`
      )
    )
    .orderBy(asc(transcriptSegments.startTime));

  return { transcriptId: transcript.id, totalSegments: total, sampledSegments: segments };
}

export async function getTranscriptContext(
  transcriptId: string,
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
  return db()
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
