'use client';

import { createContext, useContext } from 'react';
import type { Asset } from '@milkpod/api/types';

export type AssetSource = Pick<Asset, 'sourceUrl' | 'sourceType' | 'sourceId'>;

const AssetSourceContext = createContext<AssetSource | null>(null);

export function AssetSourceProvider({
  sourceUrl,
  sourceType,
  sourceId,
  children,
}: AssetSource & { children: React.ReactNode }) {
  return (
    <AssetSourceContext.Provider value={{ sourceUrl, sourceType, sourceId }}>
      {children}
    </AssetSourceContext.Provider>
  );
}

export function useAssetSource() {
  return useContext(AssetSourceContext);
}
