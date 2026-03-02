import type { InferSelectModel } from 'drizzle-orm';
import type { transcriptSegments } from '@milkpod/db/schemas';

type TranscriptSegment = Pick<
  InferSelectModel<typeof transcriptSegments>,
  'id' | 'text' | 'startTime' | 'endTime'
>;

// ---------------------------------------------------------------------------
// Dynamic chunk config — scales with transcript length (2000 char upper bound)
// ---------------------------------------------------------------------------

export type MomentChunkConfig = {
  chunkSize: number;
  overlap: number;
  maxCandidatesPerChunk: number;
};

export function getMomentChunkConfig(totalChars: number): MomentChunkConfig {
  if (totalChars <= 8_000)
    return { chunkSize: 900, overlap: 120, maxCandidatesPerChunk: 2 };
  if (totalChars <= 20_000)
    return { chunkSize: 1_200, overlap: 160, maxCandidatesPerChunk: 2 };
  if (totalChars <= 45_000)
    return { chunkSize: 1_500, overlap: 220, maxCandidatesPerChunk: 3 };
  if (totalChars <= 80_000)
    return { chunkSize: 1_800, overlap: 260, maxCandidatesPerChunk: 3 };
  return { chunkSize: 2_000, overlap: 300, maxCandidatesPerChunk: 4 };
}

// ---------------------------------------------------------------------------
// Chunk segments into time-windowed blocks for LLM moment extraction
// ---------------------------------------------------------------------------

export type MomentChunk = {
  text: string;
  startTime: number;
  endTime: number;
  segmentIds: string[];
};

/**
 * Groups transcript segments into character-bounded chunks with overlap.
 *
 * Unlike the embedding chunker (`chunkTranscript` in `@milkpod/ai`), this
 * operates on full segment boundaries — it never splits a segment mid-text —
 * and preserves time metadata needed for moment extraction.
 *
 * Overlap is achieved by rewinding from the end of each chunk: segments whose
 * cumulative text length falls within the overlap budget are included in the
 * next chunk as well, giving the LLM continuity across windows.
 */
export function chunkSegmentsForMoments(
  segments: TranscriptSegment[],
  config: MomentChunkConfig,
): MomentChunk[] {
  if (segments.length === 0) return [];

  const { chunkSize, overlap } = config;
  const chunks: MomentChunk[] = [];

  let i = 0;
  while (i < segments.length) {
    let charCount = 0;
    const chunkSegments: TranscriptSegment[] = [];

    // Accumulate segments until we hit the chunk size
    while (i + chunkSegments.length < segments.length) {
      const seg = segments[i + chunkSegments.length]!;
      const added = charCount + seg.text.length;
      // Allow at least one segment per chunk even if it exceeds chunkSize
      if (added > chunkSize && chunkSegments.length > 0) break;
      chunkSegments.push(seg);
      charCount = added;
    }

    chunks.push({
      text: chunkSegments.map((s) => s.text).join('\n'),
      startTime: chunkSegments[0]!.startTime,
      endTime: chunkSegments[chunkSegments.length - 1]!.endTime,
      segmentIds: chunkSegments.map((s) => s.id),
    });

    // Advance pointer — rewind by overlap amount so the next chunk
    // repeats trailing segments for LLM continuity.
    // rewind is at most chunkSegments.length - 1 (j >= 1 guard), so i
    // always advances by at least 1.
    const nextStart = i + chunkSegments.length;
    let overlapChars = 0;
    let rewind = 0;
    for (let j = chunkSegments.length - 1; j >= 1; j--) {
      overlapChars += chunkSegments[j]!.text.length;
      if (overlapChars >= overlap) break;
      rewind++;
    }
    i = nextStart - rewind;
  }

  return chunks;
}
