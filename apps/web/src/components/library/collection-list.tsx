'use client';

import { useEffect, useState, useCallback } from 'react';
import { fetchCollections } from '~/lib/api-fetchers';
import { CollectionCard } from './collection-card';
import { CreateCollectionDialog } from './create-collection-dialog';
import { Spinner } from '~/components/ui/spinner';
import type { Collection } from '@milkpod/api/types';

interface CollectionListProps {
  refreshKey?: number;
  initialCollections?: Collection[];
}

export function CollectionList({ refreshKey, initialCollections }: CollectionListProps) {
  const [collections, setCollections] = useState<Collection[]>(initialCollections ?? []);
  const [isLoading, setIsLoading] = useState(!initialCollections);

  const loadCollections = useCallback(async () => {
    try {
      setCollections(await fetchCollections());
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCollections();
  }, [loadCollections, refreshKey]);

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
        <CreateCollectionDialog onCreated={loadCollections} />
      </div>

      {collections.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No collections yet. Create one to group related assets.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection) => (
            <CollectionCard
              key={collection.id}
              collection={collection}
              onDeleted={loadCollections}
              onUpdated={loadCollections}
            />
          ))}
        </div>
      )}
    </div>
  );
}
