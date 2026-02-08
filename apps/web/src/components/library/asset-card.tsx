'use client';

import { Badge } from '~/components/ui/badge';
import { Spinner } from '~/components/ui/spinner';
import {
  DashboardPanel,
  DashboardPanelContent,
} from '~/components/dashboard/dashboard-panel';
import { cn } from '~/lib/utils';
import type { Asset, AssetStatus } from '@milkpod/api/types';
import { isProcessingStatus } from '@milkpod/api/types';

interface AssetCardProps {
  asset: Asset;
  onSelect?: (assetId: string) => void;
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

export function AssetCard({ asset, onSelect }: AssetCardProps) {
  const { status } = asset;
  const isReady = status === 'ready';
  const isFailed = status === 'failed';
  const inProgress = isProcessingStatus(status);

  return (
    <DashboardPanel
      className={cn(
        'transition',
        isReady && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md'
      )}
      {...(isReady && {
        'data-tab-target': 'agent',
        role: 'button',
        tabIndex: 0,
        onClick: () => onSelect?.(asset.id),
      })}
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
          <Badge
            variant={isFailed ? 'destructive' : 'outline'}
            className={cn(
              'text-xs shrink-0',
              !isFailed && 'border-border/60'
            )}
          >
            {inProgress && <Spinner className="size-3 mr-1" />}
            {statusLabels[status] ?? status}
          </Badge>
        </div>
      </DashboardPanelContent>
    </DashboardPanel>
  );
}
