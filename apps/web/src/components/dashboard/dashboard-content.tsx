'use client';

import { useState, type ReactNode } from 'react';
import { DashboardTabsClient } from './dashboard-tabs-client';
import { LibraryTab } from '~/components/library/library-tab';
import { AgentTab } from '~/components/agent/agent-tab';

interface DashboardContentProps {
  initialTab: 'home' | 'library' | 'agent';
  home: ReactNode;
}

export function DashboardContent({ initialTab, home }: DashboardContentProps) {
  const [selectedAssetId, setSelectedAssetId] = useState<string | undefined>();

  return (
    <DashboardTabsClient
      initialTab={initialTab}
      home={home}
      library={<LibraryTab onSelectAsset={setSelectedAssetId} />}
      agent={<AgentTab initialAssetId={selectedAssetId} />}
    />
  );
}
