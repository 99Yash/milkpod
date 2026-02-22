'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ToolOutput } from '@milkpod/ai/types';
import { Badge } from '~/components/ui/badge';
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
  const segments = output.segments ?? [];
  const [expanded, setExpanded] = useState(false);

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
        <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
          {visibleSegments.map((segment) => {
            const segmentKey =
              'segmentId' in segment ? segment.segmentId : segment.id;

            return (
              <div
                key={segmentKey}
                className={cn(
                  'flex gap-2 rounded-md border bg-background p-2 text-sm',
                  isStreaming && 'animate-pulse'
                )}
              >
                <Badge variant="secondary" className="shrink-0 font-mono text-xs">
                  {formatTime(segment.startTime)}
                </Badge>
                {segment.speaker && (
                  <span className="shrink-0 font-medium text-xs text-muted-foreground">
                    {segment.speaker}:
                  </span>
                )}
                <p className="line-clamp-2 text-muted-foreground">
                  {segment.text}
                </p>
              </div>
            );
          })}
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
