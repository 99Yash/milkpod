'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAssetTabContext } from '~/components/asset/asset-tab-context';
import { ChatShell } from '~/components/chat/chat-shell';
import { ChatPanel } from '~/components/chat/chat-panel';
import { fetchThreadsForAsset } from '~/lib/api-fetchers';
import { ChatTabSkeleton } from '~/components/asset/skeletons';
import { useThreadList } from '~/contexts/thread-list-context';
import type { ThreadListItem } from '~/components/chat/thread-sidebar';

export function ChatTabContent() {
  const { assetId, threadId, setThreadId } = useAssetTabContext();
  const [threads, setThreads] = useState<ThreadListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    fetchThreadsForAsset(assetId)
      .then((data) => {
        setThreads(data);
        if (!threadId && data.length > 0) {
          setThreadId(data[0]!.id);
        }
      })
      .finally(() => setLoading(false));
  }, [assetId, threadId, setThreadId]);

  const handleThreadChange = useCallback(
    (id: string) => {
      setThreadId(id);
    },
    [setThreadId],
  );

  const handleThreadsEmpty = useCallback(() => {
    setThreadId(undefined);
  }, [setThreadId]);

  if (loading || threads === null) {
    return <ChatTabSkeleton />;
  }

  return (
    <ChatShell
      assetId={assetId}
      initialThreads={threads}
      activeThreadId={threadId}
      onThreadChange={handleThreadChange}
      onThreadsEmpty={handleThreadsEmpty}
    >
      <ChatTabPanel
        assetId={assetId}
        threadId={threadId}
        onThreadChange={handleThreadChange}
      />
    </ChatShell>
  );
}

/**
 * Inner panel that lives inside ChatShell's ThreadListProvider.
 * Handles both "active thread" and "no thread" states.
 */
function ChatTabPanel({
  assetId,
  threadId,
  onThreadChange,
}: {
  assetId: string;
  threadId: string | undefined;
  onThreadChange: (id: string) => void;
}) {
  const { setThreads } = useThreadList();

  const handleThreadCreated = useCallback(
    (newThreadId: string) => {
      setThreads((prev) => {
        if (prev.some((t) => t.id === newThreadId)) return prev;
        return [
          { id: newThreadId, title: null, createdAt: new Date().toISOString() },
          ...prev,
        ];
      });
      onThreadChange(newThreadId);
    },
    [onThreadChange, setThreads],
  );

  if (threadId) {
    return (
      <ChatPanel
        assetId={assetId}
        threadId={threadId}
        onThreadCreated={handleThreadCreated}
      />
    );
  }

  return (
    <ChatPanel
      assetId={assetId}
      initialMessages={[]}
      onThreadCreated={handleThreadCreated}
    />
  );
}
