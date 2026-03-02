import { describe, expect, it } from 'vitest';
import {
  mergeOverlapping,
  computeStructuralScore,
  lookupQASignal,
  applyPresetBoost,
  rankCandidates,
  type LLMCandidate,
  type ScoredCandidate,
} from './generate';

// ---------------------------------------------------------------------------
// mergeOverlapping
// ---------------------------------------------------------------------------

function makeCandidate(
  startTime: number,
  endTime: number,
  confidence = 0.8,
  goalFit = 0.8,
): LLMCandidate {
  return {
    title: `Moment ${startTime}-${endTime}`,
    rationale: 'Test rationale',
    startTime,
    endTime,
    confidence,
    goalFit,
  };
}

describe('mergeOverlapping', () => {
  it('returns empty array for empty input', () => {
    expect(mergeOverlapping([])).toEqual([]);
  });

  it('returns single candidate unchanged', () => {
    const candidates = [makeCandidate(10, 30)];
    const result = mergeOverlapping(candidates);
    expect(result).toHaveLength(1);
    expect(result[0]!.startTime).toBe(10);
    expect(result[0]!.endTime).toBe(30);
  });

  it('does not merge non-overlapping candidates', () => {
    const candidates = [
      makeCandidate(0, 10),
      makeCandidate(20, 30),
      makeCandidate(40, 50),
    ];
    const result = mergeOverlapping(candidates);
    expect(result).toHaveLength(3);
  });

  it('merges candidates with >50% overlap', () => {
    // Candidate A: 0-20 (duration 20), Candidate B: 5-25 (duration 20)
    // Overlap: 5-20 = 15s. Min duration = 20. 15/20 = 75% > 50% → merge
    const candidates = [
      makeCandidate(0, 20, 0.9, 0.9),
      makeCandidate(5, 25, 0.7, 0.7),
    ];
    const result = mergeOverlapping(candidates);
    expect(result).toHaveLength(1);
    // Merged window should be extended
    expect(result[0]!.startTime).toBe(0);
    expect(result[0]!.endTime).toBe(25);
  });

  it('keeps the higher-scoring candidate when merging', () => {
    const candidates = [
      makeCandidate(0, 20, 0.5, 0.5), // lower score
      makeCandidate(5, 25, 0.9, 0.9), // higher score
    ];
    const result = mergeOverlapping(candidates);
    expect(result).toHaveLength(1);
    // Should keep the higher scorer's title
    expect(result[0]!.confidence).toBe(0.9);
    expect(result[0]!.goalFit).toBe(0.9);
  });

  it('does not merge candidates with <= 50% overlap', () => {
    // Candidate A: 0-20 (duration 20), Candidate B: 15-40 (duration 25)
    // Overlap: 15-20 = 5s. Min duration = 20. 5/20 = 25% <= 50% → no merge
    const candidates = [
      makeCandidate(0, 20),
      makeCandidate(15, 40),
    ];
    const result = mergeOverlapping(candidates);
    expect(result).toHaveLength(2);
  });

  it('handles unsorted input by sorting first', () => {
    const candidates = [
      makeCandidate(30, 50),
      makeCandidate(0, 10),
      makeCandidate(15, 25),
    ];
    const result = mergeOverlapping(candidates);
    // Should be sorted by startTime
    expect(result[0]!.startTime).toBe(0);
    expect(result[1]!.startTime).toBe(15);
    expect(result[2]!.startTime).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// computeStructuralScore
// ---------------------------------------------------------------------------

describe('computeStructuralScore', () => {
  it('returns 0 for empty text', () => {
    expect(computeStructuralScore('')).toBe(0);
  });

  it('returns a value between 0 and 1', () => {
    const score = computeStructuralScore('This is a regular sentence about nothing in particular.');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('scores higher for text with cue phrases', () => {
    const withCues = computeStructuralScore(
      "The key point is that this is the most important thing. Here's how you need to do it step one.",
    );
    const withoutCues = computeStructuralScore(
      'The weather today is very pleasant and the birds are singing in the trees nearby.',
    );
    expect(withCues).toBeGreaterThan(withoutCues);
  });

  it('scores higher for dense text with many sentences', () => {
    const dense = computeStructuralScore(
      'Do this first. Then do that. Next step is important. Finally wrap up. Always check results.',
    );
    const sparse = computeStructuralScore(
      'This is a very long sentence that just keeps going on and on without really saying much of anything particularly interesting or noteworthy to the reader who is still reading this',
    );
    expect(dense).toBeGreaterThan(sparse);
  });

  it('never exceeds 1', () => {
    // Pack as many cue phrases and dense content as possible
    const maxText =
      "The key point is the most important mistake. Here's how you need to step one. The secret game-changer number one first thing. This is why. Let me tell you. In summary.";
    expect(computeStructuralScore(maxText)).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// lookupQASignal
// ---------------------------------------------------------------------------

describe('lookupQASignal', () => {
  it('returns 0 for empty map', () => {
    expect(lookupQASignal(new Map(), 10, 20)).toBe(0);
  });

  it('returns signal when time range overlaps a key', () => {
    const qaMap = new Map([['15', 0.8]]);
    expect(lookupQASignal(qaMap, 10, 20)).toBe(0.8);
  });

  it('returns 0 when no key falls within range', () => {
    const qaMap = new Map([['5', 0.9]]);
    expect(lookupQASignal(qaMap, 10, 20)).toBe(0);
  });

  it('returns max signal when multiple keys overlap', () => {
    const qaMap = new Map([
      ['11', 0.3],
      ['15', 0.9],
      ['18', 0.5],
    ]);
    expect(lookupQASignal(qaMap, 10, 20)).toBe(0.9);
  });

  it('checks integer seconds at range boundaries', () => {
    const qaMap = new Map([['10', 0.7]]);
    // floor(10.5) = 10, which is in the map
    expect(lookupQASignal(qaMap, 10.5, 15)).toBe(0.7);
  });
});

// ---------------------------------------------------------------------------
// applyPresetBoost
// ---------------------------------------------------------------------------

describe('applyPresetBoost', () => {
  function makeScoredCandidate(startTime: number, endTime: number): ScoredCandidate {
    return {
      title: 'Test',
      rationale: 'Test',
      startTime,
      endTime,
      llmScore: 0.8,
      qaSignal: 0.5,
      structuralScore: 0.6,
      finalScore: 0.7,
    };
  }

  it('returns 0 boost for default preset', () => {
    const candidate = makeScoredCandidate(10, 30);
    expect(applyPresetBoost(candidate, 'default', 100, 'some text')).toBe(0);
  });

  it('boosts hook preset for early timeline position', () => {
    const candidate = makeScoredCandidate(5, 15); // 5% into a 100s video
    const boost = applyPresetBoost(candidate, 'hook', 100, 'some text');
    expect(boost).toBeGreaterThanOrEqual(0.1);
  });

  it('does not boost hook preset for late timeline position', () => {
    const candidate = makeScoredCandidate(80, 90); // 80% into a 100s video
    const boost = applyPresetBoost(candidate, 'hook', 100, 'regular text');
    expect(boost).toBe(0);
  });

  it('boosts hook preset for surprise language', () => {
    const candidate = makeScoredCandidate(50, 60);
    const boost = applyPresetBoost(candidate, 'hook', 100, 'wait, this is actually surprising');
    expect(boost).toBe(0.05);
  });

  it('boosts actionable preset for imperative language', () => {
    const candidate = makeScoredCandidate(50, 60);
    const boost = applyPresetBoost(candidate, 'actionable', 100, 'you should try this step 1');
    expect(boost).toBe(0.1);
  });

  it('boosts quote preset for short duration', () => {
    const candidate = makeScoredCandidate(50, 70); // 20s < 30s threshold
    const boost = applyPresetBoost(candidate, 'quote', 100, 'some text');
    expect(boost).toBe(0.08);
  });

  it('does not boost quote preset for long duration', () => {
    const candidate = makeScoredCandidate(0, 60); // 60s > 30s threshold
    const boost = applyPresetBoost(candidate, 'quote', 100, 'some text');
    expect(boost).toBe(0);
  });

  it('boosts story preset for emotional language', () => {
    const candidate = makeScoredCandidate(50, 60);
    const boost = applyPresetBoost(candidate, 'story', 100, 'I remember the moment I realized');
    expect(boost).toBe(0.1);
  });

  it('boosts insight preset for conceptual language', () => {
    const candidate = makeScoredCandidate(50, 60);
    const boost = applyPresetBoost(candidate, 'insight', 100, 'the reason this framework works is because');
    expect(boost).toBe(0.08);
  });
});

// ---------------------------------------------------------------------------
// rankCandidates
// ---------------------------------------------------------------------------

describe('rankCandidates', () => {
  it('returns empty array for empty candidates', () => {
    const result = rankCandidates([], new Map(), new Map(), 'default', 100, 10);
    expect(result).toEqual([]);
  });

  it('ranks candidates by final score descending', () => {
    const candidates = [
      makeCandidate(0, 10, 0.5, 0.5),   // low score
      makeCandidate(20, 30, 0.9, 0.9),   // high score
      makeCandidate(40, 50, 0.7, 0.7),   // medium score
    ];
    const result = rankCandidates(candidates, new Map(), new Map(), 'default', 100, 10);
    expect(result[0]!.startTime).toBe(20); // highest
    expect(result[1]!.startTime).toBe(40); // medium
    expect(result[2]!.startTime).toBe(0);  // lowest
  });

  it('respects topN limit', () => {
    const candidates = Array.from({ length: 20 }, (_, i) =>
      makeCandidate(i * 10, i * 10 + 8, 0.5 + i * 0.02, 0.5 + i * 0.02),
    );
    const result = rankCandidates(candidates, new Map(), new Map(), 'default', 200, 5);
    expect(result).toHaveLength(5);
  });

  it('incorporates QA signal into ranking', () => {
    const candidates = [
      makeCandidate(0, 10, 0.5, 0.5),  // low LLM but has QA signal
      makeCandidate(20, 30, 0.6, 0.6), // higher LLM but no QA signal
    ];
    const qaMap = new Map([['5', 1.0]]); // strong QA signal at t=5

    const result = rankCandidates(candidates, qaMap, new Map(), 'default', 100, 10);
    // The candidate at 0-10 should rank higher because of QA boost (0.35 * 1.0)
    expect(result[0]!.startTime).toBe(0);
  });

  it('includes score breakdown in results', () => {
    const candidates = [makeCandidate(10, 20, 0.8, 0.8)];
    const result = rankCandidates(candidates, new Map(), new Map(), 'default', 100, 10);
    expect(result[0]).toHaveProperty('llmScore');
    expect(result[0]).toHaveProperty('qaSignal');
    expect(result[0]).toHaveProperty('structuralScore');
    expect(result[0]).toHaveProperty('finalScore');
    expect(result[0]!.finalScore).toBeGreaterThanOrEqual(0);
    expect(result[0]!.finalScore).toBeLessThanOrEqual(1);
  });

  it('uses structural score from segment texts', () => {
    const candidates = [
      makeCandidate(10, 20, 0.5, 0.5), // has structural text
      makeCandidate(50, 60, 0.5, 0.5), // no structural text
    ];
    const segmentTexts = new Map<number, string>([
      [10, "The key point is the most important thing. Here's how you need to do step one."],
    ]);
    const result = rankCandidates(candidates, new Map(), segmentTexts, 'default', 100, 10);
    // The candidate with matching structural text should score higher
    expect(result[0]!.startTime).toBe(10);
    expect(result[0]!.structuralScore).toBeGreaterThan(result[1]!.structuralScore);
  });
});
