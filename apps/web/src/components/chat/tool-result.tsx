'use client';

import NumberFlow from '@number-flow/react';
import type { ToolOutput } from '@milkpod/ai/types';
import { Spinner } from '~/components/ui/spinner';
import { cn } from '~/lib/utils';
import { formatTime } from '~/lib/format';
import { useTimestampAction } from './use-timestamp-action';
import { VideoMomentDialog } from './video-moment-dialog';
import { ShimmerText } from './shimmer-text';
import { TOOL_META } from './tool-meta';

interface ToolResultProps {
  toolName: string;
  output: ToolOutput;
}

function getLabel(output: ToolOutput) {
  switch (output.tool) {
    case 'retrieve': {
      const total = output.segments.length + (output.visualSegments?.length ?? 0);
      return output.status === 'searching'
        ? { prefix: 'Searching', count: 0, suffix: '' }
        : {
            prefix: 'Found',
            count: total,
            suffix: 'relevant segments',
          };
    }
    case 'context':
      return output.status === 'loading'
        ? { prefix: 'Loading context', count: 0, suffix: '' }
        : {
            prefix: 'Loaded',
            count: output.segments.length,
            suffix: 'context segments',
          };
    case 'read':
      return output.status === 'loading'
        ? { prefix: 'Reading transcript', count: 0, suffix: '' }
        : {
            prefix: 'Loaded',
            count: output.segments.length,
            suffix: `of ${output.totalSegments} segments`,
          };
  }
}

function getProgressMessage(output: ToolOutput): string {
  if (output.message?.trim()) return output.message;

  switch (output.tool) {
    case 'retrieve':
      return 'Searching transcript...';
    case 'context':
      return 'Loading transcript context...';
    case 'read':
      return 'Reading transcript...';
  }
}

function normalizeSegments(output: ToolOutput) {
  if (output.tool === 'retrieve') {
    return output.segments.map((segment) => ({
      id: segment.segmentId,
      text: segment.text,
      startTime: segment.startTime,
      endTime: segment.endTime,
      speaker: segment.speaker,
    }));
  }

  return output.segments.map((segment) => ({
    id: segment.id,
    text: segment.text,
    startTime: segment.startTime,
    endTime: segment.endTime,
    speaker: segment.speaker,
  }));
}

function getToolIcon(output: ToolOutput) {
  return TOOL_META[output.tool]?.icon ?? TOOL_META.tool.icon;
}

/** Maximum number of timestamp pills to show before "+N more" */
const MAX_PILLS = 8;

export function ToolResult({ toolName, output }: ToolResultProps) {
  const isLoading =
    output.status === 'searching' || output.status === 'loading';
  const pending = isLoading;
  const { isClickable, handleClick, momentDialog, clearDialog } =
    useTimestampAction();
  const label = getLabel(output);
  const ToolIcon = getToolIcon(output);
  const segments = normalizeSegments(output);

  return (
    <div
      className="space-y-2"
      data-tool={toolName}
    >
      {/* Step indicator */}
      <div className="flex items-start gap-2">
        {pending ? (
          <Spinner className="mt-px size-4 shrink-0" />
        ) : (
          <ToolIcon className="mt-px size-4 shrink-0 text-muted-foreground/45" />
        )}
        <span
          className={cn(
            'min-w-0 text-[13px] leading-relaxed',
            pending
              ? 'text-muted-foreground/75'
              : 'text-muted-foreground/65',
          )}
        >
          {pending ? (
            <ShimmerText active className="text-muted-foreground/75">
              {getProgressMessage(output)}
            </ShimmerText>
          ) : (
            <>
              {label.prefix}{' '}
              {label.count > 0 && (
                <NumberFlow value={label.count} trend={1} />
              )}
              {label.count > 0 && ' '}
              {label.suffix}
            </>
          )}
        </span>
      </div>

      {/* Source pills — timestamp badges */}
      {!pending && segments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-6">
          {segments.slice(0, MAX_PILLS).map((segment, index) =>
            isClickable ? (
              <button
                key={segment.id}
                type="button"
                onClick={() => handleClick(segment.startTime)}
                className="animate-enter rounded-full border border-border/40 bg-muted/40 px-2.5 py-0.5 font-mono text-xs tabular-nums text-muted-foreground/80 transition-all hover:border-border/60 hover:bg-muted/70 hover:text-foreground"
                style={index > 0 ? { animationDelay: `${index * 40}ms` } : undefined}
              >
                {formatTime(segment.startTime)}
              </button>
            ) : (
              <span
                key={segment.id}
                className="animate-enter rounded-full border border-border/40 bg-muted/40 px-2.5 py-0.5 font-mono text-xs tabular-nums text-muted-foreground/70"
                style={index > 0 ? { animationDelay: `${index * 40}ms` } : undefined}
              >
                {formatTime(segment.startTime)}
              </span>
            ),
          )}
          {segments.length > MAX_PILLS && (
            <span className="animate-enter self-center text-xs text-muted-foreground/50" style={{ animationDelay: `${MAX_PILLS * 40}ms` }}>
              +{segments.length - MAX_PILLS} more
            </span>
          )}
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
