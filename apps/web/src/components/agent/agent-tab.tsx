'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchAssets } from '~/lib/api-fetchers';
import { queryKeys } from '~/lib/query-keys';
import { ChatPanel } from '~/components/chat/chat-panel';
import { AssetSourceProvider } from '~/components/chat/asset-source-context';
import {
  DashboardPanel,
  DashboardPanelContent,
} from '~/components/dashboard/dashboard-panel';
import { Spinner } from '~/components/ui/spinner';
import { AssetCombobox } from './asset-combobox';
import type { Asset } from '@milkpod/api/types';

interface AgentTabProps {
  initialAssetId?: string;
  initialAssets?: Asset[];
}

export function AgentTab({ initialAssetId, initialAssets }: AgentTabProps) {
  const searchParams = useSearchParams();
  const assetParam = searchParams.get('asset');

  const { data: assets = [], isLoading } = useQuery({
    queryKey: queryKeys.assets.list(),
    queryFn: () => fetchAssets(),
    initialData: initialAssets,
    initialDataUpdatedAt: initialAssets ? Date.now() : undefined,
    select: (data) => data.filter((a) => a.status === 'ready'),
  });

  const [selectedId, setSelectedId] = useState<string | undefined>(
    initialAssetId ?? assetParam ?? undefined
  );

  useEffect(() => {
    if (initialAssetId) setSelectedId(initialAssetId);
  }, [initialAssetId]);

  const effectiveSelectedId = useMemo(() => {
    if (selectedId && assets.some((a) => a.id === selectedId)) return selectedId;
    return assets[0]?.id;
  }, [selectedId, assets]);

  // Sync selected asset to the URL
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (effectiveSelectedId) {
      url.searchParams.set('asset', effectiveSelectedId);
    } else {
      url.searchParams.delete('asset');
    }
    window.history.replaceState(null, '', url.toString());
  }, [effectiveSelectedId]);

  const handleAssetChange = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === effectiveSelectedId),
    [assets, effectiveSelectedId],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <section aria-labelledby="agent-tab-title" className="space-y-4">
        <h2
          id="agent-tab-title"
          className="text-sm font-medium text-muted-foreground"
        >
          Agent
        </h2>
        <DashboardPanel>
          <DashboardPanelContent className="space-y-4">
            <div>
              <p className="text-base font-semibold text-foreground">
                Video copilot
              </p>
              <p className="text-sm text-muted-foreground">
                Upload a video first to start chatting with the agent.
              </p>
            </div>
          </DashboardPanelContent>
        </DashboardPanel>
      </section>
    );
  }

  return (
    <section aria-labelledby="agent-tab-title" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2
          id="agent-tab-title"
          className="text-sm font-medium text-muted-foreground"
        >
          Agent
        </h2>
        <AssetCombobox
          assets={assets}
          value={effectiveSelectedId}
          onChange={handleAssetChange}
        />
      </div>
      <DashboardPanel className="h-[600px] border border-ring/12 bg-accent/5">
        {effectiveSelectedId && selectedAsset ? (
          <AssetSourceProvider
            sourceUrl={selectedAsset.sourceUrl}
            sourceType={selectedAsset.sourceType}
            sourceId={selectedAsset.sourceId}
          >
            <ChatPanel key={effectiveSelectedId} assetId={effectiveSelectedId} />
          </AssetSourceProvider>
        ) : null}
      </DashboardPanel>
    </section>
  );
}
