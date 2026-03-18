'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchCollections } from '~/lib/api-fetchers';
import { queryKeys } from '~/lib/query-keys';
import { setCollectionCount } from '~/lib/plan-cache';
import { CollectionCard } from './collection-card';
import { CreateCollectionDialog } from './create-collection-dialog';
import { Spinner } from '~/components/ui/spinner';
import type { Collection } from '@milkpod/api/types';

interface CollectionListProps {
  refreshKey?: number;
  initialCollections?: Collection[];
}

export function CollectionList({ refreshKey, initialCollections }: CollectionListProps) {
  const queryClient = useQueryClient();

  const { data: collections = [], isLoading, refetch } = useQuery({
    queryKey: queryKeys.collections.list(),
    queryFn: fetchCollections,
    initialData: initialCollections,
    initialDataUpdatedAt: initialCollections ? Date.now() : undefined,
  });

  // Keep plan-cache collection count in sync with query data
  useEffect(() => {
    setCollectionCount(collections.length);
  }, [collections.length]);

  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    refetch();
  }, [refreshKey, refetch]);

  const invalidate = useCallback(
    () => { queryClient.invalidateQueries({ queryKey: queryKeys.collections.all }); },
    [queryClient]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {collections.length} {collections.length === 1 ? 'collection' : 'collections'}
        </p>
        <CreateCollectionDialog onCreated={invalidate} />
      </div>

      {collections.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No collections yet. Create one to group related assets.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection, index) => (
            <div
              key={collection.id}
              className="animate-enter"
              style={index > 0 ? { animationDelay: `${Math.min(index, 8) * 60}ms` } : undefined}
            >
              <CollectionCard
                collection={collection}
                onDeleted={invalidate}
                onUpdated={invalidate}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
