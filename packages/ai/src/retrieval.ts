import { and, asc, cosineDistance, count, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { db } from '@milkpod/db';
import {
  embeddings,
  transcriptSegments,
  transcripts,
  collectionItems,
  videoContextEmbeddings,
  videoContextSegments,
} from '@milkpod/db/schemas';
import { generateEmbedding, generateEmbeddingWith } from './embeddings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
}

// ---------------------------------------------------------------------------
// Distinct-model helpers
// ---------------------------------------------------------------------------

async function distinctTranscriptModels(
  assetId?: string,
  collectionId?: string,
): Promise<string[]> {
  let q = db()
    .selectDistinct({ model: embeddings.model })
    .from(embeddings)
    .innerJoin(transcriptSegments, eq(embeddings.segmentId, transcriptSegments.id))
    .innerJoin(transcripts, eq(transcriptSegments.transcriptId, transcripts.id));

  const conditions = [];
  if (assetId) conditions.push(eq(transcripts.assetId, assetId));

  if (collectionId) {
    q = q.innerJoin(collectionItems, eq(collectionItems.assetId, transcripts.assetId));
    conditions.push(eq(collectionItems.collectionId, collectionId));
  }

  const rows = conditions.length > 0
    ? await q.where(and(...conditions))
    : await q;

  return rows.map((r) => r.model);
}

async function distinctVisualModels(
  assetId?: string,
  collectionId?: string,
): Promise<string[]> {
  let q = db()
    .selectDistinct({ model: videoContextEmbeddings.model })
    .from(videoContextEmbeddings)
    .innerJoin(
      videoContextSegments,
      eq(videoContextEmbeddings.segmentId, videoContextSegments.id),
    );

  const conditions = [];
  if (assetId) conditions.push(eq(videoContextSegments.assetId, assetId));

  if (collectionId) {
    q = q.innerJoin(
      collectionItems,
      eq(collectionItems.assetId, videoContextSegments.assetId),
    );
    conditions.push(eq(collectionItems.collectionId, collectionId));
  }

  const rows = conditions.length > 0
    ? await q.where(and(...conditions))
    : await q;

  return rows.map((r) => r.model);
}

// ---------------------------------------------------------------------------
// Query-embedding resolution
// ---------------------------------------------------------------------------

/**
 * Generate a query embedding that matches the given model id.
 * Uses `generateEmbeddingWith` for targeted generation; if the model is
 * unknown (e.g. legacy data), falls back to the default provider chain.
 */
async function queryEmbeddingFor(
  modelId: string,
  query: string,
): Promise<number[]> {
  try {
    return await generateEmbeddingWith(modelId, query);
  } catch {
    // Unknown model (legacy data?) — use default fallback chain
    const result = await generateEmbedding(query);
    return result.embedding;
  }
}

// ---------------------------------------------------------------------------
// Transcript retrieval
// ---------------------------------------------------------------------------

export async function findRelevantSegments(
  query: string,
  options: RetrievalOptions = {},
): Promise<RelevantSegment[]> {
  const { assetId, collectionId, limit = 10, minSimilarity = 0.3 } = options;

  if (!assetId && !collectionId) return [];

  const models = await distinctTranscriptModels(assetId, collectionId);
  if (models.length === 0) return [];

  // Generate query embeddings per model in parallel
  const modelEmbeddings = await Promise.all(
    models.map(async (modelId) => ({
      modelId,
      embedding: await queryEmbeddingFor(modelId, query),
    })),
  );

  // Run per-model similarity queries in parallel
  const perModelResults = await Promise.all(
    modelEmbeddings.map(({ modelId, embedding: qe }) => {
      const similarity = sql<number>`1 - (${cosineDistance(embeddings.embedding, qe)})`;

      const conditions = [
        gt(similarity, minSimilarity),
        eq(embeddings.model, modelId),
      ];

      if (assetId) conditions.push(eq(transcripts.assetId, assetId));

      let qb = db()
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
        .innerJoin(transcriptSegments, eq(embeddings.segmentId, transcriptSegments.id))
        .innerJoin(transcripts, eq(transcriptSegments.transcriptId, transcripts.id));

      if (collectionId) {
        qb = qb.innerJoin(
          collectionItems,
          eq(collectionItems.assetId, transcripts.assetId),
        );
        conditions.push(eq(collectionItems.collectionId, collectionId));
      }

      return qb
        .where(and(...conditions))
        .orderBy(desc(similarity))
        .limit(limit);
    }),
  );

  // Merge, deduplicate by segmentId, sort by similarity, take top N
  const seen = new Set<string>();
  return perModelResults
    .flat()
    .sort((a, b) => b.similarity - a.similarity)
    .filter((r) => {
      if (seen.has(r.segmentId)) return false;
      seen.add(r.segmentId);
      return true;
    })
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Visual retrieval
// ---------------------------------------------------------------------------

export async function findRelevantVisualSegments(
  query: string,
  options: RetrievalOptions = {},
): Promise<RelevantVisualSegment[]> {
  const { assetId, collectionId, limit = 5, minSimilarity = 0.3 } = options;

  if (!assetId && !collectionId) return [];

  const models = await distinctVisualModels(assetId, collectionId);
  if (models.length === 0) return [];

  const modelEmbeddings = await Promise.all(
    models.map(async (modelId) => ({
      modelId,
      embedding: await queryEmbeddingFor(modelId, query),
    })),
  );

  const perModelResults = await Promise.all(
    modelEmbeddings.map(({ modelId, embedding: qe }) => {
      const similarity = sql<number>`1 - (${cosineDistance(videoContextEmbeddings.embedding, qe)})`;

      const conditions = [
        gt(similarity, minSimilarity),
        eq(videoContextEmbeddings.model, modelId),
      ];

      if (assetId) conditions.push(eq(videoContextSegments.assetId, assetId));

      let qb = db()
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
          eq(videoContextEmbeddings.segmentId, videoContextSegments.id),
        );

      if (collectionId) {
        qb = qb.innerJoin(
          collectionItems,
          eq(collectionItems.assetId, videoContextSegments.assetId),
        );
        conditions.push(eq(collectionItems.collectionId, collectionId));
      }

      return qb
        .where(and(...conditions))
        .orderBy(desc(similarity))
        .limit(limit);
    }),
  );

  const seen = new Set<string>();
  return perModelResults
    .flat()
    .sort((a, b) => b.similarity - a.similarity)
    .filter((r) => {
      if (seen.has(r.segmentId)) return false;
      seen.add(r.segmentId);
      return true;
    })
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Transcript overview & context (unchanged — no embedding involved)
// ---------------------------------------------------------------------------

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
