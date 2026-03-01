'use client';

import { useState, useCallback, useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Clock,
  Mic,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { ShareDialog } from '~/components/share/share-dialog';
import { fetchAssetDetail } from '~/lib/api-fetchers';
import { formatDuration } from '~/lib/format';
import { Badge } from '~/components/ui/badge';
import { Spinner } from '~/components/ui/spinner';
import {
  DashboardPanel,
  DashboardPanelContent,
} from '~/components/dashboard/dashboard-panel';
import { AssetTabBar } from './asset-tab-bar';
import type { AssetWithTranscript, AssetStatus } from '@milkpod/api/types';
import { isProcessingStatus } from '@milkpod/api/types';
import { AssetSourceProvider } from '~/components/chat/asset-source-context';
import { AssetProvider } from '~/contexts/asset-context';
import {
  useAssetEvents,
  type AssetStatusEvent,
} from '~/hooks/use-asset-events';

interface AssetShellProps {
  assetId: string;
  initialAsset: AssetWithTranscript;
  children: ReactNode;
}

const statusLabels: Record<AssetStatus, string> = {
  queued: 'Queued',
  fetching: 'Fetching audio...',
  transcribing: 'Transcribing...',
  embedding: 'Embedding...',
  ready: 'Ready',
  failed: 'Failed',
};

export function AssetShell({ assetId, initialAsset, children }: AssetShellProps) {
  const [asset, setAsset] = useState<AssetWithTranscript>(initialAsset);
  const [progressMessage, setProgressMessage] = useState<string | undefined>();

  useAssetEvents(
    useCallback(
      (event: AssetStatusEvent) => {
        if (event.assetId !== assetId) return;
        setAsset((prev) => ({ ...prev, status: event.status }));
        setProgressMessage(event.message);
        if (event.status === 'ready') {
          setProgressMessage(undefined);
          fetchAssetDetail(assetId)
            .then((result) => {
              if (result) setAsset(result);
            })
            .catch(() => {
              toast.error('Failed to refresh asset details');
            });
        }
        if (event.status === 'failed') {
          setProgressMessage(undefined);
        }
      },
      [assetId],
    ),
  );

  const isReady = asset.status === 'ready';
  const speakers = useMemo(
    () =>
      new Set(
        asset.segments
          ?.map((s) => s.speaker)
          .filter((s): s is string => s != null),
      ),
    [asset.segments],
  );

  return (
    <AssetProvider asset={asset} assetId={assetId} setAsset={setAsset}>
      <AssetSourceProvider
        sourceUrl={asset.sourceUrl}
        sourceType={asset.sourceType}
        sourceId={asset.sourceId}
      >
        <div className="flex flex-col lg:h-[calc(100svh-6rem-2px)]">
          {/* Compact header */}
          <div className="shrink-0 space-y-2 pb-3">
            {/* Row 1: nav + title + actions */}
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard?tab=library"
                className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
                <span className="sr-only sm:not-sr-only">Library</span>
              </Link>
              <div className="h-5 w-px bg-border" />
              {asset.thumbnailUrl && (
                <img
                  src={asset.thumbnailUrl}
                  alt="Video thumbnail"
                  className="hidden h-10 w-auto shrink-0 rounded-md object-cover sm:block"
                />
              )}
              <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                {asset.title}
              </h1>
              <div className="flex shrink-0 items-center gap-2">
                <Badge
                  variant={asset.status === 'failed' ? 'destructive' : 'outline'}
                  className="text-xs"
                >
                  {isProcessingStatus(asset.status) && (
                    <Spinner className="mr-1 size-3" />
                  )}
                  {progressMessage || statusLabels[asset.status] || asset.status}
                </Badge>
                {isReady && (
                  <ShareDialog assetId={assetId} resourceName={asset.title} />
                )}
              </div>
            </div>

            {/* Row 2: metadata chips */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-[calc(theme(spacing.4)+theme(spacing.3)+1px)] text-xs text-muted-foreground">
              {asset.channelName && (
                <span className="flex items-center gap-1">
                  <User className="size-3" />
                  {asset.channelName}
                </span>
              )}
              {asset.duration && (
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {formatDuration(asset.duration)}
                </span>
              )}
              {speakers.size > 0 && (
                <span className="flex items-center gap-1">
                  <Mic className="size-3" />
                  {speakers.size} speaker{speakers.size > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {/* Main content */}
          {isReady && asset.segments.length > 0 ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <AssetTabBar assetId={assetId} />
              {children}
            </div>
          ) : isReady && asset.segments.length === 0 ? (
            <DashboardPanel>
              <DashboardPanelContent>
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Transcript is empty. The audio may not contain recognizable
                  speech.
                </p>
              </DashboardPanelContent>
            </DashboardPanel>
          ) : (
            <DashboardPanel>
              <DashboardPanelContent>
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  {isProcessingStatus(asset.status) && (
                    <Spinner className="size-5" />
                  )}
                  <p className="text-sm text-muted-foreground">
                    {asset.status === 'failed'
                      ? `Processing failed${asset.lastError ? `: ${asset.lastError}` : ''}`
                      : progressMessage ||
                        'Transcript will appear here once processing completes.'}
                  </p>
                </div>
              </DashboardPanelContent>
            </DashboardPanel>
          )}
        </div>
      </AssetSourceProvider>
    </AssetProvider>
  );
}
