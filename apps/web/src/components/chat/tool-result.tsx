'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import NumberFlow from '@number-flow/react';
import type { ToolOutput } from '@milkpod/ai/types';
import { Spinner } from '~/components/ui/spinner';
import { cn } from '~/lib/utils';
import { formatTime } from '~/lib/format';
import { useTimestampAction } from './use-timestamp-action';
import { VideoMomentDialog } from './video-moment-dialog';

interface ToolResultProps {
  toolName: string;
  output: ToolOutput;
  isStreaming: boolean;
}

function getLabel(output: ToolOutput) {
  switch (output.tool) {
    case 'retrieve':
      return output.status === 'searching'
        ? { prefix: 'Searching', count: 0, suffix: '' }
        : { prefix: 'Found', count: output.segments.length, suffix: 'relevant segments' };
    case 'context':
      return output.status === 'loading'
        ? { prefix: 'Loading context', count: 0, suffix: '' }
        : { prefix: 'Loaded', count: output.segments.length, suffix: 'context segments' };
    case 'read':
      return output.status === 'loading'
        ? { prefix: 'Reading transcript', count: 0, suffix: '' }
        : { prefix: 'Loaded', count: output.segments.length, suffix: `of ${output.totalSegments} segments` };
  }
}

export function ToolResult({ toolName, output, isStreaming }: ToolResultProps) {
  const isLoading =
    output.status === 'searching' || output.status === 'loading';
  const [expanded, setExpanded] = useState(false);
  const { isClickable, handleClick, momentDialog, clearDialog } =
    useTimestampAction();
  const label = getLabel(output);

  const segments = output.tool === 'retrieve'
    ? output.segments.map((s) => ({ id: s.segmentId, text: s.text, startTime: s.startTime, endTime: s.endTime, speaker: s.speaker }))
    : output.segments;

  return (
    <div className="my-1">
      <button
        type="button"
        onClick={() => segments.length > 0 && setExpanded((v) => !v)}
        className={cn(
          'flex items-center gap-1.5 text-xs text-muted-foreground transition-colors',
          segments.length > 0 && 'cursor-pointer hover:text-foreground'
        )}
      >
        {isLoading || isStreaming ? (
          <Spinner className="size-3" />
        ) : (
          <ChevronRight
            className={cn(
              'size-3 transition-transform duration-200',
              expanded && 'rotate-90'
            )}
          />
        )}
        <span>
          {label.prefix}
          {label.count > 0 && (
            <>
              {' '}
              <NumberFlow value={label.count} trend={1} />
              {' '}
            </>
          )}
          {label.suffix}
        </span>
      </button>

      {expanded && segments.length > 0 && (
        <div className="ml-4.5 mt-1 max-h-48 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
          {segments.map((segment) => (
            <div
              key={segment.id}
              className="flex gap-2 py-0.5"
            >
              {isClickable ? (
                <button
                  type="button"
                  onClick={() => handleClick(segment.startTime)}
                  className="shrink-0 cursor-pointer font-mono font-medium tracking-tight tabular-nums text-purple-600 dark:text-purple-400"
                >
                  {formatTime(segment.startTime)}
                </button>
              ) : (
                <span className="shrink-0 font-mono tabular-nums">
                  {formatTime(segment.startTime)}
                </span>
              )}
              <span className="line-clamp-1">{segment.text}</span>
            </div>
          ))}
        </div>
      )}

      {momentDialog && (
        <VideoMomentDialog
          open
          onOpenChange={(open) => !open && clearDialog()}
          embedUrl={momentDialog.embedUrl}
          timestamp={momentDialog.timestamp}
        />
      )}
    </div>
  );
}
