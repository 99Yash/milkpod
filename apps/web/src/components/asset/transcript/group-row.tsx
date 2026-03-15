import { useMemo } from 'react';
import type { TranscriptSegment } from '@milkpod/api/types';
import { UserRound } from 'lucide-react';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import { Badge } from '~/components/ui/badge';
import { cn } from '~/lib/utils';
import { buildHighlightRegex } from '~/lib/number-words';
import type { CoalescedGroup } from './types';
import { formatTime } from './types';
import type { SpeakerNamesMap } from './speaker-names';
import { resolveSpeakerLabel } from './speaker-names';

interface GroupRowProps {
  group: CoalescedGroup;
  isActive: boolean;
  searchQuery?: string;
  isServerMatch?: boolean;
  matchGlobalOffset?: number;
  activeMatchGlobalIndex?: number;
  onSegmentClick?: (segment: TranscriptSegment) => void;
  scrollToSegment: (segmentId: string) => void;
  speakerNames: SpeakerNamesMap;
}

function getSpeakerInitials(label: string | null): string {
  if (!label) return '?';

  const parts = label
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
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
  speakerNames,
}: GroupRowProps) {
  const firstSegment = group.segments[0];
  const speakerLabel = resolveSpeakerLabel(group.speaker, speakerNames);

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
        'w-full rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border/55 hover:bg-muted/30',
        isActive && 'border-border/80 bg-muted/50',
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <Avatar className="mt-0.5 size-6 border border-border/60">
          <AvatarFallback className="text-[10px] font-semibold">
            {getSpeakerInitials(speakerLabel)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex min-w-0 items-center gap-2">
            <p className="truncate text-xs font-medium text-foreground/85">
              {speakerLabel ?? (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <UserRound className="size-3" />
                  Unknown speaker
                </span>
              )}
            </p>
            <Badge
              variant="outline"
              className="h-5 rounded-md px-1.5 font-mono text-[10px] tabular-nums"
            >
              {formatTime(group.startTime)}
            </Badge>
          </div>

          <p className="min-w-0 break-words text-sm leading-6 text-foreground">
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
        </div>
      </div>
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
                  ? 'bg-blue-300/80 dark:bg-blue-500/50'
                  : 'bg-sky-200/60 dark:bg-sky-500/30',
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
