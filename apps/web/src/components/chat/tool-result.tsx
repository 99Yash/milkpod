'use client';

import { useAutoAnimate } from '@formkit/auto-animate/react';
import {
  BookOpenText,
  ChevronRight,
  FileSearch,
  Search,
  Wrench,
} from 'lucide-react';
import NumberFlow from '@number-flow/react';
import type { ToolOutput } from '@milkpod/ai/types';
import { Spinner } from '~/components/ui/spinner';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '~/components/ui/collapsible';
import { cn } from '~/lib/utils';
import { formatTime } from '~/lib/format';
import { useTimestampAction } from './use-timestamp-action';
import { VideoMomentDialog } from './video-moment-dialog';
import { ShimmerText } from './shimmer-text';

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
  switch (output.tool) {
    case 'retrieve':
      return Search;
    case 'context':
      return FileSearch;
    case 'read':
      return BookOpenText;
    default:
      return Wrench;
  }
}

export function ToolResult({ toolName, output, isStreaming }: ToolResultProps) {
  const [resultRef] = useAutoAnimate({
    duration: 200,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  });
  const isLoading =
    output.status === 'searching' || output.status === 'loading';
  const pending = isLoading || isStreaming;
  const { isClickable, handleClick, momentDialog, clearDialog } =
    useTimestampAction();
  const label = getLabel(output);
  const ToolIcon = getToolIcon(output);

  const segments = normalizeSegments(output);

  const canExpand = segments.length > 0;

  return (
    <div
      className="my-0 animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
      data-tool={toolName}
    >
      <Collapsible className="group/tool">
        <div ref={resultRef} className="space-y-1">
          <CollapsibleTrigger
            disabled={!canExpand}
            aria-busy={pending}
            className={cn(
              'group relative inline-flex items-center gap-1.5 overflow-hidden rounded-lg border px-2.5 py-0.5 text-xs transition-all duration-200',
              canExpand
                ? 'cursor-pointer border-border/45 bg-muted/45 text-muted-foreground hover:border-border/70 hover:bg-muted/70 hover:text-foreground'
                : 'border-border/35 bg-muted/25 text-muted-foreground/90',
              pending && 'border-border/55',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-0 rounded-lg opacity-0 transition-opacity',
                pending &&
                  'opacity-100 bg-gradient-to-r from-transparent via-foreground/[0.06] to-transparent bg-[length:220%_100%] animate-[shimmer_1.65s_linear_infinite] motion-reduce:animate-none',
              )}
            />

            {pending ? (
              <Spinner className="relative size-3" />
            ) : (
              <ChevronRight className="relative size-3 transition-transform duration-200 group-data-[state=open]:rotate-90" />
            )}

            <ToolIcon className="relative size-3.5 shrink-0 text-muted-foreground/90" />

            <span className="relative inline-flex min-w-0 items-center gap-1">
              <ShimmerText
                active={pending}
                className={cn(
                  'font-medium',
                  pending
                    ? 'text-foreground/90 motion-reduce:text-muted-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {label.prefix}
              </ShimmerText>

              {label.count > 0 && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <NumberFlow value={label.count} trend={1} />
                </span>
              )}

              {label.suffix && <span className="truncate">{label.suffix}</span>}
            </span>
          </CollapsibleTrigger>

          {pending && (
            <div className="animate-in fade-in-0 slide-in-from-top-1 duration-300 pl-5 pr-1.5">
              <div className="inline-flex max-w-full items-center gap-2 rounded-md bg-muted/20 px-2 py-1">
                <span className="relative h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-border/55">
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-foreground/45 to-transparent bg-[length:220%_100%] animate-[shimmer_1.35s_linear_infinite] motion-reduce:animate-none" />
                </span>
                <span className="truncate text-[11px] leading-none text-muted-foreground/85">
                  {getProgressMessage(output)}
                </span>
              </div>
            </div>
          )}

          {canExpand && (
            <CollapsibleContent>
              <div className="mt-1 overflow-hidden rounded-xl border border-border/50 bg-muted/[0.22] shadow-sm">
                <div className="max-h-52 space-y-1 overflow-y-auto p-2.5 text-xs text-muted-foreground">
                  {segments.map((segment, index) => (
                    <div
                      key={segment.id}
                      className="animate-in fade-in-0 slide-in-from-bottom-1 flex gap-2 rounded-md px-1 py-1 transition-colors duration-300 hover:bg-muted/60"
                      style={{
                        animationDelay: `${index * 35}ms`,
                        animationFillMode: 'both',
                      }}
                    >
                      {isClickable ? (
                        <button
                          type="button"
                          onClick={() => handleClick(segment.startTime)}
                          className="shrink-0 cursor-pointer font-mono font-medium tracking-tight tabular-nums text-cyan-700 transition-colors hover:text-cyan-800 dark:text-cyan-300 dark:hover:text-cyan-200"
                        >
                          {formatTime(segment.startTime)}
                        </button>
                      ) : (
                        <span className="shrink-0 font-mono tabular-nums text-muted-foreground/95">
                          {formatTime(segment.startTime)}
                        </span>
                      )}
                      <span className="line-clamp-1">{segment.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CollapsibleContent>
          )}
        </div>

        {momentDialog && (
          <VideoMomentDialog
            open
            onOpenChange={(open) => !open && clearDialog()}
            embedUrl={momentDialog.embedUrl}
            timestamp={momentDialog.timestamp}
          />
        )}
      </Collapsible>
    </div>
  );
}
