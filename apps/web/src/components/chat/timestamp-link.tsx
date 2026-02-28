'use client';

import { useTimestampAction } from './use-timestamp-action';
import { VideoMomentDialog } from './video-moment-dialog';

interface TimestampLinkProps {
  seconds: number;
  children: React.ReactNode;
}

export function TimestampLink({ seconds, children }: TimestampLinkProps) {
  const { isClickable, handleClick, momentDialog, clearDialog } =
    useTimestampAction();

  if (!isClickable) {
    return <span>{children}</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => handleClick(seconds)}
        className="cursor-pointer font-medium tracking-tight text-purple-600 dark:text-purple-400"
      >
        {children}
      </button>
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
