'use client';

import { cn } from '~/lib/utils';
import { ShimmerText } from './shimmer-text';

interface ThinkingIndicatorProps {
  label?: string;
  compact?: boolean;
  className?: string;
}

export function ThinkingIndicator({
  label = 'Thinking',
  compact = false,
  className,
}: ThinkingIndicatorProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/70 text-muted-foreground shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/60 animate-in fade-in-0 slide-in-from-bottom-1 duration-300',
        compact ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
        className,
      )}
    >
      <span className="relative inline-flex size-3.5 items-center justify-center">
        <span className="absolute size-3 rounded-full border border-foreground/25" />
        <span className="absolute size-1.5 rounded-full bg-foreground/70 animate-pulse motion-reduce:animate-none" />
      </span>

      <ShimmerText
        active
        className="font-medium text-muted-foreground motion-reduce:text-muted-foreground"
      >
        {label}
      </ShimmerText>

      <span className="inline-flex items-center gap-1" aria-hidden>
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="size-1 rounded-full bg-muted-foreground/70 animate-pulse motion-reduce:animate-none"
            style={{ animationDelay: `${index * 160}ms`, animationDuration: '1s' }}
          />
        ))}
      </span>
    </div>
  );
}
