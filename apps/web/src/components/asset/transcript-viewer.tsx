'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import type { TranscriptSegment } from '@milkpod/api/types';
import { coalesceSegments } from './transcript/types';
import type { ViewMode } from './transcript/types';
import { analyzeContent, detectChapters } from './transcript/chapter-detection';
import { TranscriptToolbar } from './transcript/transcript-toolbar';
import { FlatView } from './transcript/flat-view';
import { ChapteredView } from './transcript/chaptered-view';
import {
  searchTranscript,
  type TranscriptSearchResult,
} from '~/lib/api-fetchers';
import { buildHighlightRegex } from '~/lib/number-words';

const SEARCH_DEBOUNCE_MS = 300;
const SCROLL_TO_MATCH_DELAY_MS = 160; // Wait for accordion expansion in chaptered view
const SERVER_SEARCH_MIN_LENGTH = 3;

interface TranscriptViewerProps {
  assetId?: string;
  segments: TranscriptSegment[];
  activeSegmentId?: string;
  onSegmentClick?: (segment: TranscriptSegment) => void;
}

export function TranscriptViewer({
  assetId,
  segments,
  activeSegmentId,
  onSegmentClick,
}: TranscriptViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [serverResults, setServerResults] = useState<
    TranscriptSearchResult[] | null
  >(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    if (!assetId || debouncedSearch.length < SERVER_SEARCH_MIN_LENGTH) {
      setServerResults(null);
      return;
    }

    let cancelled = false;
    setIsSearching(true);

    searchTranscript(assetId, debouncedSearch).then((results) => {
      if (cancelled) return;
      setServerResults(results);
      setIsSearching(false);
    }).catch(() => {
      if (cancelled) return;
      setServerResults(null);
      setIsSearching(false);
    });

    return () => {
      cancelled = true;
    };
  }, [assetId, debouncedSearch]);

  const groups = useMemo(() => coalesceSegments(segments), [segments]);
  const profile = useMemo(() => analyzeContent(groups), [groups]);
  const chapters = useMemo(() => detectChapters(groups), [groups]);

  const [viewMode, setViewMode] = useState<ViewMode>(profile.defaultMode);

  useEffect(() => {
    setViewMode(profile.defaultMode);
  }, [profile.defaultMode]);

  const showViewToggle = groups.length > 5;

  const segmentToGroupId = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of groups) {
      const groupId = group.segments[0].id;
      for (const seg of group.segments) {
        map.set(seg.id, groupId);
      }
    }
    return map;
  }, [groups]);

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
      for (const group of groups) {
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
    for (const group of groups) {
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
  }, [groups, debouncedSearch, serverMatchedGroupIds]);

  // Reset active match index when search changes
  useEffect(() => {
    setActiveMatchIndex(0);
  }, [debouncedSearch]);

  const activeMatchGroupId = matches[activeMatchIndex] ?? null;

  const scrollToSegment = useCallback((segmentId: string) => {
    const el = containerRef.current?.querySelector(
      `[data-segment-id="${segmentId}"]`,
    );
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  useEffect(() => {
    if (activeSegmentId && viewMode !== 'flat') {
      scrollToSegment(activeSegmentId);
    }
  }, [activeSegmentId, scrollToSegment, viewMode]);

  // Scroll to active match when it changes (chaptered view only; FlatView handles its own)
  useEffect(() => {
    if (matches.length === 0 || viewMode === 'flat') return;

    const timer = setTimeout(() => {
      const el = containerRef.current?.querySelector(
        '[data-active-match]',
      );
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, SCROLL_TO_MATCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [activeMatchIndex, matches.length, viewMode]);

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
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        showViewToggle={showViewToggle}
        isSearching={isSearching}
      />

      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide">
        {viewMode === 'chapters' ? (
          <ChapteredView
            chapters={chapters}
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
          />
        ) : (
          <FlatView
            groups={groups}
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
            scrollContainerRef={containerRef}
          />
        )}
      </div>
    </div>
  );
}
