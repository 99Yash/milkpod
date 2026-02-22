import type { CoalescedGroup, Chapter, ContentProfile } from './types';

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const LONG_FORM_DURATION_SECS = 300; // 5 minutes
const LONG_FORM_SEGMENT_COUNT = 50;
const MIN_PAUSE_THRESHOLD_SECS = 8;
const PAUSE_MEDIAN_MULTIPLIER = 2.5;
const TARGET_CHAPTER_INTERVAL_SECS = 240; // ~4 minutes
const MIN_TARGET_CHAPTERS = 3;
const MAX_CHAPTERS = 15;
const PREVIEW_MAX_LENGTH = 120;

// ---------------------------------------------------------------------------
// Content analysis — determines if content is long-form
// ---------------------------------------------------------------------------

export function analyzeContent(groups: CoalescedGroup[]): ContentProfile {
  if (groups.length === 0) {
    return {
      totalDuration: 0,
      totalSegments: 0,
      isLongForm: false,
      defaultMode: 'flat',
    };
  }

  const totalDuration =
    groups[groups.length - 1].endTime - groups[0].startTime;
  const totalSegments = groups.reduce(
    (sum, g) => sum + g.segments.length,
    0,
  );
  const isLongForm =
    totalDuration > LONG_FORM_DURATION_SECS ||
    totalSegments > LONG_FORM_SEGMENT_COUNT;

  return {
    totalDuration,
    totalSegments,
    isLongForm,
    defaultMode: isLongForm ? 'chapters' : 'flat',
  };
}

// ---------------------------------------------------------------------------
// Chapter detection — operates on already-coalesced groups
// ---------------------------------------------------------------------------

export function detectChapters(groups: CoalescedGroup[]): Chapter[] {
  if (groups.length === 0) return [];
  if (groups.length === 1) return [buildChapter(0, groups)];

  // 1. Compute inter-group gaps
  const gaps: number[] = [];
  for (let i = 1; i < groups.length; i++) {
    gaps.push(groups[i].startTime - groups[i - 1].endTime);
  }

  // 2. Find significant pause threshold
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)];
  const pauseThreshold = Math.max(
    MIN_PAUSE_THRESHOLD_SECS,
    medianGap * PAUSE_MEDIAN_MULTIPLIER,
  );

  // 3. Collect candidate break indices
  //    A break at index i means: chapter boundary between groups[i-1] and groups[i]
  const breakIndices: { index: number; gap: number }[] = [];

  for (let i = 1; i < groups.length; i++) {
    const gap = gaps[i - 1];
    const speakerChange =
      groups[i].speaker !== groups[i - 1].speaker &&
      !(groups[i].speaker == null && groups[i - 1].speaker == null);

    if (speakerChange || gap >= pauseThreshold) {
      breakIndices.push({ index: i, gap });
    }
  }

  // 4. Time-based fallback — if too few breaks, inject at ~4min intervals
  const totalDuration =
    groups[groups.length - 1].endTime - groups[0].startTime;
  const targetChapters = Math.max(
    MIN_TARGET_CHAPTERS,
    Math.floor(totalDuration / TARGET_CHAPTER_INTERVAL_SECS),
  );

  if (breakIndices.length < targetChapters - 1 && groups.length > 3) {
    const interval = totalDuration / targetChapters;
    for (let t = 1; t < targetChapters; t++) {
      const targetTime = groups[0].startTime + interval * t;
      // Find the group boundary closest to targetTime
      let bestIdx = 1;
      let bestDist = Infinity;
      for (let i = 1; i < groups.length; i++) {
        const dist = Math.abs(groups[i].startTime - targetTime);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
      if (!breakIndices.some((b) => b.index === bestIdx)) {
        breakIndices.push({ index: bestIdx, gap: 0 });
      }
    }
  }

  // 5. Cap chapters — keep the ones with the largest gaps
  if (breakIndices.length > MAX_CHAPTERS - 1) {
    breakIndices.sort((a, b) => b.gap - a.gap);
    breakIndices.length = MAX_CHAPTERS - 1;
  }

  // Sort by index for chapter building
  breakIndices.sort((a, b) => a.index - b.index);

  // 6. Build chapters
  const chapters: Chapter[] = [];
  let start = 0;
  for (const { index } of breakIndices) {
    chapters.push(buildChapter(chapters.length, groups.slice(start, index)));
    start = index;
  }
  chapters.push(buildChapter(chapters.length, groups.slice(start)));

  return chapters;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildChapter(index: number, groups: CoalescedGroup[]): Chapter {
  const fullText = groups.map((g) => g.text).join(' ');
  return {
    id: `chapter-${index}`,
    groups,
    startTime: groups[0].startTime,
    endTime: groups[groups.length - 1].endTime,
    preview:
      fullText.length > PREVIEW_MAX_LENGTH
        ? fullText.slice(0, PREVIEW_MAX_LENGTH - 3) + '...'
        : fullText,
  };
}
