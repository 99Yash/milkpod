'use client';

import { isToolOrDynamicToolUIPart } from 'ai';
import { Streamdown } from 'streamdown';
import { isToolOutput } from '@milkpod/ai/types';
import type { MilkpodMessage, RetrieveSegmentsOutput } from '@milkpod/ai/types';
import { cn } from '~/lib/utils';
import { ToolResult } from './tool-result';

interface ChatMessageProps {
  message: MilkpodMessage;
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const fallbackOutput: RetrieveSegmentsOutput = {
    tool: 'retrieve',
    status: 'searching',
    query: '',
    segments: [],
    message: 'Processing...',
  };

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
            return (
              <Streamdown
                key={i}
                isAnimating={isStreaming}
                className="text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
              >
                {part.text}
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
      </div>
    </div>
  );
}
