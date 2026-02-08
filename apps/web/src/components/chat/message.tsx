'use client';

import { isToolOrDynamicToolUIPart } from 'ai';
import type { ContextResult, RetrieveResult, MilkpodMessage } from '@milkpod/ai';
import { cn } from '~/lib/utils';
import { ToolResult } from './tool-result';

interface ChatMessageProps {
  message: MilkpodMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const fallbackOutput: RetrieveResult | ContextResult = {
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
          if (part.type === 'text') {
            return (
              <div key={i} className="whitespace-pre-wrap text-sm leading-relaxed">
                {part.text}
              </div>
            );
          }

          if (isToolOrDynamicToolUIPart(part)) {
            const hasOutput = part.state === 'output-available';
            const isStreaming = hasOutput && part.preliminary === true;
            const output =
              hasOutput && part.output
                ? (part.output as RetrieveResult | ContextResult)
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
