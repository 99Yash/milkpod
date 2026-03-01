'use client';

import { useState, useCallback, useRef, type ReactNode } from 'react';
import { useRouter, useSelectedLayoutSegment } from 'next/navigation';
import { toast } from 'sonner';
import {
  ThreadSidebar,
  type ThreadListItem,
} from './thread-sidebar';
import { ChatPanel } from './chat-panel';
import {
  deleteThread,
  updateThread,
  regenerateThreadTitle,
  fetchThreadsForAsset,
} from '~/lib/api-fetchers';
import {
  getLocalStorageItem,
  setLocalStorageItem,
} from '~/lib/utils';
import { useEffect } from 'react';
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
  const [isDraft, setIsDraft] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const threadsRef = useRef(threads);
  threadsRef.current = threads;

  useEffect(() => {
    const stored = getLocalStorageItem('THREAD_SIDEBAR_OPEN', true);
    if (stored != null) setSidebarOpen(stored);
  }, []);

  // The active thread ID is the [threadId] segment from the URL.
  // During a draft, nothing is highlighted.
  const activeThreadId = isDraft ? undefined : (segment ?? undefined);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      setLocalStorageItem('THREAD_SIDEBAR_OPEN', next);
      return next;
    });
  }, []);

  const handleSelectThread = useCallback(
    (threadId: string) => {
      setIsDraft(false);
      router.push(`/asset/${assetId}/chat/${threadId}`);
    },
    [assetId, router],
  );

  const handleNewThread = useCallback(() => {
    setIsDraft(true);
  }, []);

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
          router.push(`/asset/${assetId}/chat/${fallbackId}`);
        } else {
          router.push(`/asset/${assetId}/chat`);
        }
      }
    },
    [assetId, router, segment],
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

  // Called by ChatPanel when a draft thread is created on the backend
  const handleThreadCreated = useCallback(
    (newThreadId: string) => {
      setIsDraft(false);
      // Update URL without full navigation (preserves active stream)
      window.history.replaceState(null, '', `/asset/${assetId}/chat/${newThreadId}`);
      // Refresh thread list
      fetchThreadsForAsset(assetId)
        .then((updated) => setThreads(updated))
        .catch(() => toast.error('Failed to refresh threads'));
    },
    [assetId],
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
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {isDraft ? (
            <ChatPanel
              assetId={assetId}
              initialMessages={[]}
              onThreadCreated={handleThreadCreated}
            />
          ) : (
            children
          )}
        </div>
      </div>
    </ThreadListProvider>
  );
}
