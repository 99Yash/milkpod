import type { InferSelectModel } from 'drizzle-orm';
import type { transcriptSegments } from '@milkpod/db/schemas';

type TranscriptSegment = Pick<
  InferSelectModel<typeof transcriptSegments>,
  'id' | 'text' | 'startTime' | 'endTime'
>;

export type MomentChunkConfig = {
  chunkSize: number;
  overlap: number;
  maxCandidatesPerChunk: number;
};

const MIN_CHUNK = 500;
const MAX_CHUNK = 2_000;
const SCALE_CEIL = 80_000;

export function getMomentChunkConfig(totalChars: number): MomentChunkConfig {
  const t = Math.min(1, Math.max(0, totalChars / SCALE_CEIL));
  const chunkSize = Math.round(MIN_CHUNK + t * (MAX_CHUNK - MIN_CHUNK));
  const overlap = Math.round(chunkSize * 0.15);
  const maxCandidatesPerChunk = chunkSize < 1_000 ? 2 : chunkSize < 1_600 ? 3 : 4;

  return { chunkSize, overlap, maxCandidatesPerChunk };
}

export type MomentChunk = {
  text: string;
  startTime: number;
  endTime: number;
  segmentIds: string[];
};

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

    while (i + chunkSegments.length < segments.length) {
      const seg = segments[i + chunkSegments.length]!;
      const added = charCount + seg.text.length;
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
