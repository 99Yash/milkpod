'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { TranscriptSegment } from '@milkpod/api/types';
import { coalesceSegments } from './transcript/types';
import { TranscriptToolbar } from './transcript/transcript-toolbar';
import { FlatView } from './transcript/flat-view';
import { searchTranscript } from '~/lib/api-fetchers';
import { queryKeys } from '~/lib/query-keys';
import { buildHighlightRegex } from '~/lib/number-words';
import {
  extractSpeakerNames,
  resolveSpeakerLabel,
  sortSpeakerIds,
  type SpeakerNamesMap,
} from './transcript/speaker-names';

const SEARCH_DEBOUNCE_MS = 300;
const SERVER_SEARCH_MIN_LENGTH = 3;

interface TranscriptViewerProps {
  assetId?: string;
  segments: TranscriptSegment[];
  activeSegmentId?: string;
  onSegmentClick?: (segment: TranscriptSegment) => void;
  transcriptMetadata?: unknown;
  onSaveSpeakerNames?: (speakerNames: SpeakerNamesMap) => Promise<void>;
  isSavingSpeakerNames?: boolean;
}

export function TranscriptViewer({
  assetId,
  segments,
  activeSegmentId,
  onSegmentClick,
  transcriptMetadata,
  onSaveSpeakerNames,
  isSavingSpeakerNames,
}: TranscriptViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  const searchEnabled = Boolean(assetId) && debouncedSearch.length >= SERVER_SEARCH_MIN_LENGTH;

  const { data: serverResults = null, isLoading: isSearching } = useQuery({
    queryKey: queryKeys.transcriptSearch(assetId!, debouncedSearch),
    queryFn: () => searchTranscript(assetId!, debouncedSearch),
    enabled: searchEnabled,
  });

  const groups = useMemo(() => coalesceSegments(segments), [segments]);
  const speakerNames = useMemo(
    () => extractSpeakerNames(transcriptMetadata),
    [transcriptMetadata],
  );
  const speakerIds = useMemo(() => {
    const uniqueSpeakerIds = new Set(
      segments
        .map((segment) => segment.speaker)
        .filter((speaker): speaker is string => speaker != null),
    );

    return sortSpeakerIds(Array.from(uniqueSpeakerIds));
  }, [segments]);
  const speakerStats = useMemo(() => {
    const speakerCounts = new Map<string, number>();

    for (const group of groups) {
      if (!group.speaker) continue;
      speakerCounts.set(
        group.speaker,
        (speakerCounts.get(group.speaker) ?? 0) + 1,
      );
    }

    return sortSpeakerIds(Array.from(speakerCounts.keys()))
      .map((speakerId) => ({
        id: speakerId,
        label: resolveSpeakerLabel(speakerId, speakerNames) ?? speakerId,
        count: speakerCounts.get(speakerId) ?? 0,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [groups, speakerNames]);

  const hasEffectiveSpeakerFilter = useMemo(() => {
    return selectedSpeakerId != null && speakerIds.includes(selectedSpeakerId);
  }, [selectedSpeakerId, speakerIds]);

  const speakerFilteredGroups = useMemo(() => {
    if (!hasEffectiveSpeakerFilter) return groups;
    return groups.filter((group) => group.speaker === selectedSpeakerId);
  }, [groups, hasEffectiveSpeakerFilter, selectedSpeakerId]);

  useEffect(() => {
    if (!selectedSpeakerId) return;
    if (speakerIds.includes(selectedSpeakerId)) return;
    setSelectedSpeakerId(null);
  }, [selectedSpeakerId, speakerIds]);

  const segmentToGroupId = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of speakerFilteredGroups) {
      const groupId = group.segments[0].id;
      for (const seg of group.segments) {
        map.set(seg.id, groupId);
      }
    }
    return map;
  }, [speakerFilteredGroups]);

  const serverMatchedGroupIds = useMemo(() => {
    if (!serverResults) return null;
    const set = new Set<string>();
    for (const r of serverResults) {
      const gid = segmentToGroupId.get(r.segmentId);
      if (gid) set.add(gid);
    }
    return set;
  }, [serverResults, segmentToGroupId]);

  // Compute all match positions (as group IDs) and per-group offsets
  const { matches, matchOffsets } = useMemo(() => {
    const matchList: string[] = [];
    const offsets = new Map<string, number>();

    if (!debouncedSearch) return { matches: matchList, matchOffsets: offsets };

    if (serverMatchedGroupIds) {
      const regex = buildHighlightRegex(debouncedSearch);
      for (const group of speakerFilteredGroups) {
        const id = group.segments[0].id;
        if (!serverMatchedGroupIds.has(id)) continue;
        offsets.set(id, matchList.length);
        if (regex) {
          regex.lastIndex = 0;
          let count = 0;
          while (regex.exec(group.text)) count++;
          for (let i = 0; i < Math.max(count, 1); i++) matchList.push(id);
        } else {
          matchList.push(id);
        }
      }
      return { matches: matchList, matchOffsets: offsets };
    }

    const q = debouncedSearch.toLowerCase();
    for (const group of speakerFilteredGroups) {
      const id = group.segments[0].id;
      offsets.set(id, matchList.length);

      const text = group.text.toLowerCase();
      let pos = 0;
      while ((pos = text.indexOf(q, pos)) !== -1) {
        matchList.push(id);
        pos += q.length;
      }
    }

    return { matches: matchList, matchOffsets: offsets };
  }, [speakerFilteredGroups, debouncedSearch, serverMatchedGroupIds]);

  // Reset active match index when search changes
  useEffect(() => {
    setActiveMatchIndex(0);
  }, [debouncedSearch, selectedSpeakerId]);

  const speakerFilters = useMemo(
    () =>
      speakerStats.map((speaker) => ({
        ...speaker,
        active: hasEffectiveSpeakerFilter && speaker.id === selectedSpeakerId,
      })),
    [speakerStats, hasEffectiveSpeakerFilter, selectedSpeakerId],
  );

  const toggleSpeakerFilter = useCallback((speakerId: string) => {
    setSelectedSpeakerId((prev) => (prev === speakerId ? null : speakerId));
  }, []);

  const clearSpeakerFilters = useCallback(() => {
    setSelectedSpeakerId(null);
  }, []);

  const activeMatchGroupId = matches[activeMatchIndex] ?? null;

  const scrollToSegment = useCallback((segmentId: string) => {
    const el = containerRef.current?.querySelector(
      `[data-segment-id="${segmentId}"]`,
    );
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const handleNextMatch = useCallback(() => {
    if (matches.length === 0) return;
    setActiveMatchIndex((prev) => (prev + 1) % matches.length);
  }, [matches.length]);

  const handlePrevMatch = useCallback(() => {
    if (matches.length === 0) return;
    setActiveMatchIndex(
      (prev) => (prev - 1 + matches.length) % matches.length,
    );
  }, [matches.length]);

  if (segments.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No transcript segments available.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TranscriptToolbar
        search={search}
        onSearchChange={setSearch}
        totalMatches={matches.length}
        activeMatchIndex={activeMatchIndex}
        onPrevMatch={handlePrevMatch}
        onNextMatch={handleNextMatch}
        isSearching={isSearching}
        speakerIds={speakerIds}
        speakerNames={speakerNames}
        onSaveSpeakerNames={onSaveSpeakerNames}
        isSavingSpeakerNames={isSavingSpeakerNames}
        speakerFilters={speakerFilters}
        isAllSpeakersActive={!hasEffectiveSpeakerFilter}
        onToggleSpeakerFilter={toggleSpeakerFilter}
        onSelectAllSpeakers={clearSpeakerFilters}
      />

      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide">
        <FlatView
          groups={speakerFilteredGroups}
          activeSegmentId={activeSegmentId}
          searchQuery={debouncedSearch || undefined}
          serverMatchedGroupIds={serverMatchedGroupIds}
          matchOffsets={matchOffsets}
          activeMatchGlobalIndex={
            matches.length > 0 ? activeMatchIndex : undefined
          }
          activeMatchGroupId={activeMatchGroupId ?? undefined}
          onSegmentClick={onSegmentClick}
          scrollToSegment={scrollToSegment}
          speakerNames={speakerNames}
        />
      </div>
    </div>
  );
}
