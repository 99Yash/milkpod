'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '~/components/ui/badge';
import { route } from '~/lib/routes';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import {
  DashboardPanel,
  DashboardPanelContent,
} from '~/components/dashboard/dashboard-panel';
import { cn } from '~/lib/utils';
import { api } from '~/lib/api';
import type { Asset, AssetStatus } from '@milkpod/api/types';
import { isProcessingStatus } from '@milkpod/api/types';

interface AssetCardProps {
  asset: Asset;
  onSelect?: (assetId: string) => void;
  onRetry?: () => void;
}

const statusLabels: Record<AssetStatus, string> = {
  queued: 'Queued',
  fetching: 'Fetching audio...',
  transcribing: 'Transcribing...',
  embedding: 'Embedding...',
  ready: 'Ready',
  failed: 'Failed',
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AssetCard({ asset, onSelect, onRetry }: AssetCardProps) {
  const [retrying, setRetrying] = useState(false);
  const { status } = asset;
  const isReady = status === 'ready';
  const isFailed = status === 'failed';
  const inProgress = isProcessingStatus(status);

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRetrying(true);
    try {
      await api.api.assets({ id: asset.id }).retry.post();
      onRetry?.();
    } finally {
      setRetrying(false);
    }
  };

  const card = (
    <DashboardPanel
      className={cn(
        'transition',
        isReady && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md'
      )}
    >
      {asset.thumbnailUrl && (
        <div className="aspect-video w-full overflow-hidden rounded-t-xl bg-muted">
          <img
            src={asset.thumbnailUrl}
            alt={asset.title}
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <DashboardPanelContent className="space-y-2">
        <p className="text-sm font-medium text-foreground line-clamp-2">
          {asset.title}
        </p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground truncate">
            {asset.channelName ?? ''}
            {asset.channelName && asset.duration ? ' · ' : ''}
            {asset.duration ? formatDuration(asset.duration) : ''}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {isFailed && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-xs"
                onClick={handleRetry}
                disabled={retrying}
              >
                {retrying ? <Spinner className="size-3" /> : 'Retry'}
              </Button>
            )}
            <Badge
              variant={isFailed ? 'destructive' : 'outline'}
              className={cn(
                'text-xs',
                !isFailed && 'border-border/60'
              )}
            >
              {inProgress && <Spinner className="size-3 mr-1" />}
              {statusLabels[status] ?? status}
            </Badge>
          </div>
        </div>
      </DashboardPanelContent>
    </DashboardPanel>
  );

  if (isReady) {
    return <Link href={route(`/asset/${asset.id}`)}>{card}</Link>;
  }

  return card;
}
