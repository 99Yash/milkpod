'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Clock,
  Mic,
  RotateCcw,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { ShareDialog } from '~/components/share/share-dialog';
import { fetchAssetDetail } from '~/lib/api-fetchers';
import { api } from '~/lib/api';
import { formatDuration } from '~/lib/format';
import { Badge } from '~/components/ui/badge';
import { Spinner } from '~/components/ui/spinner';
import { Button } from '~/components/ui/button';
import {
  DashboardPanel,
  DashboardPanelContent,
} from '~/components/dashboard/dashboard-panel';
import { AssetTabBar } from './asset-tab-bar';
import { AssetTabsClient } from './asset-tabs-client';
import { AssetTabProvider } from './asset-tab-context';
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
}

const statusLabels: Record<AssetStatus, string> = {
  queued: 'Queued',
  fetching: 'Fetching audio...',
  transcribing: 'Transcribing...',
  embedding: 'Embedding...',
  ready: 'Ready',
  failed: 'Failed',
};

export function AssetShell({ assetId, initialAsset }: AssetShellProps) {
  const [asset, setAsset] = useState<AssetWithTranscript>(initialAsset);
  const [progressMessage, setProgressMessage] = useState<string | undefined>();
  const [isRetrying, setIsRetrying] = useState(false);

  const refreshAsset = useCallback(() => {
    fetchAssetDetail(assetId)
      .then((result) => {
        if (result) setAsset(result);
      })
      .catch(() => {
        // silent — polling failures are not actionable
      });
  }, [assetId]);

  const handleRetry = useCallback(async () => {
    if (isRetrying) return;

    setIsRetrying(true);
    try {
      const { error } = await api.api.assets({ id: assetId }).retry.post();

      if (error) {
        const errValue =
          typeof error === 'object' && error !== null && 'value' in error
            ? (error as { value?: unknown }).value
            : undefined;

        const message =
          typeof errValue === 'object' && errValue !== null && 'message' in errValue
            ? String((errValue as { message: string }).message)
            : 'Could not start retry. Please try again.';

        toast.error(message);
        return;
      }

      setAsset((prev) => ({
        ...prev,
        status: 'queued',
        attempts: 0,
        lastError: null,
      }));
      setProgressMessage('Retrying...');
      toast.success('Retry started');
      refreshAsset();
    } catch {
      toast.error('Could not start retry. Please try again.');
    } finally {
      setIsRetrying(false);
    }
  }, [assetId, isRetrying, refreshAsset]);

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
    { onPollFallback: refreshAsset }
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
        <AssetTabProvider assetId={assetId}>
          <div className="relative isolate flex flex-col lg:h-[calc(100svh-7rem-4px)]">
            <div className="pointer-events-none absolute inset-x-0 top-[-120px] h-[220px] rounded-full bg-[radial-gradient(circle_at_center,oklch(0.95_0.03_238/0.4)_0%,transparent_70%)] blur-3xl dark:bg-[radial-gradient(circle_at_center,oklch(0.36_0.06_245)_0%,transparent_70%)] dark:opacity-50" />
            {/* Header */}
            <div className="shrink-0 space-y-3 pb-4 pt-1">
              {/* Row 1: back + actions */}
              <div className="flex items-center justify-between">
                <Link
                  href="/dashboard?tab=library"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowLeft className="size-3.5" />
                  <span className="sr-only sm:not-sr-only">Library</span>
                </Link>
                <div className="flex items-center gap-2">
                  {asset.status === 'failed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRetry}
                      disabled={isRetrying}
                    >
                      {isRetrying ? (
                        <Spinner className="mr-1 size-3" />
                      ) : (
                        <RotateCcw className="mr-1 size-3" />
                      )}
                      Retry
                    </Button>
                  )}
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

              {/* Row 2: title */}
              <h1 className="text-lg font-semibold leading-snug text-foreground">
                {asset.title}
              </h1>

              {/* Row 3: metadata */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {asset.channelName && (
                  <span className="inline-flex items-center gap-1.5">
                    <User className="size-3.5" />
                    {asset.channelName}
                  </span>
                )}
                {asset.duration && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="size-3.5" />
                    {formatDuration(asset.duration)}
                  </span>
                )}
                {speakers.size > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <Mic className="size-3.5" />
                    {speakers.size} speaker{speakers.size > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Main content */}
            {isReady && asset.segments.length > 0 ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <AssetTabBar />
                <AssetTabsClient />
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
                        ? 'Processing failed. Retry from here or from the library.'
                        : progressMessage ||
                          'Transcript will appear here once processing completes.'}
                    </p>
                    {asset.status === 'failed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleRetry}
                        disabled={isRetrying}
                      >
                        {isRetrying ? (
                          <Spinner className="mr-1 size-3" />
                        ) : (
                          <RotateCcw className="mr-1 size-3" />
                        )}
                        Retry
                      </Button>
                    )}
                  </div>
                </DashboardPanelContent>
              </DashboardPanel>
            )}
          </div>
        </AssetTabProvider>
      </AssetSourceProvider>
    </AssetProvider>
  );
}
