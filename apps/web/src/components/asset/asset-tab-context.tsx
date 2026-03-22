'use client';

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'next/navigation';

export type AssetTab = 'transcript' | 'chat' | 'moments' | 'comments';

const validTabs = new Set<AssetTab>(['transcript', 'chat', 'moments', 'comments']);

interface AssetTabContextValue {
  assetId: string;
  activeTab: AssetTab;
  setActiveTab: (tab: AssetTab) => void;
  threadId: string | undefined;
  setThreadId: (id: string | undefined) => void;
}

const AssetTabContext = createContext<AssetTabContextValue | null>(null);

export function useAssetTabContext() {
  const ctx = useContext(AssetTabContext);
  if (!ctx) {
    throw new Error('useAssetTabContext must be used within AssetTabProvider');
  }
  return ctx;
}

function buildUrl(assetId: string, tab: AssetTab, threadId?: string): string {
  if (typeof window === 'undefined') return `/asset/${assetId}`;
  const url = new URL(window.location.href);
  url.pathname = `/asset/${assetId}`;

  url.searchParams.delete('tab');
  url.searchParams.delete('thread');

  if (tab !== 'transcript') {
    url.searchParams.set('tab', tab);
  }
  if (tab === 'chat' && threadId) {
    url.searchParams.set('thread', threadId);
  }

  return url.toString();
}

function deriveTab(tabParam: string | null): AssetTab {
  if (tabParam && validTabs.has(tabParam as AssetTab)) {
    return tabParam as AssetTab;
  }
  return 'transcript';
}

interface AssetTabProviderProps {
  assetId: string;
  children: ReactNode;
}

export function AssetTabProvider({
  assetId,
  children,
}: AssetTabProviderProps) {
  const searchParams = useSearchParams();
  const initialTab = deriveTab(searchParams.get('tab'));
  const initialThreadId = searchParams.get('thread') ?? undefined;

  const [activeTab, setActiveTabState] = useState<AssetTab>(initialTab);
  const [threadId, setThreadIdState] = useState<string | undefined>(initialThreadId);

  const setActiveTab = useCallback(
    (tab: AssetTab) => {
      setActiveTabState(tab);
      if (typeof window === 'undefined') return;
      window.history.replaceState(
        null,
        '',
        buildUrl(assetId, tab, tab === 'chat' ? threadId : undefined),
      );
    },
    [assetId, threadId],
  );

  const setThreadId = useCallback(
    (id: string | undefined) => {
      setThreadIdState(id);
      if (typeof window === 'undefined') return;
      window.history.replaceState(null, '', buildUrl(assetId, 'chat', id));
    },
    [assetId],
  );

  return (
    <AssetTabContext.Provider
      value={{ assetId, activeTab, setActiveTab, threadId, setThreadId }}
    >
      {children}
    </AssetTabContext.Provider>
  );
}
