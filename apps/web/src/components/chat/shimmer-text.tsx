'use client';

import type { ReactNode } from 'react';
import { cn } from '~/lib/utils';

interface ShimmerTextProps {
  children: ReactNode;
  active?: boolean;
  className?: string;
}

export function ShimmerText({
  children,
  active = true,
  className,
}: ShimmerTextProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center',
        active &&
          'bg-gradient-to-r from-foreground/55 via-foreground to-foreground/55 bg-[length:240%_100%] bg-clip-text text-transparent motion-reduce:bg-none motion-reduce:text-current animate-[shimmer_2.1s_linear_infinite] motion-reduce:animate-none',
        className,
      )}
    >
      {children}
    </span>
  );
}
