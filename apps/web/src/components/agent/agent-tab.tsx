'use client';

import { useEffect, useState } from 'react';
import { fetchAssets } from '~/lib/api-fetchers';
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
  const readyInitial = initialAssets?.filter((a) => a.status === 'ready');
  const [assets, setAssets] = useState<Asset[]>(readyInitial ?? []);
  const [isLoading, setIsLoading] = useState(!initialAssets);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    initialAssetId ?? readyInitial?.[0]?.id
  );

  useEffect(() => {
    fetchAssets()
      .then((data) => {
        const ready = data.filter((a) => a.status === 'ready');
        setAssets(ready);
        if (!selectedId && ready.length > 0) {
          setSelectedId(ready[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [selectedId]);

  useEffect(() => {
    if (initialAssetId) {
      setSelectedId(initialAssetId);
    }
  }, [initialAssetId]);

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
          value={selectedId ?? ''}
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
        {selectedId && <ChatPanel key={selectedId} assetId={selectedId} />}
      </DashboardPanel>
    </section>
  );
}
