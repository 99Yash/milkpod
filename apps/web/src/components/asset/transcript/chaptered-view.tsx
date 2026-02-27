import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { TranscriptSegment } from '@milkpod/api/types';
import { cn } from '~/lib/utils';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import type { Chapter } from './types';
import { formatTime } from './types';
import { GroupRow } from './group-row';
import { ChapterProgressBar } from './chapter-progress-bar';

const ACCORDION_EXPAND_DELAY_MS = 150;

interface ChapteredViewProps {
  chapters: Chapter[];
  activeSegmentId?: string;
  searchQuery?: string;
  serverMatchedGroupIds?: Set<string> | null;
  matchOffsets: Map<string, number>;
  activeMatchGlobalIndex?: number;
  activeMatchGroupId?: string;
  onSegmentClick?: (segment: TranscriptSegment) => void;
  scrollToSegment: (segmentId: string) => void;
}

function getMatchCount(chapter: Chapter, query: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  let count = 0;
  for (const g of chapter.groups) {
    const text = g.text.toLowerCase();
    let pos = 0;
    while ((pos = text.indexOf(q, pos)) !== -1) {
      count++;
      pos += q.length;
    }
  }
  return count;
}

function findChapterId(
  chapters: Chapter[],
  groupId?: string,
): string | undefined {
  if (!groupId) return undefined;
  for (const chapter of chapters) {
    for (const group of chapter.groups) {
      if (group.segments[0].id === groupId) {
        return chapter.id;
      }
    }
  }
  return undefined;
}

function findActiveChapterId(
  chapters: Chapter[],
  activeSegmentId?: string,
): string | undefined {
  if (!activeSegmentId) return undefined;
  for (const chapter of chapters) {
    for (const group of chapter.groups) {
      if (group.segments.some((s) => s.id === activeSegmentId)) {
        return chapter.id;
      }
    }
  }
  return undefined;
}

function getServerMatchCount(chapter: Chapter, ids: Set<string>): number {
  return chapter.groups.filter((g) => ids.has(g.segments[0].id)).length;
}

export function ChapteredView({
  chapters,
  activeSegmentId,
  searchQuery,
  serverMatchedGroupIds,
  matchOffsets,
  activeMatchGlobalIndex,
  activeMatchGroupId,
  onSegmentClick,
  scrollToSegment,
}: ChapteredViewProps) {
  const [expandedChapters, setExpandedChapters] = useState<string[]>(
    [chapters[0]?.id].filter(Boolean),
  );
  const preSearchExpandedRef = useRef<string[]>([]);
  const wasSearchingRef = useRef(false);

  const activeChapterId = useMemo(
    () => findActiveChapterId(chapters, activeSegmentId),
    [chapters, activeSegmentId],
  );

  // Search: auto-expand matching chapters, restore on clear
  useEffect(() => {
    if (searchQuery) {
      if (!wasSearchingRef.current) {
        preSearchExpandedRef.current = expandedChapters;
        wasSearchingRef.current = true;
      }
      const matching = chapters
        .filter((ch) =>
          serverMatchedGroupIds
            ? getServerMatchCount(ch, serverMatchedGroupIds) > 0
            : getMatchCount(ch, searchQuery) > 0
        )
        .map((ch) => ch.id);
      setExpandedChapters(matching);
    } else if (wasSearchingRef.current) {
      wasSearchingRef.current = false;
      setExpandedChapters(preSearchExpandedRef.current);
    }
    // Intentionally excludes `expandedChapters` — we only read it to snapshot
    // pre-search state; including it would cause an infinite loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, chapters, serverMatchedGroupIds]);

  // Active segment tracking: auto-expand its chapter
  useEffect(() => {
    if (!activeChapterId) return;
    setExpandedChapters((prev) =>
      prev.includes(activeChapterId) ? prev : [...prev, activeChapterId],
    );
    const timer = setTimeout(() => {
      if (activeSegmentId) scrollToSegment(activeSegmentId);
    }, ACCORDION_EXPAND_DELAY_MS);
    return () => clearTimeout(timer);
  }, [activeChapterId, activeSegmentId, scrollToSegment]);

  // Active match navigation: expand the chapter containing the active match
  const activeMatchChapterId = useMemo(
    () => findChapterId(chapters, activeMatchGroupId),
    [chapters, activeMatchGroupId],
  );

  useEffect(() => {
    if (!activeMatchChapterId) return;
    setExpandedChapters((prev) =>
      prev.includes(activeMatchChapterId)
        ? prev
        : [...prev, activeMatchChapterId],
    );
  }, [activeMatchChapterId]);

  const handleChapterClick = useCallback((chapterId: string) => {
    setExpandedChapters((prev) =>
      prev.includes(chapterId) ? prev : [...prev, chapterId],
    );
    // Uses document.querySelector because the scroll container ref lives in
    // the parent (TranscriptViewer); acceptable for scroll-into-view only.
    setTimeout(() => {
      const el = document.querySelector(
        `[data-chapter-id="${chapterId}"]`,
      );
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, ACCORDION_EXPAND_DELAY_MS);
  }, []);

  return (
    <div>
      <ChapterProgressBar
        chapters={chapters}
        activeChapterId={activeChapterId}
        onChapterClick={handleChapterClick}
      />

      <div className="px-5 py-2">
        <Accordion
          type="multiple"
          value={expandedChapters}
          onValueChange={setExpandedChapters}
        >
          {chapters.map((chapter) => {
            const matchCount = searchQuery
              ? serverMatchedGroupIds
                ? getServerMatchCount(chapter, serverMatchedGroupIds)
                : getMatchCount(chapter, searchQuery)
              : 0;
            const isActiveChapter = chapter.id === activeChapterId;
            const dimmed = searchQuery && matchCount === 0;

            return (
              <AccordionItem
                key={chapter.id}
                value={chapter.id}
                data-chapter-id={chapter.id}
                className={cn(
                  'group/chapter border-b border-border/50 transition-opacity',
                  dimmed && 'opacity-40',
                )}
              >
                <AccordionTrigger className="min-w-0 gap-2 py-3 hover:no-underline">
                  <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                    <span
                      className={cn(
                        'shrink-0 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground',
                        isActiveChapter && 'bg-foreground/10 text-foreground',
                      )}
                    >
                      {formatTime(chapter.startTime)} –{' '}
                      {formatTime(chapter.endTime)}
                    </span>
                    {searchQuery && matchCount > 0 && (
                      <span className="shrink-0 rounded-full bg-yellow-200/60 px-1.5 py-0.5 text-[11px] font-medium tabular-nums dark:bg-yellow-500/30">
                        {matchCount}
                      </span>
                    )}
                    <span className="truncate text-xs text-muted-foreground group-data-[state=open]/chapter:hidden">
                      {chapter.preview}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-2">
                  {chapter.groups.map((group) => {
                    const isActive =
                      !!activeSegmentId &&
                      group.segments.some(
                        (s) => s.id === activeSegmentId,
                      );
                    return (
                      <GroupRow
                        key={group.segments[0].id}
                        group={group}
                        isActive={isActive}
                        searchQuery={searchQuery}
                        isServerMatch={serverMatchedGroupIds?.has(group.segments[0].id) ?? false}
                        matchGlobalOffset={matchOffsets.get(
                          group.segments[0].id,
                        )}
                        activeMatchGlobalIndex={activeMatchGlobalIndex}
                        onSegmentClick={onSegmentClick}
                        scrollToSegment={scrollToSegment}
                      />
                    );
                  })}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>
    </div>
  );
}
