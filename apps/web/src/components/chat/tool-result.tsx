'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ToolOutput } from '@milkpod/ai/types';
import { Spinner } from '~/components/ui/spinner';
import { cn } from '~/lib/utils';
import { formatTime } from '~/lib/format';

interface ToolResultProps {
  toolName: string;
  output: ToolOutput;
  isStreaming: boolean;
}

const COLLAPSE_THRESHOLD = 6;

export function ToolResult({ toolName, output, isStreaming }: ToolResultProps) {
  const isSearching =
    output.status === 'searching' || output.status === 'loading';
  const [expanded, setExpanded] = useState(false);

  const segments = output.tool === 'retrieve'
    ? output.segments.map((s) => ({ id: s.segmentId, text: s.text, startTime: s.startTime, endTime: s.endTime, speaker: s.speaker }))
    : output.segments;

  const shouldCollapse = segments.length > COLLAPSE_THRESHOLD;
  const visibleSegments =
    shouldCollapse && !expanded
      ? segments.slice(0, COLLAPSE_THRESHOLD)
      : segments;

  return (
    <div className="my-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {isSearching || isStreaming ? (
          <Spinner className="size-3.5" />
        ) : (
          <svg
            className="size-3.5"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M11.5 7a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Zm-.82 4.74a6 6 0 1 1 1.06-1.06l3.04 3.04a.75.75 0 1 1-1.06 1.06l-3.04-3.04Z" />
          </svg>
        )}
        <span>{output.message}</span>
      </div>

      {visibleSegments.length > 0 && (
        <div className="mt-1.5 max-h-48 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
          {visibleSegments.map((segment) => (
            <div
              key={segment.id}
              className={cn(
                'flex gap-2 py-0.5',
                isStreaming && 'animate-pulse'
              )}
            >
              <span className="shrink-0 font-mono tabular-nums">
                {formatTime(segment.startTime)}
              </span>
              <span className="line-clamp-1">{segment.text}</span>
            </div>
          ))}
        </div>
      )}

      {shouldCollapse && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown
            className={cn(
              'size-3 transition-transform',
              expanded && 'rotate-180'
            )}
          />
          {expanded
            ? 'Show less'
            : `Show ${segments.length - COLLAPSE_THRESHOLD} more`}
        </button>
      )}
    </div>
  );
}
