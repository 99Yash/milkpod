'use client';

import type { UIMessage } from 'ai';
import { isToolOrDynamicToolUIPart } from 'ai';
import { cn } from '~/lib/utils';
import { ToolResult } from './tool-result';

interface ChatMessageProps {
  message: UIMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

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

            return (
              <ToolResult
                key={i}
                toolName={part.type}
                output={
                  hasOutput && part.output
                    ? (part.output as {
                        status: string;
                        message: string;
                        segments?: [];
                        query?: string;
                      })
                    : {
                        status: 'searching',
                        message: 'Processing...',
                      }
                }
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
