'use client';

import { useCallback, useState } from 'react';
import { UrlInputForm } from './url-input-form';
import { AssetList } from './asset-list';
import { CollectionList } from './collection-list';
import { cn } from '~/lib/utils';

type LibraryView = 'assets' | 'collections';

interface LibraryTabProps {
  onSelectAsset?: (assetId: string) => void;
}

export function LibraryTab({ onSelectAsset }: LibraryTabProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [view, setView] = useState<LibraryView>('assets');

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
          <AssetList onSelectAsset={onSelectAsset} refreshKey={refreshKey} />
        </>
      )}

      {view === 'collections' && (
        <CollectionList refreshKey={refreshKey} />
      )}
    </section>
  );
}
