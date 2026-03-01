'use client';

import { createContext, useContext, useCallback, type Dispatch, type SetStateAction } from 'react';
import type { ThreadListItem } from '~/components/chat/thread-sidebar';
import { fetchThreadsForAsset } from '~/lib/api-fetchers';

interface ThreadListContextValue {
  threads: ThreadListItem[];
  setThreads: Dispatch<SetStateAction<ThreadListItem[]>>;
  assetId: string;
  refreshThreads: () => Promise<void>;
}

const ThreadListContext = createContext<ThreadListContextValue | null>(null);

export function ThreadListProvider({
  threads,
  setThreads,
  assetId,
  children,
}: {
  threads: ThreadListItem[];
  setThreads: Dispatch<SetStateAction<ThreadListItem[]>>;
  assetId: string;
  children: React.ReactNode;
}) {
  const refreshThreads = useCallback(async () => {
    const updated = await fetchThreadsForAsset(assetId);
    setThreads(updated);
  }, [assetId, setThreads]);

  return (
    <ThreadListContext.Provider value={{ threads, setThreads, assetId, refreshThreads }}>
      {children}
    </ThreadListContext.Provider>
  );
}

export function useThreadList() {
  const ctx = useContext(ThreadListContext);
  if (!ctx) throw new Error('useThreadList must be used within ThreadListProvider');
  return ctx;
}
