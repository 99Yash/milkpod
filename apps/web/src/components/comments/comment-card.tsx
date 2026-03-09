'use client';

import { useState } from 'react';
import { Play, X } from 'lucide-react';
import type { Comment } from '@milkpod/api/types';
import { formatTime } from '~/lib/format';
import { useTimestampAction } from '~/components/chat/use-timestamp-action';
import { VideoMomentDialog } from '~/components/chat/video-moment-dialog';
import { Badge } from '~/components/ui/badge';

interface CommentCardProps {
  comment: Comment;
  onDismiss: (id: string) => Promise<void>;
}

const sourceLabels: Record<string, string> = {
  audio: 'Audio',
  visual: 'Visual',
  hybrid: 'Hybrid',
};

const sourceColors: Record<string, string> = {
  audio: 'border-blue-500/30 text-blue-600 dark:text-blue-400',
  visual: 'border-purple-500/30 text-purple-600 dark:text-purple-400',
  hybrid: 'border-amber-500/30 text-amber-600 dark:text-amber-400',
};

export function CommentCard({ comment, onDismiss }: CommentCardProps) {
  const { isClickable, handleClick, momentDialog, clearDialog } =
    useTimestampAction();
  const [dismissing, setDismissing] = useState(false);

  async function handleDismiss() {
    setDismissing(true);
    try {
      await onDismiss(comment.id);
    } finally {
      setDismissing(false);
    }
  }

  return (
    <>
      <div className="group flex flex-col gap-2 rounded-lg border border-border/60 p-4 transition-colors hover:border-border">
        {/* Header: timestamp + source badge */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isClickable ? (
              <button
                type="button"
                onClick={() => handleClick(comment.startTime)}
                className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 transition-colors hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
              >
                <Play className="size-3" />
                {formatTime(comment.startTime)} – {formatTime(comment.endTime)}
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">
                {formatTime(comment.startTime)} – {formatTime(comment.endTime)}
              </span>
            )}
          </div>
          <Badge
            variant="outline"
            className={`shrink-0 text-[10px] ${sourceColors[comment.source] ?? ''}`}
          >
            {sourceLabels[comment.source] ?? comment.source}
          </Badge>
        </div>

        {/* Comment body */}
        <p className="text-sm leading-relaxed text-foreground">
          {comment.body}
        </p>

        {/* Actions */}
        <div className="flex items-center gap-1 pt-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={handleDismiss}
            disabled={dismissing}
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
