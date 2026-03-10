'use client';

import { useAutoAnimate } from '@formkit/auto-animate/react';
import type { MilkpodMessage, ToolOutput } from '@milkpod/ai/types';
import { isToolOutput } from '@milkpod/ai/types';
import { isToolUIPart } from 'ai';
import { BrainCircuit } from 'lucide-react';
import type { Components } from 'streamdown';
import { Streamdown } from 'streamdown';
import { cn } from '~/lib/utils';
import { AiAvatar } from './ai-avatar';
import { useAssetSource } from './asset-source-context';
import { ShimmerText } from './shimmer-text';
import { TimestampLink } from './timestamp-link';
import { normalizeToolName } from './tool-meta';
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
  const kind = normalizeToolName(toolName);

  switch (kind) {
    case 'context':
      return {
        tool: 'context',
        status: 'loading',
        segments: [],
        message: 'Loading transcript context...',
      };
    case 'read':
      return {
        tool: 'read',
        status: 'loading',
        totalSegments: 0,
        segments: [],
        message: 'Reading transcript...',
      };
    case 'retrieve':
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
  const [partsRef] = useAutoAnimate({
    duration: 220,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  });

  const shouldLinkify = !!assetSource && assetSource.sourceType !== 'upload';
  const hasRenderableAssistantPart = message.parts.some((part) => {
    if (part.type === 'text') return part.text.trim().length > 0;
    return !isUser && isActivityPart(part);
  });

  // --- User message ---
  if (isUser) {
    return (
      <div className="flex justify-end py-2">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground shadow-sm">
          {message.parts.map((part, i) =>
            part.type === 'text' ? (
              <Streamdown
                key={i}
                className="text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
              >
                {part.text}
              </Streamdown>
            ) : null,
          )}
        </div>
      </div>
    );
  }

  // --- Assistant message ---
  return (
    <div className="flex gap-3 py-2">
      <AiAvatar />

      <div ref={partsRef} className="min-w-0 flex-1 space-y-3 pt-0.5">
        {message.parts.map((part, i) => {
          // Reasoning step — shown inline
          if (part.type === 'reasoning') {
            const snippet = getReasoningSnippet(part);
            return (
              <div
                key={`reasoning-${i}`}
                className="flex items-start gap-2 animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
              >
                <BrainCircuit className="mt-px size-4 shrink-0 text-muted-foreground/45" />
                <ShimmerText
                  active={!!isStreaming}
                  className="text-[13px] leading-relaxed text-muted-foreground/65"
                >
                  {snippet || 'Thinking...'}
                </ShimmerText>
              </div>
            );
          }

          // Tool step — shown inline with source pills
          if (isToolUIPart(part)) {
            const hasOutput = part.state === 'output-available';
            const toolStreaming = hasOutput && part.preliminary === true;
            const output =
              hasOutput && isToolOutput(part.output)
                ? part.output
                : getFallbackToolOutput(part.type);

            return (
              <ToolResult
                key={`tool-${i}`}
                toolName={part.type}
                output={output}
                isStreaming={toolStreaming}
              />
            );
          }

          // Text content
          if (part.type === 'text') {
            const text = shouldLinkify
              ? linkifyTimestamps(part.text)
              : part.text;

            return (
              <div
                key={i}
                className={cn(
                  'rounded-2xl rounded-tl-md bg-muted/40 px-4 py-3',
                  // If this is the first text part and there are activity parts before it,
                  // add a subtle top margin for separation
                  i > 0 && message.parts.slice(0, i).some(isActivityPart) && 'mt-1',
                )}
              >
                <Streamdown
                  isAnimating={isStreaming}
                  className="text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-1"
                  components={shouldLinkify ? streamdownComponents : undefined}
                >
                  {text}
                </Streamdown>
              </div>
            );
          }

          return null;
        })}

        {/* Initial thinking state (before any parts arrive) */}
        {isStreaming && !hasRenderableAssistantPart && (
          <div className="flex items-center gap-2 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
            <BrainCircuit className="size-4 shrink-0 text-muted-foreground/45 animate-pulse" />
            <ShimmerText
              active
              className="text-[13px] font-medium text-muted-foreground/65"
            >
              Thinking
            </ShimmerText>
            <span className="inline-flex items-center gap-1" aria-hidden>
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  className="size-1 rounded-full bg-muted-foreground/40 animate-pulse motion-reduce:animate-none"
                  style={{
                    animationDelay: `${index * 160}ms`,
                    animationDuration: '1s',
                  }}
                />
              ))}
            </span>
          </div>
        )}

        {/* Output length notice */}
        {!isStreaming && message.metadata?.finishReason === 'length' && (
          <p className="mt-1 rounded-lg bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
            Response trimmed due to output limit — try a higher word limit or
            ask a follow-up.
          </p>
        )}
      </div>
    </div>
  );
}
