import { db } from '@milkpod/db';
import { transcripts, transcriptSegments } from '@milkpod/db/schemas';
import { and, eq, sql } from 'drizzle-orm';
import { findRelevantSegments } from '@milkpod/ai';
import { buildTsQuery } from './number-words';

export interface TranscriptSearchResult {
  segmentId: string;
  text: string;
  startTime: number;
  endTime: number;
  speaker: string | null;
  rank: number;
  source: 'fts' | 'semantic';
}

const FTS_FALLBACK_THRESHOLD = 3;

export abstract class TranscriptSearchService {
  static async search(
    assetId: string,
    query: string,
    limit = 50
  ): Promise<TranscriptSearchResult[]> {
    // Find the transcript for this asset
    const [transcript] = await db()
      .select({ id: transcripts.id })
      .from(transcripts)
      .where(eq(transcripts.assetId, assetId))
      .limit(1);

    if (!transcript) return [];

    // Try FTS first
    const ftsResults = await this.ftsSearch(
      transcript.id,
      query,
      limit
    );

    // If FTS returns enough results, return them
    if (ftsResults.length >= FTS_FALLBACK_THRESHOLD) {
      return ftsResults;
    }

    // Fallback to semantic search
    const semanticResults = await this.semanticSearch(assetId, query, limit);

    // Merge: FTS results take priority, deduplicate by segmentId
    const seen = new Set(ftsResults.map((r) => r.segmentId));
    const merged = [...ftsResults];

    for (const sr of semanticResults) {
      if (!seen.has(sr.segmentId) && merged.length < limit) {
        seen.add(sr.segmentId);
        merged.push(sr);
      }
    }

    return merged;
  }

  private static async ftsSearch(
    transcriptId: string,
    query: string,
    limit: number
  ): Promise<TranscriptSearchResult[]> {
    const tsquery = buildTsQuery(query);
    if (!tsquery) return [];

    const tsVec = sql`to_tsvector('english', ${transcriptSegments.text})`;
    const tsQ = sql`to_tsquery('english', ${tsquery})`;

    const rows = await db()
      .select({
        segmentId: transcriptSegments.id,
        text: transcriptSegments.text,
        startTime: transcriptSegments.startTime,
        endTime: transcriptSegments.endTime,
        speaker: transcriptSegments.speaker,
        rank: sql<number>`ts_rank(${tsVec}, ${tsQ})`,
      })
      .from(transcriptSegments)
      .where(
        and(
          eq(transcriptSegments.transcriptId, transcriptId),
          sql`${tsVec} @@ ${tsQ}`
        )
      )
      .orderBy(sql`ts_rank(${tsVec}, ${tsQ}) desc`)
      .limit(limit);

    return rows.map((r) => ({ ...r, source: 'fts' as const }));
  }

  private static async semanticSearch(
    assetId: string,
    query: string,
    limit: number
  ): Promise<TranscriptSearchResult[]> {
    const segments = await findRelevantSegments(query, {
      assetId,
      limit,
    });

    return segments.map((s) => ({
      segmentId: s.segmentId,
      text: s.text,
      startTime: s.startTime,
      endTime: s.endTime,
      speaker: s.speaker,
      rank: s.similarity,
      source: 'semantic' as const,
    }));
  }
}
