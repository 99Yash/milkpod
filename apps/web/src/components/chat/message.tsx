'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import type { MilkpodMessage, ToolOutput } from '@milkpod/ai/types';
import { isToolOutput } from '@milkpod/ai/types';
import { isToolUIPart } from 'ai';
import {
  BookOpenText,
  BrainCircuit,
  ChevronRight,
  FileSearch,
  Search,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { Components } from 'streamdown';
import { Streamdown } from 'streamdown';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '~/components/ui/collapsible';
import { Spinner } from '~/components/ui/spinner';
import { cn } from '~/lib/utils';
import { useAssetSource } from './asset-source-context';
import { TimestampLink } from './timestamp-link';
import { ToolResult } from './tool-result';

// Matches [MM:SS], [HH:MM:SS], and ranges like [MM:SS–MM:SS] or [MM:SS-MM:SS]
const TS = /\d+(?::\d{2}){1,2}/;
const TIMESTAMP_RE = new RegExp(
  `\\[(${TS.source})(?:[–\\-](${TS.source}))?\\](?!\\()`,
  'g',
);

function parseSeconds(ts: string): number {
  const parts = ts.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + parts[1];
}

function linkifyTimestamps(text: string): string {
  return text.replace(
    TIMESTAMP_RE,
    (_match, start: string, end: string | undefined) => {
      const startSec = parseSeconds(start);
      if (end) {
        const endSec = parseSeconds(end);
        return `[\\[${start}\\]](#t=${startSec}) – [\\[${end}\\]](#t=${endSec})`;
      }
      return `[\\[${start}\\]](#t=${startSec})`;
    },
  );
}

const streamdownComponents: Components = {
  a: ({ href, children, node: _, ...rest }) => {
    if (typeof href === 'string' && href.startsWith('#t=')) {
      const seconds = Number(href.slice(3));
      if (!Number.isFinite(seconds) || seconds < 0) {
        return (
          <a href={href} {...rest}>
            {children}
          </a>
        );
      }
      return <TimestampLink seconds={seconds}>{children}</TimestampLink>;
    }
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
};

type ActivityKind = 'thinking' | 'retrieve' | 'context' | 'read' | 'tool';

type ActivitySummaryItem = {
  key: ActivityKind;
  count: number;
  label: string;
  icon: LucideIcon;
};

function getToolKey(toolName: string): ActivityKind {
  const normalized = toolName.replace(/^tool-/, '');

  switch (normalized) {
    case 'retrieve_segments':
      return 'retrieve';
    case 'get_transcript_context':
      return 'context';
    case 'read_transcript':
      return 'read';
    default:
      return 'tool';
  }
}

function getActivityConfig(key: ActivityKind): {
  label: string;
  icon: LucideIcon;
} {
  switch (key) {
    case 'thinking':
      return { label: 'Thinking', icon: BrainCircuit };
    case 'retrieve':
      return { label: 'Search', icon: Search };
    case 'context':
      return { label: 'Context', icon: FileSearch };
    case 'read':
      return { label: 'Read', icon: BookOpenText };
    case 'tool':
      return { label: 'Tool', icon: Wrench };
  }
}

function getReasoningSnippet(part: MilkpodMessage['parts'][number]): string {
  if ('text' in part && typeof part.text === 'string') {
    return part.text.trim();
  }

  return '';
}

function isActivityPart(part: MilkpodMessage['parts'][number]) {
  return part.type === 'reasoning' || isToolUIPart(part);
}

interface ChatMessageProps {
  message: MilkpodMessage;
  isStreaming?: boolean;
}

function getFallbackToolOutput(toolName: string): ToolOutput {
  const normalized = toolName.replace(/^tool-/, '');

  switch (normalized) {
    case 'get_transcript_context':
      return {
        tool: 'context',
        status: 'loading',
        segments: [],
        message: 'Loading transcript context...',
      };
    case 'read_transcript':
      return {
        tool: 'read',
        status: 'loading',
        totalSegments: 0,
        segments: [],
        message: 'Reading transcript...',
      };
    case 'retrieve_segments':
      return {
        tool: 'retrieve',
        status: 'searching',
        query: '',
        segments: [],
        message: 'Searching transcript...',
      };
    default:
      return {
        tool: 'retrieve',
        status: 'searching',
        query: '',
        segments: [],
        message: 'Processing...',
      };
  }
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const assetSource = useAssetSource();
  const [activityOpen, setActivityOpen] = useState(false);
  const [partsRef] = useAutoAnimate({
    duration: 220,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  });
  const [activityRef] = useAutoAnimate({
    duration: 180,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  });

  const shouldLinkify = !!assetSource && assetSource.sourceType !== 'upload';
  const activityParts = useMemo(
    () => message.parts.filter(isActivityPart),
    [message.parts],
  );
  const firstActivityIndex = useMemo(
    () => message.parts.findIndex(isActivityPart),
    [message.parts],
  );
  const activitySummary = useMemo<ActivitySummaryItem[]>(() => {
    const counts = new Map<ActivityKind, number>();

    for (const part of activityParts) {
      const key = part.type === 'reasoning' ? 'thinking' : getToolKey(part.type);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return Array.from(counts.entries()).map(([key, count]) => {
      const config = getActivityConfig(key);
      return {
        key,
        count,
        label: config.label,
        icon: config.icon,
      };
    });
  }, [activityParts]);
  const pendingActivity = useMemo(
    () =>
      activityParts.some((part) => {
        if (part.type === 'reasoning') return !!isStreaming;
        if (!isToolUIPart(part)) return false;

        if (part.state !== 'output-available') return true;
        if (part.preliminary === true) return true;
        if (!isToolOutput(part.output)) return true;

        return (
          part.output.status === 'loading' || part.output.status === 'searching'
        );
      }),
    [activityParts, isStreaming],
  );
  const hasRenderableAssistantPart = message.parts.some((part) => {
    if (part.type === 'text') return part.text.trim().length > 0;
    return !isUser && isActivityPart(part);
  });
  const wasPendingActivityRef = useRef(pendingActivity);

  useEffect(() => {
    const wasPending = wasPendingActivityRef.current;
    if (wasPending && !pendingActivity && activityOpen) {
      setActivityOpen(false);
    }
    wasPendingActivityRef.current = pendingActivity;
  }, [activityOpen, pendingActivity]);

  return (
    <div
      className={cn(
        'flex gap-3 py-3',
        isUser ? 'justify-end' : 'justify-start',
      )}
    >
      <div
        className={cn(
          'max-w-[85%]',
          isUser
            ? 'rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground shadow-sm'
            : 'rounded-2xl rounded-bl-md bg-muted/40 px-4 py-3',
        )}
      >
        <div ref={partsRef} className="space-y-1.5">
          {message.parts.map((part, i) => {
            if (!isUser && i === firstActivityIndex && activityParts.length > 0) {
              return (
                <Collapsible
                  key="assistant-activity"
                  open={activityOpen}
                  onOpenChange={setActivityOpen}
                  className="space-y-1"
                >
                  <CollapsibleTrigger
                    className={cn(
                      'group flex w-full items-center gap-2 rounded-lg border border-border/45 bg-muted/25 px-2.5 py-1 text-xs text-muted-foreground transition-all duration-200 hover:border-border/70 hover:bg-muted/45 hover:text-foreground',
                      pendingActivity && 'border-border/55',
                    )}
                  >
                    <ChevronRight
                      className={cn(
                        'size-3 shrink-0 transition-transform duration-200',
                        activityOpen && 'rotate-90',
                      )}
                    />
                    <span className="font-medium">
                      {pendingActivity ? 'Working through tools' : 'Thinking and tools'}
                    </span>
                    {pendingActivity && <Spinner className="size-3 shrink-0" />}

                    <span className="ml-auto inline-flex items-center gap-1">
                      {activitySummary.map((item) => {
                        const Icon = item.icon;
                        return (
                          <span
                            key={item.key}
                            className="inline-flex items-center gap-0.5 rounded-md border border-border/40 bg-background/65 px-1 py-0.5 text-[10px] leading-none text-muted-foreground"
                            title={`${item.count} ${item.label.toLowerCase()} step${item.count === 1 ? '' : 's'}`}
                          >
                            <Icon className="size-2.5" />
                            {item.count > 1 && <span>{item.count}</span>}
                          </span>
                        );
                      })}
                    </span>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div ref={activityRef} className="space-y-1.5 pt-0.5">
                      {activityParts.map((activityPart, index) => {
                        if (activityPart.type === 'reasoning') {
                          const snippet = getReasoningSnippet(activityPart);
                          return (
                            <div
                              key={`thinking-${index}`}
                              className="flex items-center gap-2 rounded-lg border border-border/35 bg-muted/20 px-2 py-1 text-xs text-muted-foreground"
                            >
                              <BrainCircuit className="size-3.5 shrink-0" />
                              <span className="font-medium text-muted-foreground">
                                Thinking
                              </span>
                              {snippet && (
                                <span className="truncate text-muted-foreground/80">
                                  {snippet}
                                </span>
                              )}
                            </div>
                          );
                        }

                        if (isToolUIPart(activityPart)) {
                          const hasOutput =
                            activityPart.state === 'output-available';
                          const toolStreaming =
                            hasOutput && activityPart.preliminary === true;
                          const output =
                            hasOutput && isToolOutput(activityPart.output)
                              ? activityPart.output
                              : getFallbackToolOutput(activityPart.type);

                          return (
                            <ToolResult
                              key={`tool-${index}`}
                              toolName={activityPart.type}
                              output={output}
                              isStreaming={toolStreaming}
                            />
                          );
                        }

                        return null;
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            }

            if (isActivityPart(part)) return null;

            if (part.type === 'text') {
              const text =
                !isUser && shouldLinkify
                  ? linkifyTimestamps(part.text)
                  : part.text;

              return (
                <Streamdown
                  key={i}
                  isAnimating={isStreaming}
                  className="text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-1"
                  components={shouldLinkify ? streamdownComponents : undefined}
                >
                  {text}
                </Streamdown>
              );
            }

            return null;
          })}

          {!isUser && isStreaming && !hasRenderableAssistantPart && (
            <div className="inline-flex items-center gap-2 rounded-lg border border-border/45 bg-muted/25 px-2.5 py-1 text-xs text-muted-foreground">
              <Spinner className="size-3" />
              <BrainCircuit className="size-3.5" />
              <span className="font-medium">Thinking</span>
            </div>
          )}

          {!isUser &&
            !isStreaming &&
            message.metadata?.finishReason === 'length' && (
              <p className="mt-1 rounded-lg bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
                Response trimmed due to output limit — try a higher word limit or
                ask a follow-up.
              </p>
            )}
        </div>
      </div>
    </div>
  );
}
