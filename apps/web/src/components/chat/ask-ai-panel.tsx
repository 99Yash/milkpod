'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useQueryState } from 'nuqs';
import { toast } from 'sonner';
import { ChatPanel } from './chat-panel';
import {
  ThreadSidebar,
  type ThreadListItem,
} from './thread-sidebar';
import {
  createThread,
  deleteThread,
  updateThread,
  regenerateThreadTitle,
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
  const [threadParam, setThreadParam] = useQueryState('thread');

  // Derive the active thread from URL param, falling back to SSR data or first thread
  const activeThreadId = threadParam
    ?? (initialThread?.status === 'loaded' ? initialThread.threadId : undefined)
    ?? threads[0]?.id;

  // Track the thread ID driving the ChatPanel separately so that
  // auto-created threads (from sending the first message) don't
  // remount the panel and kill the in-progress stream.
  const [panelThreadId, setPanelThreadId] = useState<string | undefined>(
    () => {
      if (threadParam) return threadParam;
      if (initialThread?.status === 'loaded') return initialThread.threadId;
      return threads[0]?.id;
    },
  );
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return getLocalStorageItem('THREAD_SIDEBAR_OPEN', true) ?? true;
  });

  // Sync URL on mount when a thread is active but not yet in the URL
  useEffect(() => {
    if (!threadParam && activeThreadId) {
      setThreadParam(activeThreadId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setThreadParam(threadId);
    setPanelThreadId(threadId);
  }, [setThreadParam]);

  const handleNewThread = useCallback(async () => {
    const thread = await createThread({ assetId });
    if (!thread) {
      toast.error('Failed to create thread');
      return;
    }
    setThreads((prev) => [thread, ...prev]);
    setThreadParam(thread.id);
    setPanelThreadId(thread.id);
  }, [assetId, setThreadParam]);

  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      const ok = await deleteThread(threadId);
      if (!ok) {
        toast.error('Failed to delete thread');
        return;
      }
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      const remaining = threadsRef.current.filter((t) => t.id !== threadId);
      const fallbackId = remaining[0]?.id;
      setThreadParam((prev) => (prev === threadId ? (fallbackId ?? null) : prev));
      setPanelThreadId((prev) => (prev === threadId ? fallbackId : prev));
    },
    [setThreadParam],
  );

  const handleRenameThread = useCallback(
    async (threadId: string, title: string) => {
      const updated = await updateThread(threadId, { title });
      if (!updated) {
        toast.error('Failed to rename thread');
        return;
      }
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, title: updated.title } : t)),
      );
    },
    [],
  );

  const handleRegenerateTitle = useCallback(
    async (threadId: string) => {
      const updated = await regenerateThreadTitle(threadId);
      if (!updated) {
        toast.error('Failed to generate title');
        return;
      }
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, title: updated.title } : t)),
      );
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
            setThreadParam(newThreadId);
          })
          .catch(() => {
            toast.error('Failed to refresh threads');
          });
      }
      chatThreadIdRef.current = newThreadId;
    },
    [assetId, setThreadParam],
  );

  const activeInitialThread: InitialThread | undefined =
    panelThreadId && initialThread?.status === 'loaded' && initialThread.threadId === panelThreadId
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
        onRenameThread={handleRenameThread}
        onRegenerateTitle={handleRegenerateTitle}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ChatPanel
          key={panelThreadId ?? '__empty__'}
          threadId={panelThreadId}
          assetId={assetId}
          initialThread={activeInitialThread}
          onThreadIdChange={handleThreadIdChange}
        />
      </div>
    </div>
  );
}
