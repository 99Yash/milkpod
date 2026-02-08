'use client';

import { useState } from 'react';
import { isToolOrDynamicToolUIPart } from 'ai';
import { ChevronDown } from 'lucide-react';
import type { MilkpodMessage, ToolOutput, RetrieveSegmentsOutput } from '@milkpod/ai/types';
import { cn } from '~/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/components/ui/collapsible';
import { ToolResult } from './tool-result';

interface ChatMessageProps {
  message: MilkpodMessage;
}

function ReasoningBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ChevronDown
          className={cn(
            'size-3 transition-transform duration-200',
            !open && '-rotate-90'
          )}
        />
        Thinking
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1.5 whitespace-pre-wrap text-xs text-muted-foreground leading-relaxed">
          {text}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const fallbackOutput: RetrieveSegmentsOutput = {
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
          if (part.type === 'reasoning') {
            return <ReasoningBlock key={i} text={part.text} />;
          }

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
                ? (part.output as ToolOutput)
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
