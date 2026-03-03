import { describe, expect, it } from 'vitest';
import {
  getMomentChunkConfig,
  chunkSegmentsForMoments,
  type MomentChunkConfig,
} from './chunking';

// ---------------------------------------------------------------------------
// getMomentChunkConfig
// ---------------------------------------------------------------------------

describe('getMomentChunkConfig', () => {
  it('returns minimum chunk size (500) for empty transcripts', () => {
    const config = getMomentChunkConfig(0);
    expect(config.chunkSize).toBe(500);
    expect(config.maxCandidatesPerChunk).toBe(2);
  });

  it('scales chunk size linearly with transcript length', () => {
    const small = getMomentChunkConfig(10_000);
    const medium = getMomentChunkConfig(40_000);
    const large = getMomentChunkConfig(70_000);

    expect(small.chunkSize).toBeLessThan(medium.chunkSize);
    expect(medium.chunkSize).toBeLessThan(large.chunkSize);
  });

  it('reaches max chunk size (2000) at 80k chars', () => {
    expect(getMomentChunkConfig(80_000).chunkSize).toBe(2000);
  });

  it('caps at 2000 for transcripts beyond 80k chars', () => {
    expect(getMomentChunkConfig(100_000).chunkSize).toBe(2000);
    expect(getMomentChunkConfig(500_000).chunkSize).toBe(2000);
  });

  it('never returns chunkSize exceeding 2000', () => {
    for (const size of [0, 1000, 10_000, 50_000, 100_000, 500_000]) {
      expect(getMomentChunkConfig(size).chunkSize).toBeLessThanOrEqual(2000);
    }
  });

  it('sets overlap to ~15% of chunk size', () => {
    for (const size of [0, 20_000, 40_000, 80_000]) {
      const config = getMomentChunkConfig(size);
      expect(config.overlap).toBe(Math.round(config.chunkSize * 0.15));
    }
  });

  it('scales maxCandidatesPerChunk with chunk size', () => {
    // small transcript → 2 candidates
    expect(getMomentChunkConfig(5_000).maxCandidatesPerChunk).toBe(2);
    // medium transcript → 3 candidates
    expect(getMomentChunkConfig(40_000).maxCandidatesPerChunk).toBe(3);
    // large transcript → 4 candidates
    expect(getMomentChunkConfig(80_000).maxCandidatesPerChunk).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// chunkSegmentsForMoments
// ---------------------------------------------------------------------------

function makeSegment(id: string, text: string, startTime: number, endTime: number) {
  return { id, text, startTime, endTime };
}

describe('chunkSegmentsForMoments', () => {
  const config: MomentChunkConfig = {
    chunkSize: 100,
    overlap: 20,
    maxCandidatesPerChunk: 2,
  };

  it('returns empty array for empty segments', () => {
    expect(chunkSegmentsForMoments([], config)).toEqual([]);
  });

  it('puts all segments in one chunk when total text fits (no overlap)', () => {
    const noOverlapConfig: MomentChunkConfig = {
      chunkSize: 100,
      overlap: 0,
      maxCandidatesPerChunk: 2,
    };
    const segments = [
      makeSegment('s1', 'Hello world', 0, 5),
      makeSegment('s2', 'Foo bar baz', 5, 10),
    ];
    const chunks = chunkSegmentsForMoments(segments, noOverlapConfig);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.segmentIds).toEqual(['s1', 's2']);
    expect(chunks[0]!.startTime).toBe(0);
    expect(chunks[0]!.endTime).toBe(10);
  });

  it('first chunk contains all fitting segments even with overlap', () => {
    const segments = [
      makeSegment('s1', 'Hello world', 0, 5),
      makeSegment('s2', 'Foo bar baz', 5, 10),
    ];
    const chunks = chunkSegmentsForMoments(segments, config);
    // First chunk should contain both segments
    expect(chunks[0]!.segmentIds).toContain('s1');
    expect(chunks[0]!.segmentIds).toContain('s2');
    expect(chunks[0]!.startTime).toBe(0);
    expect(chunks[0]!.endTime).toBe(10);
  });

  it('splits into multiple chunks when text exceeds chunkSize', () => {
    // Each segment is 50 chars → chunkSize 100 → 2 segments per chunk
    const segments = [
      makeSegment('s1', 'A'.repeat(50), 0, 10),
      makeSegment('s2', 'B'.repeat(50), 10, 20),
      makeSegment('s3', 'C'.repeat(50), 20, 30),
      makeSegment('s4', 'D'.repeat(50), 30, 40),
    ];
    const chunks = chunkSegmentsForMoments(segments, config);
    expect(chunks.length).toBeGreaterThan(1);
    // All segments should appear in at least one chunk
    const allIds = chunks.flatMap((c) => c.segmentIds);
    expect(allIds).toContain('s1');
    expect(allIds).toContain('s2');
    expect(allIds).toContain('s3');
    expect(allIds).toContain('s4');
  });

  it('preserves time boundaries on each chunk', () => {
    const segments = [
      makeSegment('s1', 'A'.repeat(60), 5.0, 10.0),
      makeSegment('s2', 'B'.repeat(60), 10.0, 15.0),
      makeSegment('s3', 'C'.repeat(60), 15.0, 20.0),
    ];
    const chunks = chunkSegmentsForMoments(segments, config);
    for (const chunk of chunks) {
      expect(chunk.startTime).toBeGreaterThanOrEqual(5.0);
      expect(chunk.endTime).toBeLessThanOrEqual(20.0);
      expect(chunk.startTime).toBeLessThan(chunk.endTime);
    }
  });

  it('handles a single oversized segment (always includes at least one)', () => {
    const segments = [makeSegment('s1', 'X'.repeat(500), 0, 60)];
    const chunks = chunkSegmentsForMoments(segments, config);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.segmentIds).toEqual(['s1']);
    expect(chunks[0]!.text).toBe('X'.repeat(500));
  });

  it('includes overlap segments in adjacent chunks', () => {
    // With overlap = 20, trailing segments from one chunk should appear
    // at the start of the next chunk
    const segments = [
      makeSegment('s1', 'A'.repeat(40), 0, 10),
      makeSegment('s2', 'B'.repeat(40), 10, 20),
      makeSegment('s3', 'C'.repeat(15), 20, 25), // 15 chars < overlap (20)
      makeSegment('s4', 'D'.repeat(40), 25, 35),
      makeSegment('s5', 'E'.repeat(40), 35, 45),
    ];
    const chunks = chunkSegmentsForMoments(segments, config);
    // With overlap, some segment IDs should appear in more than one chunk
    const idCounts = new Map<string, number>();
    for (const chunk of chunks) {
      for (const id of chunk.segmentIds) {
        idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
      }
    }
    const hasOverlap = [...idCounts.values()].some((count) => count > 1);
    expect(hasOverlap).toBe(true);
  });

  it('chunk text is newline-joined segment texts', () => {
    const segments = [
      makeSegment('s1', 'Hello', 0, 5),
      makeSegment('s2', 'World', 5, 10),
    ];
    const chunks = chunkSegmentsForMoments(segments, config);
    expect(chunks[0]!.text).toBe('Hello\nWorld');
  });
});
