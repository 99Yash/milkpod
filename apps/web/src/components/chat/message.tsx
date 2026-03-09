'use client';

import type { MilkpodMessage, ToolOutput } from '@milkpod/ai/types';
import { isToolOutput } from '@milkpod/ai/types';
import { isToolUIPart } from 'ai';
import type { Components } from 'streamdown';
import { Streamdown } from 'streamdown';
import { cn } from '~/lib/utils';
import { useAssetSource } from './asset-source-context';
import { ThinkingIndicator } from './thinking-indicator';
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

  const shouldLinkify = !!assetSource && assetSource.sourceType !== 'upload';
  const hasRenderableAssistantPart = message.parts.some((part) => {
    if (part.type === 'text') return part.text.trim().length > 0;
    return isToolUIPart(part);
  });

  return (
    <div
      className={cn(
        'flex gap-3 py-3',
        isUser ? 'justify-end' : 'justify-start',
      )}
    >
      <div
        className={cn(
          'max-w-[85%] space-y-2',
          isUser
            ? 'rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground shadow-sm'
            : 'rounded-2xl rounded-bl-md bg-muted/40 px-4 py-3',
        )}
      >
        {message.parts.map((part, i) => {
          if (part.type === 'reasoning') return null;

          if (part.type === 'text') {
            const text =
              !isUser && shouldLinkify
                ? linkifyTimestamps(part.text)
                : part.text;

            return (
              <Streamdown
                key={i}
                isAnimating={isStreaming}
                className="text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                components={shouldLinkify ? streamdownComponents : undefined}
              >
                {text}
              </Streamdown>
            );
          }

          if (isToolUIPart(part)) {
            const hasOutput = part.state === 'output-available';
            const toolStreaming = hasOutput && part.preliminary === true;
            const output =
              hasOutput && isToolOutput(part.output)
                ? part.output
                : getFallbackToolOutput(part.type);

            return (
              <ToolResult
                key={i}
                toolName={part.type}
                output={output}
                isStreaming={toolStreaming}
              />
            );
          }

          return null;
          })}

        {!isUser && isStreaming && !hasRenderableAssistantPart && (
          <ThinkingIndicator compact className="mt-0.5" />
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
  );
}
