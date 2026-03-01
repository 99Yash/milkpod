'use client';

import { createContext, useContext } from 'react';
import type { AssetWithTranscript } from '@milkpod/api/types';

interface AssetContextValue {
  asset: AssetWithTranscript;
  assetId: string;
  setAsset: React.Dispatch<React.SetStateAction<AssetWithTranscript>>;
}

const AssetContext = createContext<AssetContextValue | null>(null);

export function AssetProvider({
  asset,
  assetId,
  setAsset,
  children,
}: AssetContextValue & { children: React.ReactNode }) {
  return (
    <AssetContext.Provider value={{ asset, assetId, setAsset }}>
      {children}
    </AssetContext.Provider>
  );
}

export function useAssetContext() {
  const ctx = useContext(AssetContext);
  if (!ctx) throw new Error('useAssetContext must be used within AssetProvider');
  return ctx;
}
