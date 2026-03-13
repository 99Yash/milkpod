'use client';

import { useState, type ReactNode } from 'react';
import { DashboardTabsClient } from './dashboard-tabs-client';
import { LibraryTab } from '~/components/library/library-tab';
import { AgentTab } from '~/components/agent/agent-tab';

interface DashboardContentProps {
  home: ReactNode;
}

export function DashboardContent({
  home,
}: DashboardContentProps) {
  const [selectedAssetId, setSelectedAssetId] = useState<string | undefined>();

  return (
    <DashboardTabsClient
      home={home}
      library={
        <LibraryTab
          onSelectAsset={setSelectedAssetId}
        />
      }
      agent={
        <AgentTab
          initialAssetId={selectedAssetId}
        />
      }
    />
  );
}
