'use client';

import { useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { useRouter, useSelectedLayoutSegment } from 'next/navigation';
import { toast } from 'sonner';
import {
  ThreadSidebar,
  type ThreadListItem,
} from './thread-sidebar';
import {
  createThread,
  deleteThread,
  updateThread,
  regenerateThreadTitle,
  prefetchChatMessages,
  primeChatMessagesCache,
} from '~/lib/api-fetchers';
import {
  getLocalStorageItem,
  setLocalStorageItem,
} from '~/lib/utils';
import { ThreadListProvider } from '~/contexts/thread-list-context';

interface ChatShellProps {
  assetId: string;
  initialThreads: ThreadListItem[];
  children: ReactNode;
}

export function ChatShell({ assetId, initialThreads, children }: ChatShellProps) {
  const router = useRouter();
  const segment = useSelectedLayoutSegment();
  const [threads, setThreads] = useState<ThreadListItem[]>(initialThreads);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const threadsRef = useRef(threads);
  threadsRef.current = threads;

  const prefetchedThreadIdsRef = useRef<Set<string>>(new Set());
  const isCreatingThreadRef = useRef(false);

  useEffect(() => {
    const stored = getLocalStorageItem('THREAD_SIDEBAR_OPEN', true);
    if (stored != null) setSidebarOpen(stored);
  }, []);

  // The active thread ID is the [threadId] segment from the URL.
  const activeThreadId = segment ?? undefined;

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      setLocalStorageItem('THREAD_SIDEBAR_OPEN', next);
      return next;
    });
  }, []);

  const prefetchThread = useCallback(
    (threadId: string) => {
      const key = `${assetId}:${threadId}`;
      if (prefetchedThreadIdsRef.current.has(key)) return;

      prefetchedThreadIdsRef.current.add(key);
      router.prefetch(`/asset/${assetId}/chat/${threadId}`);
      prefetchChatMessages(threadId);
    },
    [assetId, router],
  );

  useEffect(() => {
    if (!activeThreadId) return;

    prefetchThread(activeThreadId);

    const warmCandidates = threads
      .map((thread) => thread.id)
      .filter((id) => id !== activeThreadId)
      .slice(0, 3);

    if (warmCandidates.length === 0) return;

    const timeoutId = window.setTimeout(() => {
      warmCandidates.forEach((threadId) => {
        prefetchThread(threadId);
      });
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeThreadId, prefetchThread, threads]);

  const handleSelectThread = useCallback(
    (threadId: string) => {
      prefetchThread(threadId);

      if (segment === threadId) return;

      router.push(`/asset/${assetId}/chat/${threadId}`, { scroll: false });
    },
    [assetId, prefetchThread, router, segment],
  );

  const handleNewThread = useCallback(async () => {
    if (isCreatingThreadRef.current) return;

    isCreatingThreadRef.current = true;
    try {
      const created = await createThread({ assetId });
      if (!created) {
        toast.error('Failed to create thread');
        return;
      }

      primeChatMessagesCache(created.id, []);
      setThreads((prev) => [created, ...prev.filter((thread) => thread.id !== created.id)]);
      prefetchThread(created.id);
      router.push(`/asset/${assetId}/chat/${created.id}`, { scroll: false });
    } finally {
      isCreatingThreadRef.current = false;
    }
  }, [assetId, prefetchThread, router]);

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
      // If we deleted the active thread, navigate to the next one
      if (segment === threadId) {
        if (fallbackId) {
          prefetchThread(fallbackId);
          router.push(`/asset/${assetId}/chat/${fallbackId}`, { scroll: false });
        } else {
          router.push(`/asset/${assetId}/chat`, { scroll: false });
        }
      }
    },
    [assetId, prefetchThread, router, segment],
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

  return (
    <ThreadListProvider threads={threads} setThreads={setThreads} assetId={assetId}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/40 md:flex-row">
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
          onPrefetchThread={prefetchThread}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </ThreadListProvider>
  );
}
