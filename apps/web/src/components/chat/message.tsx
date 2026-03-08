'use client';

import { isToolOrDynamicToolUIPart } from 'ai';
import { Streamdown } from 'streamdown';
import type { Components } from 'streamdown';
import { isToolOutput } from '@milkpod/ai/types';
import type { MilkpodMessage, RetrieveSegmentsOutput } from '@milkpod/ai/types';
import { cn } from '~/lib/utils';
import { ToolResult } from './tool-result';
import { TimestampLink } from './timestamp-link';
import { useAssetSource } from './asset-source-context';

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
        return `[${start}](#t=${startSec})–[${end}](#t=${endSec})`;
      }
      return `[${start}](#t=${startSec})`;
    },
  );
}

const streamdownComponents: Components = {
  a: ({ href, children, node: _, ...rest }) => {
    if (typeof href === 'string' && href.startsWith('#t=')) {
      const seconds = Number(href.slice(3));
      if (!Number.isFinite(seconds) || seconds < 0) {
        return <a href={href} {...rest}>{children}</a>;
      }
      return <TimestampLink seconds={seconds}>{children}</TimestampLink>;
    }
    return <a href={href} {...rest}>{children}</a>;
  },
};

interface ChatMessageProps {
  message: MilkpodMessage;
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const assetSource = useAssetSource();
  const fallbackOutput: RetrieveSegmentsOutput = {
    tool: 'retrieve',
    status: 'searching',
    query: '',
    segments: [],
    message: 'Processing...',
  };

  const shouldLinkify = !!assetSource && assetSource.sourceType !== 'upload';

  return (
    <div
      className={cn('flex gap-3 py-4', isUser ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'max-w-[80%] space-y-2',
          isUser && 'rounded-2xl bg-primary px-4 py-2.5 text-primary-foreground'
        )}
      >
        {message.parts.map((part, i) => {
          if (part.type === 'reasoning') return null;

          if (part.type === 'text') {
            const text = !isUser && shouldLinkify
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

          if (isToolOrDynamicToolUIPart(part)) {
            const hasOutput = part.state === 'output-available';
            const isStreaming = hasOutput && part.preliminary === true;
            const output =
              hasOutput && isToolOutput(part.output)
                ? part.output
                : fallbackOutput;

            return (
              <ToolResult
                key={i}
                toolName={part.type}
                output={output}
                isStreaming={isStreaming}
              />
            );
          }

          return null;
        })}

        {!isUser && !isStreaming && message.metadata?.finishReason === 'length' && (
          <p className="text-xs text-muted-foreground">
            Response trimmed by word limit — select a higher limit for longer
            answers.
          </p>
        )}
      </div>
    </div>
  );
}
