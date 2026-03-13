'use client';

import { useCallback } from 'react';
import { useThreadList } from '~/contexts/thread-list-context';
import { ChatPanel } from './chat-panel';

/**
 * Wraps ChatPanel for the empty-chat page (/asset/[id]/chat with no threads).
 * When the backend auto-creates a thread on the first message, this component
 * adds it to the sidebar and updates the URL without a full navigation
 * (which would kill the active stream).
 */
export function NewThreadChat({ assetId }: { assetId: string }) {
  const { setThreads } = useThreadList();

  const handleThreadCreated = useCallback(
    (threadId: string) => {
      setThreads((prev) => {
        if (prev.some((t) => t.id === threadId)) return prev;
        return [
          { id: threadId, title: null, createdAt: new Date().toISOString() },
          ...prev,
        ];
      });
      // Update URL without full navigation to keep the stream alive
      window.history.replaceState(null, '', `/asset/${assetId}/chat/${threadId}`);
    },
    [assetId, setThreads],
  );

  return (
    <ChatPanel
      assetId={assetId}
      initialMessages={[]}
      onThreadCreated={handleThreadCreated}
    />
  );
}
