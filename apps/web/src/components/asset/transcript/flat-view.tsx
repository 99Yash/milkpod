import { useMemo } from 'react';
import type { TranscriptSegment } from '@milkpod/api/types';
import type { CoalescedGroup } from './types';
import { GroupRow } from './group-row';

interface FlatViewProps {
  groups: CoalescedGroup[];
  activeSegmentId?: string;
  searchQuery?: string;
  matchOffsets: Map<string, number>;
  activeMatchGlobalIndex?: number;
  onSegmentClick?: (segment: TranscriptSegment) => void;
  scrollToSegment: (segmentId: string) => void;
}

export function FlatView({
  groups,
  activeSegmentId,
  searchQuery,
  matchOffsets,
  activeMatchGlobalIndex,
  onSegmentClick,
  scrollToSegment,
}: FlatViewProps) {
  const filteredGroups = useMemo(() => {
    if (!searchQuery) return groups;
    const q = searchQuery.toLowerCase();
    return groups.filter((g) => g.text.toLowerCase().includes(q));
  }, [groups, searchQuery]);

  const activeGroupIndex = useMemo(() => {
    if (!activeSegmentId) return -1;
    return filteredGroups.findIndex((g) =>
      g.segments.some((s) => s.id === activeSegmentId),
    );
  }, [filteredGroups, activeSegmentId]);

  if (filteredGroups.length === 0 && searchQuery) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No results found.
      </div>
    );
  }

  return (
    <div>
      {filteredGroups.map((group, i) => (
        <GroupRow
          key={group.segments[0].id}
          group={group}
          isActive={i === activeGroupIndex}
          searchQuery={searchQuery}
          matchGlobalOffset={matchOffsets.get(group.segments[0].id)}
          activeMatchGlobalIndex={activeMatchGlobalIndex}
          onSegmentClick={onSegmentClick}
          scrollToSegment={scrollToSegment}
        />
      ))}
    </div>
  );
}
