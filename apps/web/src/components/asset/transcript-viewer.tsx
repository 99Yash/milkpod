'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { ScrollArea } from '~/components/ui/scroll-area';
import { Input } from '~/components/ui/input';
import { cn } from '~/lib/utils';
import type { TranscriptSegment } from '@milkpod/api/types';

interface TranscriptViewerProps {
  segments: TranscriptSegment[];
  activeSegmentId?: string;
  onSegmentClick?: (segment: TranscriptSegment) => void;
}

interface CoalescedGroup {
  segments: TranscriptSegment[];
  speaker: string | null;
  startTime: number;
  endTime: number;
  text: string;
}

const GAP_THRESHOLD = 3; // seconds

function coalesceSegments(segments: TranscriptSegment[]): CoalescedGroup[] {
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

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TranscriptViewer({
  segments,
  activeSegmentId,
  onSegmentClick,
}: TranscriptViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const groups = useMemo(() => coalesceSegments(segments), [segments]);

  const filteredGroups = useMemo(() => {
    if (!debouncedSearch) return groups;
    const q = debouncedSearch.toLowerCase();
    return groups.filter(
      (g) =>
        g.text.toLowerCase().includes(q) ||
        (g.speaker && g.speaker.toLowerCase().includes(q))
    );
  }, [groups, debouncedSearch]);

  const activeGroupIndex = useMemo(() => {
    if (!activeSegmentId) return -1;
    return filteredGroups.findIndex((g) =>
      g.segments.some((s) => s.id === activeSegmentId)
    );
  }, [filteredGroups, activeSegmentId]);

  const scrollToSegment = useCallback((segmentId: string) => {
    const el = containerRef.current?.querySelector(
      `[data-segment-id="${segmentId}"]`
    );
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  useEffect(() => {
    if (activeSegmentId) {
      scrollToSegment(activeSegmentId);
    }
  }, [activeSegmentId, scrollToSegment]);

  if (segments.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No transcript segments available.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transcript..."
            className="h-8 pl-8 pr-8 text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        {debouncedSearch && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {filteredGroups.length} result{filteredGroups.length !== 1 && 's'}{' '}
            found
          </p>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div ref={containerRef} className="space-y-1 px-3 py-2">
          {filteredGroups.length === 0 && debouncedSearch ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              No results found.
            </div>
          ) : (
            filteredGroups.map((group, i) => {
              const isActive = i === activeGroupIndex;
              const firstSegment = group.segments[0];
              return (
                <button
                  key={firstSegment.id}
                  type="button"
                  data-segment-id={firstSegment.id}
                  onClick={() => {
                    onSegmentClick?.(firstSegment);
                    scrollToSegment(firstSegment.id);
                  }}
                  className={cn(
                    'flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted/50',
                    isActive && 'bg-muted'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {formatTime(group.startTime)} –{' '}
                      {formatTime(group.endTime)}
                    </span>
                    {group.speaker && (
                      <span className="text-xs font-medium text-muted-foreground">
                        {group.speaker}
                      </span>
                    )}
                  </span>
                  <p className="text-sm leading-relaxed text-foreground">
                    {group.text}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
