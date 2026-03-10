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

// --- Language detection helpers ---

function countUnicodeLetters(text: string): number {
  let n = 0;
  for (const ch of text) {
    if (/\p{L}/u.test(ch)) n++;
  }
  return n;
}

function countLatinLetters(text: string): number {
  let n = 0;
  for (const ch of text) {
    if (/[a-zA-Z]/.test(ch)) n++;
  }
  return n;
}

/** Minimum ts_rank to consider an FTS hit "high-confidence" in semantic-first mode. */
const LEXICAL_SUPPLEMENT_RANK = 0.1;

export abstract class TranscriptSearchService {
  static async search(
    assetId: string,
    query: string,
    limit = 50
  ): Promise<TranscriptSearchResult[]> {
    const [transcript] = await db()
      .select({ id: transcripts.id, language: transcripts.language })
      .from(transcripts)
      .where(eq(transcripts.assetId, assetId))
      .limit(1);

    if (!transcript) return [];

    // --- Language-aware retrieval heuristic ---
    const isEnglishTranscript =
      transcript.language?.toLowerCase().startsWith('en') ?? false;
    const letterCount = countUnicodeLetters(query);
    const latinCount = countLatinLetters(query);
    const latinRatio = letterCount === 0 ? 0 : latinCount / letterCount;
    const tsquery = buildTsQuery(query);
    const hasLexicalQuery = tsquery != null && tsquery.length > 0;

    const useHybridLexical =
      isEnglishTranscript && latinRatio >= 0.6 && hasLexicalQuery;

    if (useHybridLexical) {
      return this.hybridSearch(transcript.id, assetId, query, limit);
    }

    return this.semanticFirstSearch(transcript.id, assetId, query, limit);
  }

  /**
   * Hybrid ranked search for English-like queries on English transcripts.
   * Blends lexical (FTS) and semantic scores: 0.65 * lexical_norm + 0.35 * semantic_norm.
   */
  private static async hybridSearch(
    transcriptId: string,
    assetId: string,
    query: string,
    limit: number
  ): Promise<TranscriptSearchResult[]> {
    const [ftsResults, semanticResults] = await Promise.all([
      this.ftsSearch(transcriptId, query, limit),
      this.semanticSearch(assetId, query, limit),
    ]);

    const ftsMax = Math.max(...ftsResults.map((r) => r.rank), 0.001);
    const semMax = Math.max(...semanticResults.map((r) => r.rank), 0.001);

    const scoreMap = new Map<
      string,
      { ftsNorm: number; semNorm: number; result: TranscriptSearchResult }
    >();

    for (const r of ftsResults) {
      scoreMap.set(r.segmentId, {
        ftsNorm: r.rank / ftsMax,
        semNorm: 0,
        result: r,
      });
    }

    for (const r of semanticResults) {
      const existing = scoreMap.get(r.segmentId);
      if (existing) {
        existing.semNorm = r.rank / semMax;
      } else {
        scoreMap.set(r.segmentId, {
          ftsNorm: 0,
          semNorm: r.rank / semMax,
          result: r,
        });
      }
    }

    const blended = [...scoreMap.values()]
      .map(({ ftsNorm, semNorm, result }) => ({
        ...result,
        rank: 0.65 * ftsNorm + 0.35 * semNorm,
      }))
      .sort((a, b) => b.rank - a.rank)
      .slice(0, limit);

    return blended;
  }

  /**
   * Semantic-first search for non-English queries or non-English transcripts.
   * Lexical results are appended only when high-confidence matches exist.
   */
  private static async semanticFirstSearch(
    transcriptId: string,
    assetId: string,
    query: string,
    limit: number
  ): Promise<TranscriptSearchResult[]> {
    const results = await this.semanticSearch(assetId, query, limit);

    if (results.length >= limit) return results;

    // Supplement with high-confidence lexical matches
    const ftsResults = await this.ftsSearch(transcriptId, query, limit);
    const seen = new Set(results.map((r) => r.segmentId));

    for (const r of ftsResults) {
      if (
        !seen.has(r.segmentId) &&
        r.rank >= LEXICAL_SUPPLEMENT_RANK &&
        results.length < limit
      ) {
        seen.add(r.segmentId);
        results.push(r);
      }
    }

    return results;
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
