import { and, asc, cosineDistance, count, desc, eq, gt, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@milkpod/db';
import {
  embeddings,
  transcriptSegments,
  transcripts,
  collectionItems,
  videoContextEmbeddings,
  videoContextSegments,
} from '@milkpod/db/schemas';
import { generateEmbedding, EMBEDDING_MODEL_NAME } from './embeddings';

const segmentFields = {
  id: transcriptSegments.id,
  text: transcriptSegments.text,
  startTime: transcriptSegments.startTime,
  endTime: transcriptSegments.endTime,
  speaker: transcriptSegments.speaker,
} as const;

export interface RelevantSegment {
  segmentId: string;
  text: string;
  startTime: number;
  endTime: number;
  speaker: string | null;
  transcriptId: string;
  similarity: number;
}

export interface RelevantVisualSegment {
  segmentId: string;
  summary: string;
  ocrText: string | null;
  entities: string[] | null;
  startTime: number;
  endTime: number;
  confidence: number | null;
  similarity: number;
}

export interface RetrievalOptions {
  assetId?: string;
  collectionId?: string;
  limit?: number;
  minSimilarity?: number;
  queryEmbedding?: number[];
}

export async function findRelevantSegments(
  query: string,
  options: RetrievalOptions = {}
): Promise<RelevantSegment[]> {
  const { assetId, collectionId, limit = 10, minSimilarity = 0.3 } = options;

  // Require at least one scope to prevent cross-tenant retrieval
  if (!assetId && !collectionId) return [];

  const queryEmbedding = options.queryEmbedding ?? await generateEmbedding(query);

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

export async function findRelevantVisualSegments(
  query: string,
  options: RetrievalOptions = {}
): Promise<RelevantVisualSegment[]> {
  const { assetId, collectionId, limit = 5, minSimilarity = 0.3 } = options;

  // Require at least one scope to prevent cross-tenant retrieval
  if (!assetId && !collectionId) return [];

  const queryEmbedding = options.queryEmbedding ?? await generateEmbedding(query);

  const similarity = sql<number>`1 - (${cosineDistance(videoContextEmbeddings.embedding, queryEmbedding)})`;

  const conditions = [gt(similarity, minSimilarity)];

  if (assetId) {
    conditions.push(eq(videoContextSegments.assetId, assetId));
  }

  let queryBuilder = db()
    .select({
      segmentId: videoContextSegments.id,
      summary: videoContextSegments.summary,
      ocrText: videoContextSegments.ocrText,
      entities: videoContextSegments.entities,
      startTime: videoContextSegments.startTime,
      endTime: videoContextSegments.endTime,
      confidence: videoContextSegments.confidence,
      similarity,
    })
    .from(videoContextEmbeddings)
    .innerJoin(
      videoContextSegments,
      eq(videoContextEmbeddings.segmentId, videoContextSegments.id)
    );

  if (collectionId) {
    queryBuilder = queryBuilder.innerJoin(
      collectionItems,
      eq(collectionItems.assetId, videoContextSegments.assetId)
    );
    conditions.push(eq(collectionItems.collectionId, collectionId));
  }

  return queryBuilder
    .where(and(...conditions))
    .orderBy(desc(similarity))
    .limit(limit);
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
  const transcriptRows = await db()
    .select({ id: transcripts.id })
    .from(transcripts)
    .where(eq(transcripts.assetId, assetId))
    .orderBy(desc(transcripts.createdAt))
    .limit(10);

  const latestTranscript = transcriptRows[0];
  if (!latestTranscript) return null;

  let transcript = latestTranscript;

  if (transcriptRows.length > 1) {
    const transcriptIds = transcriptRows.map((row) => row.id);
    const transcriptRowsWithSegments = await db()
      .select({ transcriptId: transcriptSegments.transcriptId })
      .from(transcriptSegments)
      .where(inArray(transcriptSegments.transcriptId, transcriptIds))
      .groupBy(transcriptSegments.transcriptId);

    const transcriptIdsWithSegments = new Set(
      transcriptRowsWithSegments.map((row) => row.transcriptId),
    );

    transcript =
      transcriptRows.find((row) => transcriptIdsWithSegments.has(row.id))
      ?? latestTranscript;
  }

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
      .select(segmentFields)
      .from(transcriptSegments)
      .where(eq(transcriptSegments.transcriptId, transcript.id))
      .orderBy(asc(transcriptSegments.startTime));

    return { transcriptId: transcript.id, totalSegments: total, sampledSegments: segments };
  }

  // Evenly sample using modular arithmetic on segment_index
  const step = Math.floor(total / maxSegments);
  const segments = await db()
    .select(segmentFields)
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
    .select(segmentFields)
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
