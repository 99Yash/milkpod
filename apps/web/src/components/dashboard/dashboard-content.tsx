'use client';

import { useState, type ReactNode } from 'react';
import { DashboardTabsClient } from './dashboard-tabs-client';
import { LibraryTab } from '~/components/library/library-tab';
import { AgentTab } from '~/components/agent/agent-tab';
import type { Asset, Collection } from '@milkpod/api/types';

interface DashboardContentProps {
  home: ReactNode;
  initialAssets?: Asset[];
  initialCollections?: Collection[];
}

export function DashboardContent({
  home,
  initialAssets,
  initialCollections,
}: DashboardContentProps) {
  const [selectedAssetId, setSelectedAssetId] = useState<string | undefined>();

  return (
    <DashboardTabsClient
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
