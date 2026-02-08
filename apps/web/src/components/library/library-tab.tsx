'use client';

import { useCallback, useState } from 'react';
import { UrlInputForm } from './url-input-form';
import { AssetList } from './asset-list';

interface LibraryTabProps {
  onSelectAsset?: (assetId: string) => void;
}

export function LibraryTab({ onSelectAsset }: LibraryTabProps) {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSuccess = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <section aria-labelledby="library-tab-title" className="space-y-4">
      <h2
        id="library-tab-title"
        className="text-sm font-medium text-muted-foreground"
      >
        Library
      </h2>
      <UrlInputForm onSuccess={handleSuccess} />
      <AssetList onSelectAsset={onSelectAsset} refreshKey={refreshKey} />
    </section>
  );
}
