'use client';

import { useCallback, useState } from 'react';
import { UrlInputForm } from './url-input-form';
import { AssetList } from './asset-list';
import { CollectionList } from './collection-list';
import { SearchFilterBar, type AssetFilters } from './search-filter-bar';
import { cn } from '~/lib/utils';
import type { Collection } from '@milkpod/api/types';

type LibraryView = 'assets' | 'collections' | 'shared';

const emptyFilters: AssetFilters = { q: '', status: '', sourceType: '' };

const VIEWS: Array<{ value: LibraryView; label: string }> = [
  { value: 'assets', label: 'Assets' },
  { value: 'shared', label: 'Shared with me' },
  { value: 'collections', label: 'Collections' },
];

interface LibraryTabProps {
  onSelectAsset?: (assetId: string) => void;
  initialCollections?: Collection[];
}

export function LibraryTab({
  onSelectAsset,
  initialCollections,
}: LibraryTabProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [view, setView] = useState<LibraryView>('assets');
  const [filters, setFilters] = useState<AssetFilters>(emptyFilters);

  const handleSuccess = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const isAssetView = view === 'assets' || view === 'shared';
  const scope = view === 'shared' ? 'shared' : 'all';

  return (
    <section aria-labelledby="library-tab-title" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2
          id="library-tab-title"
          className="text-sm font-medium text-muted-foreground"
        >
          Library
        </h2>
        <div className="flex rounded-md border border-border/60 bg-accent/60 dark:bg-accent/30 p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => setView(v.value)}
              className={cn(
                'rounded-sm px-3 py-1 text-xs font-semibold transition-colors',
                view === v.value
                  ? 'bg-background text-accent-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {isAssetView && (
        <>
          {view === 'assets' ? (
            <UrlInputForm onSuccess={handleSuccess} />
          ) : null}
          <SearchFilterBar filters={filters} onChange={setFilters} />
          <AssetList
            onSelectAsset={onSelectAsset}
            refreshKey={refreshKey}
            filters={filters}
            scope={scope}
          />
        </>
      )}

      {view === 'collections' && (
        <CollectionList refreshKey={refreshKey} initialCollections={initialCollections} />
      )}
    </section>
  );
}
