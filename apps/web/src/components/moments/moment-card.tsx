'use client';

import { useState } from 'react';
import { Bookmark, Play, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Moment } from '@milkpod/api/types';
import { formatTime } from '~/lib/format';
import { useTimestampAction } from '~/components/chat/use-timestamp-action';
import { VideoMomentDialog } from '~/components/chat/video-moment-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { Badge } from '~/components/ui/badge';
import { cn } from '~/lib/utils';

export interface MomentAuthor {
  name: string | null;
  image: string | null;
  email: string | null;
}

interface MomentCardProps {
  moment: Moment;
  author?: MomentAuthor;
  onSave: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
}

function authorInitials(author: MomentAuthor): string {
  const source = (author.name || author.email || '').trim();
  if (!source) return '?';
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const second = parts[1]?.[0] ?? '';
  return (first + second).toUpperCase() || source[0]?.toUpperCase() || '?';
}

function authorDisplayName(author: MomentAuthor): string {
  return author.name || author.email?.split('@')[0] || 'Unknown';
}

const sourceLabels: Record<string, string> = {
  hybrid: 'Hybrid',
  llm: 'AI',
  qa: 'Ask AI',
};

export function MomentCard({
  moment,
  author,
  onSave,
  onDismiss,
}: MomentCardProps) {
  const { isClickable, handleClick, momentDialog, clearDialog } =
    useTimestampAction();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function handleAction(action: 'save' | 'dismiss') {
    setActionLoading(action);
    try {
      if (action === 'save') await onSave(moment.id);
      else await onDismiss(moment.id);
    } catch {
      toast.error(
        action === 'save'
          ? 'Could not save moment. Please try again.'
          : 'Could not dismiss moment. Please try again.',
      );
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <>
      <div className="group flex flex-col gap-2 rounded-lg card-elevated p-4 transition-shadow card-hover">
        {/* Header: title + score badge */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-medium leading-snug text-foreground">
            {moment.title}
          </h3>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {sourceLabels[moment.source] ?? moment.source}
          </Badge>
        </div>

        {/* Timestamp range + author */}
        <div className="flex items-center justify-between gap-2">
          {isClickable ? (
            <button
              type="button"
              onClick={() => handleClick(moment.startTime)}
              className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 transition-all duration-150 ease-out hover:text-purple-700 active:scale-[0.97] active:will-change-transform motion-reduce:active:scale-100 dark:text-purple-400 dark:hover:text-purple-300"
            >
              <Play className="size-3" />
              {formatTime(moment.startTime)} – {formatTime(moment.endTime)}
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">
              {formatTime(moment.startTime)} – {formatTime(moment.endTime)}
            </span>
          )}
          {author ? (
            <div
              className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
              title={author.email ?? undefined}
            >
              <Avatar className="size-4 shrink-0">
                {author.image ? (
                  <AvatarImage
                    src={author.image}
                    alt={authorDisplayName(author)}
                  />
                ) : null}
                <AvatarFallback className="text-[8px] font-semibold">
                  {authorInitials(author)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{authorDisplayName(author)}</span>
            </div>
          ) : null}
        </div>

        {/* Rationale */}
        <p className="text-xs leading-relaxed text-muted-foreground">
          {moment.rationale}
        </p>

        {/* Actions */}
        <div className="flex items-center gap-1 pt-1">
          <button
            type="button"
            onClick={() => handleAction('save')}
            disabled={actionLoading !== null || moment.isSaved}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-all duration-150 ease-out active:scale-[0.97] active:will-change-transform motion-reduce:active:scale-100',
              'disabled:pointer-events-none disabled:opacity-50',
              moment.isSaved
                ? 'bg-foreground/10 text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Bookmark
              className={cn('size-3', moment.isSaved && 'fill-current')}
            />
            {moment.isSaved ? 'Saved' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => handleAction('dismiss')}
            disabled={actionLoading !== null}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-all duration-150 ease-out hover:bg-muted hover:text-foreground active:scale-[0.97] active:will-change-transform motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-50"
          >
            <X className="size-3" />
            Dismiss
          </button>
        </div>
      </div>

      {momentDialog && (
        <VideoMomentDialog
          open
          onOpenChange={(open) => !open && clearDialog()}
          embedUrl={momentDialog.embedUrl}
          timestamp={momentDialog.timestamp}
        />
      )}
    </>
  );
}
