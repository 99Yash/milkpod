'use client';

import { useEffect, useState } from 'react';
import { api } from '~/lib/api';
import { ChatPanel } from '~/components/chat/chat-panel';
import {
  DashboardPanel,
  DashboardPanelContent,
} from '~/components/dashboard/dashboard-panel';
import { Spinner } from '~/components/ui/spinner';
import type { Asset } from '@milkpod/api/types';

interface AgentTabProps {
  initialAssetId?: string;
}

export function AgentTab({ initialAssetId }: AgentTabProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    initialAssetId
  );

  useEffect(() => {
    api.api.assets
      .get()
      .then(({ data }) => {
        if (data && Array.isArray(data)) {
          const ready = (data as Asset[]).filter((a) => a.status === 'ready');
          setAssets(ready);
          if (!selectedId && ready.length > 0) {
            setSelectedId(ready[0].id);
          }
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
