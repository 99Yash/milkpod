'use client';

import { useEffect, useState } from 'react';
import { Clock, Link2Off, Mic, User } from 'lucide-react';
import { api } from '~/lib/api';
import { Badge } from '~/components/ui/badge';
import { Spinner } from '~/components/ui/spinner';
import {
  DashboardPanel,
  DashboardPanelContent,
} from '~/components/dashboard/dashboard-panel';
import { TranscriptViewer } from '~/components/asset/transcript-viewer';
import type {
  Asset,
  Collection,
  Transcript,
  TranscriptSegment,
  CollectionWithItems,
} from '@milkpod/api/types';

interface SharedViewProps {
  token: string;
}

type SharedAsset = Asset & {
  transcript: Transcript | null;
  segments: TranscriptSegment[];
};

type SharedData =
  | {
      type: 'asset';
      resource: SharedAsset;
      canQuery: boolean;
      expiresAt: string | null;
    }
  | {
      type: 'collection';
      resource: CollectionWithItems;
      canQuery: boolean;
      expiresAt: string | null;
    };

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0)
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function SharedView({ token }: SharedViewProps) {
  const [data, setData] = useState<SharedData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchSharedResource() {
      setIsLoading(true);
      try {
        const { data: result, error } = await api.api.shares
          .validate({ token })
          .get();
        if (cancelled) return;

        if (error || !result || !('type' in result)) {
          setNotFound(true);
          return;
        }
        setData(result as SharedData);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchSharedResource();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <Link2Off className="size-10 text-muted-foreground" />
          <h1 className="text-lg font-semibold text-foreground">
            Link not found
          </h1>
          <p className="text-sm text-muted-foreground">
            This share link is invalid, expired, or has been revoked.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary" className="text-xs">
          Shared
        </Badge>
        {data.canQuery && (
          <Badge variant="outline" className="text-xs">
            Q&A enabled
          </Badge>
        )}
        {data.expiresAt && (
          <span>
            Expires{' '}
            {new Date(data.expiresAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        )}
      </div>

      {data.type === 'asset' ? (
        <SharedAssetView resource={data.resource} />
      ) : (
        <SharedCollectionView resource={data.resource} />
      )}
    </div>
  );
}

function SharedAssetView({ resource }: { resource: SharedAsset }) {
  const speakers = new Set(
    resource.segments?.filter((s) => s.speaker).map((s) => s.speaker!)
  );

  return (
    <div className="space-y-4">
      {/* Asset header */}
      <div className="flex items-start gap-4">
        {resource.thumbnailUrl && (
          <div className="hidden shrink-0 overflow-hidden rounded-lg sm:block sm:w-40">
            <img
              src={resource.thumbnailUrl}
              alt={resource.title}
              className="aspect-video w-full object-cover"
            />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="text-lg font-semibold text-foreground leading-tight">
            {resource.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {resource.channelName && (
              <span className="flex items-center gap-1">
                <User className="size-3" />
                {resource.channelName}
              </span>
            )}
            {resource.duration && (
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {formatDuration(resource.duration)}
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
      </div>

      {/* Transcript */}
      {resource.segments.length > 0 ? (
        <DashboardPanel className="h-[600px]">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <h2 className="text-sm font-medium text-foreground">Transcript</h2>
            <span className="text-xs text-muted-foreground">
              {resource.segments.length} segments
            </span>
          </div>
          <TranscriptViewer segments={resource.segments} />
        </DashboardPanel>
      ) : (
        <DashboardPanel>
          <DashboardPanelContent>
            <p className="py-8 text-center text-sm text-muted-foreground">
              {resource.status === 'ready'
                ? 'Transcript is empty.'
                : 'Transcript is still being processed.'}
            </p>
          </DashboardPanelContent>
        </DashboardPanel>
      )}
    </div>
  );
}

function SharedCollectionView({
  resource,
}: {
  resource: CollectionWithItems;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-foreground">
          {resource.name}
        </h1>
        {resource.description && (
          <p className="text-sm text-muted-foreground">
            {resource.description}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {resource.items.length}{' '}
          {resource.items.length === 1 ? 'asset' : 'assets'}
        </p>
      </div>

      <DashboardPanel>
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-medium text-foreground">Assets</h2>
        </div>
        {resource.items.length === 0 ? (
          <DashboardPanelContent>
            <p className="py-8 text-center text-sm text-muted-foreground">
              This collection is empty.
            </p>
          </DashboardPanelContent>
        ) : (
          <div className="divide-y">
            {resource.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                {item.asset.thumbnailUrl && (
                  <div className="w-16 shrink-0 overflow-hidden rounded">
                    <img
                      src={item.asset.thumbnailUrl}
                      alt={item.asset.title}
                      className="aspect-video w-full object-cover"
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-medium text-foreground">
                    {item.asset.title}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2">
                    {item.asset.duration && (
                      <span className="text-xs text-muted-foreground">
                        {formatDuration(item.asset.duration)}
                      </span>
                    )}
                    <Badge
                      variant={
                        item.asset.status === 'failed'
                          ? 'destructive'
                          : 'outline'
                      }
                      className="border-border/60 text-[10px]"
                    >
                      {item.asset.status}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardPanel>
    </div>
  );
}
