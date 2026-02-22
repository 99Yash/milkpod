'use client';

import { useState, type ReactNode } from 'react';
import { DashboardTabsClient } from './dashboard-tabs-client';
import { LibraryTab } from '~/components/library/library-tab';
import { AgentTab } from '~/components/agent/agent-tab';
import type { Asset, Collection } from '@milkpod/api/types';

interface DashboardContentProps {
  initialTab: 'home' | 'library' | 'agent';
  initialAssets?: Asset[];
  initialCollections?: Collection[];
  home: ReactNode;
}

export function DashboardContent({
  initialTab,
  initialAssets,
  initialCollections,
  home,
}: DashboardContentProps) {
  const [selectedAssetId, setSelectedAssetId] = useState<string | undefined>();

  return (
    <DashboardTabsClient
      initialTab={initialTab}
      home={home}
      library={
        <LibraryTab
          onSelectAsset={setSelectedAssetId}
          initialAssets={initialAssets}
          initialCollections={initialCollections}
        />
      }
      agent={
        <AgentTab
          initialAssetId={selectedAssetId}
          initialAssets={initialAssets}
        />
      }
    />
  );
}
