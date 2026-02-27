import { useMemo } from 'react';
import type { TranscriptSegment } from '@milkpod/api/types';
import { cn } from '~/lib/utils';
import { buildHighlightRegex } from '~/lib/number-words';
import type { CoalescedGroup } from './types';
import { formatTime } from './types';

interface GroupRowProps {
  group: CoalescedGroup;
  isActive: boolean;
  searchQuery?: string;
  isServerMatch?: boolean;
  matchGlobalOffset?: number;
  activeMatchGlobalIndex?: number;
  onSegmentClick?: (segment: TranscriptSegment) => void;
  scrollToSegment: (segmentId: string) => void;
}

export function GroupRow({
  group,
  isActive,
  searchQuery,
  isServerMatch,
  matchGlobalOffset,
  activeMatchGlobalIndex,
  onSegmentClick,
  scrollToSegment,
}: GroupRowProps) {
  const firstSegment = group.segments[0];

  const highlightRegex = useMemo(() => {
    if (!searchQuery) return null;
    if (isServerMatch) return buildHighlightRegex(searchQuery);
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(${escaped})`, 'gi');
  }, [isServerMatch, searchQuery]);

  const hasHighlight = highlightRegex !== null && highlightRegex.test(group.text);

  if (highlightRegex) highlightRegex.lastIndex = 0;

  return (
    <button
      type="button"
      data-segment-id={firstSegment.id}
      data-active-match={
        isServerMatch && matchGlobalOffset === activeMatchGlobalIndex
          ? true
          : undefined
      }
      onClick={() => {
        onSegmentClick?.(firstSegment);
        scrollToSegment(firstSegment.id);
      }}
      className={cn(
        'flex w-full min-w-0 gap-4 rounded-xl border border-transparent px-3 py-3 text-left transition-colors hover:border-border/40 hover:bg-muted/40',
        isActive && 'bg-muted/60 border-border/70 ring-1 ring-border/40',
      )}
    >
      <span className="flex w-24 shrink-0 flex-col gap-1 pt-0.5">
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {formatTime(group.startTime)}
        </span>
        {group.speaker && (
          <span className="truncate text-xs font-medium text-muted-foreground/80">
            {group.speaker}
          </span>
        )}
      </span>
      <p className="min-w-0 flex-1 break-words text-sm leading-6 text-foreground">
        {hasHighlight && highlightRegex ? (
          <HighlightedText
            text={group.text}
            regex={highlightRegex}
            globalOffset={matchGlobalOffset ?? 0}
            activeGlobalIndex={activeMatchGlobalIndex}
          />
        ) : (
          group.text
        )}
      </p>
    </button>
  );
}

function HighlightedText({
  text,
  regex,
  globalOffset,
  activeGlobalIndex,
}: {
  text: string;
  regex: RegExp;
  globalOffset: number;
  activeGlobalIndex?: number;
}) {
  const parts = text.split(regex);

  let occurrenceIndex = 0;

  return (
    <>
      {parts.map((part, i) => {
        // split with capture group: odd indices are matches
        if (i % 2 === 1) {
          const globalIdx = globalOffset + occurrenceIndex;
          const isActiveMatch = globalIdx === activeGlobalIndex;
          occurrenceIndex++;
          return (
            <mark
              key={i}
              data-match-id={globalIdx}
              data-active-match={isActiveMatch || undefined}
              className={cn(
                'rounded-sm px-0.5',
                isActiveMatch
                  ? 'bg-orange-300/80 dark:bg-orange-500/50'
                  : 'bg-yellow-200/60 dark:bg-yellow-500/30',
              )}
            >
              {part}
            </mark>
          );
        }
        return part;
      })}
    </>
  );
}
