import { useMemo, useEffect } from 'react';
import type { TranscriptSegment } from '@milkpod/api/types';
import type { CoalescedGroup } from './types';
import { GroupRow } from './group-row';
import type { SpeakerNamesMap } from './speaker-names';

interface FlatViewProps {
  groups: CoalescedGroup[];
  activeSegmentId?: string;
  searchQuery?: string;
  serverMatchedGroupIds?: Set<string> | null;
  matchOffsets: Map<string, number>;
  activeMatchGlobalIndex?: number;
  activeMatchGroupId?: string;
  onSegmentClick?: (segment: TranscriptSegment) => void;
  scrollToSegment: (segmentId: string) => void;
  speakerNames: SpeakerNamesMap;
}

export function FlatView({
  groups,
  activeSegmentId,
  searchQuery,
  serverMatchedGroupIds,
  matchOffsets,
  activeMatchGlobalIndex,
  activeMatchGroupId,
  onSegmentClick,
  scrollToSegment,
  speakerNames,
}: FlatViewProps) {
  const filteredGroups = useMemo(() => {
    if (!searchQuery) return groups;
    // Server search: filter to server-matched groups
    if (serverMatchedGroupIds) {
      return groups.filter((g) => serverMatchedGroupIds.has(g.segments[0].id));
    }
    // Client-side: literal substring match
    const q = searchQuery.toLowerCase();
    return groups.filter((g) => g.text.toLowerCase().includes(q));
  }, [groups, searchQuery, serverMatchedGroupIds]);

  const activeGroupIndex = useMemo(() => {
    if (!activeSegmentId) return -1;
    return filteredGroups.findIndex((g) =>
      g.segments.some((s) => s.id === activeSegmentId),
    );
  }, [filteredGroups, activeSegmentId]);

  useEffect(() => {
    if (activeGroupIndex >= 0) {
      const id = filteredGroups[activeGroupIndex]?.segments[0]?.id;
      if (id) scrollToSegment(id);
    }
  }, [activeSegmentId, activeGroupIndex, filteredGroups, scrollToSegment]);

  const activeMatchRowIndex = useMemo(() => {
    if (!activeMatchGroupId) return -1;
    return filteredGroups.findIndex(
      (g) => g.segments[0].id === activeMatchGroupId,
    );
  }, [filteredGroups, activeMatchGroupId]);

  useEffect(() => {
    if (activeMatchRowIndex >= 0) {
      const id = filteredGroups[activeMatchRowIndex]?.segments[0]?.id;
      if (id) scrollToSegment(id);
    }
  }, [activeMatchGroupId, activeMatchRowIndex, filteredGroups, scrollToSegment]);

  if (filteredGroups.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        {searchQuery
          ? 'No results found.'
          : 'No transcript lines for the selected speakers.'}
      </div>
    );
  }

  return (
    <div className="space-y-1.5 px-5 py-2">
      {filteredGroups.map((group, index) => (
        <GroupRow
          key={group.segments[0].id}
          group={group}
          isActive={index === activeGroupIndex}
          searchQuery={searchQuery}
          isServerMatch={serverMatchedGroupIds?.has(group.segments[0].id) ?? false}
          matchGlobalOffset={matchOffsets.get(group.segments[0].id)}
          activeMatchGlobalIndex={activeMatchGlobalIndex}
          onSegmentClick={onSegmentClick}
          scrollToSegment={scrollToSegment}
          speakerNames={speakerNames}
        />
      ))}
    </div>
  );
}
