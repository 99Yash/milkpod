import type { TranscriptSegment } from '@milkpod/api/types';

// ---------------------------------------------------------------------------
// Coalesced group — merges consecutive same-speaker segments with <3s gaps
// ---------------------------------------------------------------------------

export interface CoalescedGroup {
  segments: TranscriptSegment[];
  speaker: string | null;
  startTime: number;
  endTime: number;
  text: string;
}

const GAP_THRESHOLD = 3; // seconds

export function coalesceSegments(
  segments: TranscriptSegment[],
): CoalescedGroup[] {
  if (segments.length === 0) return [];

  const groups: CoalescedGroup[] = [];
  let current: CoalescedGroup = {
    segments: [segments[0]],
    speaker: segments[0].speaker,
    startTime: segments[0].startTime,
    endTime: segments[0].endTime,
    text: segments[0].text,
  };

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const sameSpeaker =
      seg.speaker === current.speaker ||
      (seg.speaker == null && current.speaker == null);
    const smallGap = seg.startTime - current.endTime < GAP_THRESHOLD;

    if (sameSpeaker && smallGap) {
      current.segments.push(seg);
      current.endTime = seg.endTime;
      current.text += ' ' + seg.text;
    } else {
      groups.push(current);
      current = {
        segments: [seg],
        speaker: seg.speaker,
        startTime: seg.startTime,
        endTime: seg.endTime,
        text: seg.text,
      };
    }
  }
  groups.push(current);
  return groups;
}

// ---------------------------------------------------------------------------
// Chapter
// ---------------------------------------------------------------------------

export interface Chapter {
  id: string;
  groups: CoalescedGroup[];
  startTime: number;
  endTime: number;
  preview: string;
}

// ---------------------------------------------------------------------------
// View mode + content profile
// ---------------------------------------------------------------------------

export type ViewMode = 'flat' | 'chapters';

export interface ContentProfile {
  totalDuration: number;
  totalSegments: number;
  isLongForm: boolean;
  defaultMode: ViewMode;
}

// ---------------------------------------------------------------------------
// Shared utility (re-exported from ~/lib/format for co-location convenience)
// ---------------------------------------------------------------------------

export { formatTime } from '~/lib/format';
