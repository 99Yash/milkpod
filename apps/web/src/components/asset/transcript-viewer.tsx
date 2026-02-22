'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import type { TranscriptSegment } from '@milkpod/api/types';
import { coalesceSegments } from './transcript/types';
import type { ViewMode } from './transcript/types';
import { analyzeContent, detectChapters } from './transcript/chapter-detection';
import { TranscriptToolbar } from './transcript/transcript-toolbar';
import { FlatView } from './transcript/flat-view';
import { ChapteredView } from './transcript/chaptered-view';

const SEARCH_DEBOUNCE_MS = 300;
const SCROLL_TO_MATCH_DELAY_MS = 160; // Wait for accordion expansion in chaptered view

interface TranscriptViewerProps {
  segments: TranscriptSegment[];
  activeSegmentId?: string;
  onSegmentClick?: (segment: TranscriptSegment) => void;
}

export function TranscriptViewer({
  segments,
  activeSegmentId,
  onSegmentClick,
}: TranscriptViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  const groups = useMemo(() => coalesceSegments(segments), [segments]);
  const profile = useMemo(() => analyzeContent(groups), [groups]);
  const chapters = useMemo(() => detectChapters(groups), [groups]);

  const [viewMode, setViewMode] = useState<ViewMode>(profile.defaultMode);

  useEffect(() => {
    setViewMode(profile.defaultMode);
  }, [profile.defaultMode]);

  const showViewToggle = groups.length > 5;

  // Compute all match positions (as group IDs) and per-group offsets
  const { matches, matchOffsets } = useMemo(() => {
    const matchList: string[] = [];
    const offsets = new Map<string, number>();

    if (!debouncedSearch) return { matches: matchList, matchOffsets: offsets };

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
  }, [groups, debouncedSearch]);

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
    if (activeSegmentId) {
      scrollToSegment(activeSegmentId);
    }
  }, [activeSegmentId, scrollToSegment]);

  // Scroll to active match when it changes
  useEffect(() => {
    if (matches.length === 0) return;

    const timer = setTimeout(() => {
      const el = containerRef.current?.querySelector(
        '[data-active-match]',
      );
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, SCROLL_TO_MATCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [activeMatchIndex, matches.length]);

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
      />

      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide">
        {viewMode === 'chapters' ? (
          <ChapteredView
            chapters={chapters}
            activeSegmentId={activeSegmentId}
            searchQuery={debouncedSearch || undefined}
            matchOffsets={matchOffsets}
            activeMatchGlobalIndex={
              matches.length > 0 ? activeMatchIndex : undefined
            }
            activeMatchGroupId={activeMatchGroupId ?? undefined}
            onSegmentClick={onSegmentClick}
            scrollToSegment={scrollToSegment}
          />
        ) : (
          <div className="px-3 py-1">
            <FlatView
              groups={groups}
              activeSegmentId={activeSegmentId}
              searchQuery={debouncedSearch || undefined}
              matchOffsets={matchOffsets}
              activeMatchGlobalIndex={
                matches.length > 0 ? activeMatchIndex : undefined
              }
              onSegmentClick={onSegmentClick}
              scrollToSegment={scrollToSegment}
            />
          </div>
        )}
      </div>
    </div>
  );
}
