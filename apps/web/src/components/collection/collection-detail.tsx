'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '~/lib/api';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import {
  DashboardPanel,
  DashboardPanelContent,
} from '~/components/dashboard/dashboard-panel';
import { ChatPanel } from '~/components/chat/chat-panel';
import { route } from '~/lib/routes';
import type { CollectionWithItems, AssetStatus } from '@milkpod/api/types';
import { AddAssetToCollectionDialog } from './add-asset-to-collection-dialog';

interface CollectionDetailProps {
  collectionId: string;
}

const statusLabels: Record<AssetStatus, string> = {
  queued: 'Queued',
  fetching: 'Fetching...',
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

export function CollectionDetail({ collectionId }: CollectionDetailProps) {
  const [collection, setCollection] = useState<CollectionWithItems | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const fetchCollection = useCallback(async () => {
    try {
      const { data, error } = await api.api.collections({ id: collectionId }).get();
      if (error || !data) {
        setNotFound(true);
        return;
      }
      setCollection(data as CollectionWithItems);
    } catch {
      toast.error('Failed to load collection');
      setNotFound(true);
    } finally {
      setIsLoading(false);
    }
  }, [collectionId]);

  useEffect(() => {
    fetchCollection();
  }, [fetchCollection]);

  const handleRemoveItem = async (itemId: string) => {
    setRemovingItemId(itemId);
    try {
      await api.api
        .collections({ id: collectionId })
        .items({ itemId })
        .delete();
      await fetchCollection();
    } catch {
      toast.error('Failed to remove item');
    } finally {
      setRemovingItemId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (notFound || !collection) {
    return (
      <div className="space-y-4">
        <BackButton />
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <p className="text-sm text-muted-foreground">Collection not found</p>
          <Link href="/dashboard?tab=library">
            <Button variant="outline" size="sm">
              Back to library
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const hasReadyAssets = collection.items.some((i) => i.asset.status === 'ready');

  return (
    <div className="space-y-4">
      <BackButton />

      {/* Collection header */}
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-foreground">
          {collection.name}
        </h1>
        {collection.description && (
          <p className="text-sm text-muted-foreground">
            {collection.description}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {collection.items.length}{' '}
          {collection.items.length === 1 ? 'asset' : 'assets'}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        {/* Asset list panel */}
        <DashboardPanel className="h-[600px]">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <h2 className="text-sm font-medium text-foreground">Assets</h2>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 h-7 text-xs"
              onClick={() => setAddDialogOpen(true)}
            >
              <Plus className="size-3" />
              Add
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {collection.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  No assets in this collection yet.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => setAddDialogOpen(true)}
                >
                  <Plus className="size-3.5" />
                  Add an asset
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {collection.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    {item.asset.thumbnailUrl && (
                      <div className="shrink-0 w-16 overflow-hidden rounded">
                        <img
                          src={item.asset.thumbnailUrl}
                          alt={item.asset.title}
                          className="aspect-video w-full object-cover"
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <Link
                        href={route(`/asset/${item.asset.id}`)}
                        className="text-sm font-medium text-foreground hover:underline line-clamp-1"
                      >
                        {item.asset.title}
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5">
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
                          className="text-[10px] border-border/60"
                        >
                          {statusLabels[item.asset.status] ?? item.asset.status}
                        </Badge>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveItem(item.id)}
                      disabled={removingItemId === item.id}
                    >
                      {removingItemId === item.id ? (
                        <Spinner className="size-3.5" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DashboardPanel>

        {/* Chat panel for scoped Q&A */}
        <DashboardPanel className="h-[600px]">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <h2 className="text-sm font-medium text-foreground">
              Ask AI
            </h2>
            <span className="text-xs text-muted-foreground">
              across collection
            </span>
          </div>
          {hasReadyAssets ? (
            <ChatPanel collectionId={collectionId} />
          ) : (
            <DashboardPanelContent>
              <p className="py-8 text-center text-sm text-muted-foreground">
                Add assets with ready status to start asking questions across
                this collection.
              </p>
            </DashboardPanelContent>
          )}
        </DashboardPanel>
      </div>

      <AddAssetToCollectionDialog
        collectionId={collectionId}
        existingAssetIds={collection.items.map((i) => i.asset.id)}
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAdded={fetchCollection}
      />
    </div>
  );
}

function BackButton() {
  return (
    <Link
      href="/dashboard?tab=library"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Back to library
    </Link>
  );
}
