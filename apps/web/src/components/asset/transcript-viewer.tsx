'use client';

import { useRef, useCallback } from 'react';
import { Badge } from '~/components/ui/badge';
import { ScrollArea } from '~/components/ui/scroll-area';
import { cn } from '~/lib/utils';
import type { TranscriptSegment } from '@milkpod/api/types';

interface TranscriptViewerProps {
  segments: TranscriptSegment[];
  activeSegmentId?: string;
  onSegmentClick?: (segment: TranscriptSegment) => void;
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

  const scrollToSegment = useCallback((segmentId: string) => {
    const el = containerRef.current?.querySelector(
      `[data-segment-id="${segmentId}"]`
    );
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  if (segments.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No transcript segments available.
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div ref={containerRef} className="space-y-1 p-4">
        {segments.map((segment) => {
          const isActive = segment.id === activeSegmentId;
          return (
            <button
              key={segment.id}
              type="button"
              data-segment-id={segment.id}
              onClick={() => {
                onSegmentClick?.(segment);
                scrollToSegment(segment.id);
              }}
              className={cn(
                'flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted/50',
                isActive && 'bg-muted'
              )}
            >
              <Badge
                variant="secondary"
                className="mt-0.5 shrink-0 font-mono text-xs tabular-nums"
              >
                {formatTime(segment.startTime)}
              </Badge>
              <div className="min-w-0 flex-1">
                {segment.speaker && (
                  <span className="text-xs font-medium text-muted-foreground">
                    {segment.speaker}
                  </span>
                )}
                <p className="text-sm text-foreground">{segment.text}</p>
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
