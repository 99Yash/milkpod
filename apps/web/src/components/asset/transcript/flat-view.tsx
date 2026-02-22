import { useMemo, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { TranscriptSegment } from '@milkpod/api/types';
import type { CoalescedGroup } from './types';
import { GroupRow } from './group-row';

interface FlatViewProps {
  groups: CoalescedGroup[];
  activeSegmentId?: string;
  searchQuery?: string;
  matchOffsets: Map<string, number>;
  activeMatchGlobalIndex?: number;
  activeMatchGroupId?: string;
  onSegmentClick?: (segment: TranscriptSegment) => void;
  scrollToSegment: (segmentId: string) => void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

export function FlatView({
  groups,
  activeSegmentId,
  searchQuery,
  matchOffsets,
  activeMatchGlobalIndex,
  activeMatchGroupId,
  onSegmentClick,
  scrollToSegment,
  scrollContainerRef,
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

  const virtualizer = useVirtualizer({
    count: filteredGroups.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 80,
    overscan: 5,
    paddingStart: 8,
    paddingEnd: 8,
  });

  // Scroll to active segment via virtualizer (parent DOM query won't reach off-screen items)
  useEffect(() => {
    if (activeGroupIndex >= 0) {
      virtualizer.scrollToIndex(activeGroupIndex, {
        align: 'center',
        behavior: 'smooth',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSegmentId]);

  // Scroll to active search match via virtualizer
  const activeMatchRowIndex = useMemo(() => {
    if (!activeMatchGroupId) return -1;
    return filteredGroups.findIndex(
      (g) => g.segments[0].id === activeMatchGroupId,
    );
  }, [filteredGroups, activeMatchGroupId]);

  useEffect(() => {
    if (activeMatchRowIndex >= 0) {
      virtualizer.scrollToIndex(activeMatchRowIndex, {
        align: 'center',
        behavior: 'smooth',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMatchGroupId]);

  if (filteredGroups.length === 0 && searchQuery) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No results found.
      </div>
    );
  }

  return (
    <div
      style={{
        height: `${virtualizer.getTotalSize()}px`,
        width: '100%',
        position: 'relative',
      }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const group = filteredGroups[virtualRow.index];
        return (
          <div
            key={group.segments[0].id}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            }}
            className="px-5"
          >
            <GroupRow
              group={group}
              isActive={virtualRow.index === activeGroupIndex}
              searchQuery={searchQuery}
              matchGlobalOffset={matchOffsets.get(group.segments[0].id)}
              activeMatchGlobalIndex={activeMatchGlobalIndex}
              onSegmentClick={onSegmentClick}
              scrollToSegment={scrollToSegment}
            />
          </div>
        );
      })}
    </div>
  );
}
