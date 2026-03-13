'use client';

import { useState, useEffect, useRef } from 'react';
import { BrainCircuit, ChevronRight } from 'lucide-react';
import type { MilkpodMessage, ToolOutput } from '@milkpod/ai/types';
import { isToolOutput } from '@milkpod/ai/types';
import { isToolUIPart } from 'ai';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '~/components/ui/collapsible';
import { cn } from '~/lib/utils';
import { ShimmerText } from './shimmer-text';
import { normalizeToolName } from './tool-meta';
import { ToolResult } from './tool-result';

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
    default:
      return {
        tool: 'retrieve',
        status: 'searching',
        query: '',
        segments: [],
        message: 'Searching transcript...',
      };
  }
}

function getReasoningSnippet(part: MilkpodMessage['parts'][number]): string {
  if ('text' in part && typeof part.text === 'string') {
    return part.text.trim();
  }
  return '';
}

interface ActivityStepsProps {
  parts: MilkpodMessage['parts'];
  isStreaming: boolean;
  hasTextContent: boolean;
}

export function ActivitySteps({
  parts,
  isStreaming,
  hasTextContent,
}: ActivityStepsProps) {
  const activityParts = parts.filter(
    (p) => p.type === 'reasoning' || isToolUIPart(p),
  );

  const stepCount = activityParts.length;

  // Start open; auto-collapse once text content appears
  const [isOpen, setIsOpen] = useState(!hasTextContent);
  const hasAutoCollapsed = useRef(hasTextContent);

  useEffect(() => {
    if (hasTextContent && !hasAutoCollapsed.current) {
      hasAutoCollapsed.current = true;
      setIsOpen(false);
    }
  }, [hasTextContent]);

  if (stepCount === 0) return null;

  const isComplete = !isStreaming || hasTextContent;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger
        className={cn(
          'group flex items-center gap-1 text-[13px] transition-colors',
          isComplete
            ? 'text-muted-foreground/60 hover:text-muted-foreground'
            : 'text-muted-foreground/75',
        )}
      >
        {isComplete ? (
          <>
            <span>
              {stepCount} {stepCount === 1 ? 'step' : 'steps'} completed
            </span>
            <ChevronRight className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-90" />
          </>
        ) : (
          <ShimmerText active className="text-muted-foreground/75">
            Analyzing...
          </ShimmerText>
        )}
      </CollapsibleTrigger>

      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
        <div className="relative mt-2.5 ml-[3px] border-l border-border/40 pl-5">
          {activityParts.map((part, i) => {
            const isLast = i === activityParts.length - 1;

            if (part.type === 'reasoning') {
              const snippet = getReasoningSnippet(part);
              return (
                <div
                  key={`reasoning-${i}`}
                  className={cn('relative', isLast ? 'pb-0.5' : 'pb-3')}
                >
                  {/* Timeline dot */}
                  <div className="absolute -left-[calc(1.25rem+2.5px)] top-[7px] size-[5px] rounded-full bg-muted-foreground/30" />
                  <div className="flex items-start gap-2">
                    <BrainCircuit className="mt-px size-4 shrink-0 text-muted-foreground/45" />
                    <ShimmerText
                      active={!!isStreaming && !hasTextContent}
                      className="text-[13px] leading-relaxed text-muted-foreground/65"
                    >
                      {snippet || 'Thinking...'}
                    </ShimmerText>
                  </div>
                </div>
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
                <div
                  key={`tool-${i}`}
                  className={cn('relative', isLast ? 'pb-0.5' : 'pb-3')}
                >
                  {/* Timeline dot */}
                  <div className="absolute -left-[calc(1.25rem+2.5px)] top-[7px] size-[5px] rounded-full bg-muted-foreground/30" />
                  <ToolResult
                    toolName={part.type}
                    output={output}
                    isStreaming={toolStreaming}
                  />
                </div>
              );
            }

            return null;
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
