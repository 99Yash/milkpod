'use client';

import { useEffect, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAssets } from '~/lib/api-fetchers';
import { queryKeys } from '~/lib/query-keys';
import { ChatPanel } from '~/components/chat/chat-panel';
import {
  DashboardPanel,
  DashboardPanelContent,
} from '~/components/dashboard/dashboard-panel';
import { Spinner } from '~/components/ui/spinner';
import type { Asset } from '@milkpod/api/types';

interface AgentTabProps {
  initialAssetId?: string;
  initialAssets?: Asset[];
}

export function AgentTab({ initialAssetId, initialAssets }: AgentTabProps) {
  const { data: assets = [], isLoading } = useQuery({
    queryKey: queryKeys.assets.list(),
    queryFn: () => fetchAssets(),
    select: (data) => data.filter((a) => a.status === 'ready'),
    initialData: initialAssets,
  });

  const [selectedId, setSelectedId] = useState<string | undefined>(
    initialAssetId ?? initialAssets?.filter((a) => a.status === 'ready')[0]?.id
  );

  useEffect(() => {
    if (initialAssetId) setSelectedId(initialAssetId);
  }, [initialAssetId]);

  const effectiveSelectedId = useMemo(() => {
    if (selectedId && assets.some((a) => a.id === selectedId)) return selectedId;
    return assets[0]?.id;
  }, [selectedId, assets]);

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
        <select
          value={effectiveSelectedId ?? ''}
          onChange={(e) => setSelectedId(e.target.value)}
          className="rounded-md border border-border/60 bg-background px-3 py-1.5 text-xs text-foreground"
        >
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
      </div>
      <DashboardPanel className="h-[600px]">
        {effectiveSelectedId && <ChatPanel key={effectiveSelectedId} assetId={effectiveSelectedId} />}
      </DashboardPanel>
    </section>
  );
}
