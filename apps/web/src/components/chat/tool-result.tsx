'use client';

import type { ToolOutput } from '@milkpod/ai/types';
import { Badge } from '~/components/ui/badge';
import { Spinner } from '~/components/ui/spinner';
import { cn } from '~/lib/utils';

interface ToolResultProps {
  toolName: string;
  output: ToolOutput;
  isStreaming: boolean;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ToolResult({ toolName, output, isStreaming }: ToolResultProps) {
  const isSearching =
    output.status === 'searching' || output.status === 'loading';
  const segments = output.segments ?? [];

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

      {segments.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {segments.map((segment) => {
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
    </div>
  );
}
