'use client';

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '~/components/ui/dialog';
import { formatTime } from '~/lib/format';

interface VideoMomentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  embedUrl: string;
  timestamp: number;
}

export function VideoMomentDialog({
  open,
  onOpenChange,
  embedUrl,
  timestamp,
}: VideoMomentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 sm:max-w-3xl">
        <DialogTitle className="sr-only">Video at {formatTime(timestamp)}</DialogTitle>
        <div className="aspect-video w-full">
          <iframe
            src={embedUrl}
            title={`Video at ${formatTime(timestamp)}`}
            className="size-full rounded-lg"
            allow="autoplay; fullscreen; picture-in-picture"
            sandbox="allow-scripts allow-same-origin allow-popups"
            allowFullScreen
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
