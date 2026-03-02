'use client';

import { useState } from 'react';
import { Bookmark, Play, X } from 'lucide-react';
import type { Moment } from '@milkpod/api/types';
import { formatTime } from '~/lib/format';
import { useTimestampAction } from '~/components/chat/use-timestamp-action';
import { VideoMomentDialog } from '~/components/chat/video-moment-dialog';
import { Badge } from '~/components/ui/badge';
import { cn } from '~/lib/utils';

interface MomentCardProps {
  moment: Moment;
  onSave: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
}

const sourceLabels: Record<string, string> = {
  hybrid: 'Hybrid',
  llm: 'AI',
  qa: 'Ask AI',
};

export function MomentCard({ moment, onSave, onDismiss }: MomentCardProps) {
  const { isClickable, handleClick, momentDialog, clearDialog } =
    useTimestampAction();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function handleAction(action: 'save' | 'dismiss') {
    setActionLoading(action);
    try {
      if (action === 'save') await onSave(moment.id);
      else await onDismiss(moment.id);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <>
      <div className="group flex flex-col gap-2 rounded-lg border border-border/60 p-4 transition-colors hover:border-border">
        {/* Header: title + score badge */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-medium leading-snug text-foreground">
            {moment.title}
          </h3>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {sourceLabels[moment.source] ?? moment.source}
          </Badge>
        </div>

        {/* Timestamp range */}
        <div className="flex items-center gap-2">
          {isClickable ? (
            <button
              type="button"
              onClick={() => handleClick(moment.startTime)}
              className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 transition-colors hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
            >
              <Play className="size-3" />
              {formatTime(moment.startTime)} – {formatTime(moment.endTime)}
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">
              {formatTime(moment.startTime)} – {formatTime(moment.endTime)}
            </span>
          )}
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
              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
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
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
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
