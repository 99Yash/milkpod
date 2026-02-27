'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { ChatPanel } from './chat-panel';
import {
  ThreadSidebar,
  type ThreadListItem,
} from './thread-sidebar';
import {
  createThread,
  deleteThread,
  fetchThreadsForAsset,
} from '~/lib/api-fetchers';
import {
  getLocalStorageItem,
  setLocalStorageItem,
} from '~/lib/utils';
import type { InitialThread } from './chat-panel';

interface AskAiPanelProps {
  assetId: string;
  initialThreads: ThreadListItem[];
  initialThread?: InitialThread;
}

export function AskAiPanel({
  assetId,
  initialThreads,
  initialThread,
}: AskAiPanelProps) {
  const [threads, setThreads] =
    useState<ThreadListItem[]>(initialThreads);
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>(
    () => {
      if (initialThread?.status === 'loaded') return initialThread.threadId;
      return threads[0]?.id;
    },
  );
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return getLocalStorageItem('THREAD_SIDEBAR_OPEN', true) ?? true;
  });

  const chatThreadIdRef = useRef<string | undefined>(activeThreadId);
  const threadsRef = useRef(threads);
  threadsRef.current = threads;

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      setLocalStorageItem('THREAD_SIDEBAR_OPEN', next);
      return next;
    });
  }, []);

  const handleSelectThread = useCallback((threadId: string) => {
    setActiveThreadId(threadId);
  }, []);

  const handleNewThread = useCallback(async () => {
    const thread = await createThread({ assetId });
    if (!thread) {
      toast.error('Failed to create thread');
      return;
    }
    setThreads((prev) => [thread, ...prev]);
    setActiveThreadId(thread.id);
  }, [assetId]);

  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      const ok = await deleteThread(threadId);
      if (!ok) {
        toast.error('Failed to delete thread');
        return;
      }
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      setActiveThreadId((prev) => {
        if (prev !== threadId) return prev;
        const remaining = threadsRef.current.filter((t) => t.id !== threadId);
        return remaining[0]?.id;
      });
    },
    [],
  );

  const handleThreadIdChange = useCallback(
    (newThreadId: string | undefined) => {
      if (
        newThreadId &&
        newThreadId !== chatThreadIdRef.current &&
        !threadsRef.current.some((t) => t.id === newThreadId)
      ) {
        fetchThreadsForAsset(assetId)
          .then((updated) => {
            setThreads(updated);
            setActiveThreadId(newThreadId);
          })
          .catch(() => {
            toast.error('Failed to refresh threads');
          });
      }
      chatThreadIdRef.current = newThreadId;
    },
    [assetId],
  );

  const activeInitialThread: InitialThread | undefined =
    activeThreadId && initialThread?.status === 'loaded' && initialThread.threadId === activeThreadId
      ? initialThread
      : undefined;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border/40">
      <ThreadSidebar
        threads={threads}
        activeThreadId={activeThreadId}
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
        onSelectThread={handleSelectThread}
        onNewThread={handleNewThread}
        onDeleteThread={handleDeleteThread}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ChatPanel
          key={activeThreadId ?? '__empty__'}
          threadId={activeThreadId}
          assetId={assetId}
          initialThread={activeInitialThread}
          onThreadIdChange={handleThreadIdChange}
        />
      </div>
    </div>
  );
}
