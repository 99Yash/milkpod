'use client';

import { useCallback, useState } from 'react';
import { UrlInputForm } from './url-input-form';
import { AssetList } from './asset-list';
import { CollectionList } from './collection-list';
import { SearchFilterBar, type AssetFilters } from './search-filter-bar';
import { cn } from '~/lib/utils';
import type { Asset, Collection } from '@milkpod/api/types';

type LibraryView = 'assets' | 'collections';

const emptyFilters: AssetFilters = { q: '', status: '', sourceType: '' };

interface LibraryTabProps {
  onSelectAsset?: (assetId: string) => void;
  initialAssets?: Asset[];
  initialCollections?: Collection[];
}

export function LibraryTab({
  onSelectAsset,
  initialAssets,
  initialCollections,
}: LibraryTabProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [view, setView] = useState<LibraryView>('assets');
  const [filters, setFilters] = useState<AssetFilters>(emptyFilters);

  const handleSuccess = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <section aria-labelledby="library-tab-title" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2
          id="library-tab-title"
          className="text-sm font-medium text-muted-foreground"
        >
          Library
        </h2>
        <div className="flex rounded-md border border-border/60 bg-muted/70 dark:bg-muted/30 p-0.5">
          <button
            type="button"
            onClick={() => setView('assets')}
            className={cn(
              'rounded-sm px-3 py-1 text-xs font-semibold transition-colors',
              view === 'assets'
                ? 'bg-background/90 text-foreground shadow-sm dark:bg-background/50'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Assets
          </button>
          <button
            type="button"
            onClick={() => setView('collections')}
            className={cn(
              'rounded-sm px-3 py-1 text-xs font-semibold transition-colors',
              view === 'collections'
                ? 'bg-background/90 text-foreground shadow-sm dark:bg-background/50'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Collections
          </button>
        </div>
      </div>

      {view === 'assets' && (
        <>
          <UrlInputForm onSuccess={handleSuccess} />
          <SearchFilterBar filters={filters} onChange={setFilters} />
          <AssetList
            onSelectAsset={onSelectAsset}
            refreshKey={refreshKey}
            filters={filters}
            initialAssets={initialAssets}
          />
        </>
      )}

      {view === 'collections' && (
        <CollectionList refreshKey={refreshKey} initialCollections={initialCollections} />
      )}
    </section>
  );
}
