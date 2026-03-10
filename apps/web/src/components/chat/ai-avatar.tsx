import { Sparkles } from 'lucide-react';
import { cn } from '~/lib/utils';

interface AiAvatarProps {
  className?: string;
}

export function AiAvatar({ className }: AiAvatarProps) {
  return (
    <div
      className={cn(
        'mt-1 flex size-7 shrink-0 items-center justify-center rounded-full border border-border/30 bg-gradient-to-b from-muted/80 to-muted/40 shadow-sm',
        className,
      )}
    >
      <Sparkles className="size-3.5 text-muted-foreground/80" />
    </div>
  );
}
