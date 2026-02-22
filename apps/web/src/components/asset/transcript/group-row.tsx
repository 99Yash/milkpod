import type { TranscriptSegment } from '@milkpod/api/types';
import { cn } from '~/lib/utils';
import type { CoalescedGroup } from './types';
import { formatTime } from './types';

interface GroupRowProps {
  group: CoalescedGroup;
  isActive: boolean;
  searchQuery?: string;
  matchGlobalOffset?: number;
  activeMatchGlobalIndex?: number;
  onSegmentClick?: (segment: TranscriptSegment) => void;
  scrollToSegment: (segmentId: string) => void;
}

export function GroupRow({
  group,
  isActive,
  searchQuery,
  matchGlobalOffset,
  activeMatchGlobalIndex,
  onSegmentClick,
  scrollToSegment,
}: GroupRowProps) {
  const firstSegment = group.segments[0];

  return (
    <button
      type="button"
      data-segment-id={firstSegment.id}
      onClick={() => {
        onSegmentClick?.(firstSegment);
        scrollToSegment(firstSegment.id);
      }}
      className={cn(
        'flex w-full min-w-0 gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/50',
        isActive && 'bg-muted/60 ring-1 ring-border/60',
      )}
    >
      <span className="flex w-20 shrink-0 flex-col gap-0.5 pt-0.5">
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatTime(group.startTime)}
        </span>
        {group.speaker && (
          <span className="truncate text-[11px] font-medium text-muted-foreground/80">
            {group.speaker}
          </span>
        )}
      </span>
      <p className="min-w-0 flex-1 break-words text-[13px] leading-relaxed text-foreground">
        {searchQuery ? (
          <HighlightedText
            text={group.text}
            query={searchQuery}
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
  query,
  globalOffset,
  activeGlobalIndex,
}: {
  text: string;
  query: string;
  globalOffset: number;
  activeGlobalIndex?: number;
}) {
  if (!query) return <>{text}</>;

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
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
