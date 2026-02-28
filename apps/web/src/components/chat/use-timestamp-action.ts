'use client';

import { useState } from 'react';
import { useAssetSource } from './asset-source-context';
import { getEmbedUrl } from '~/lib/embed';

export function useTimestampAction() {
  const assetSource = useAssetSource();
  const [momentDialog, setMomentDialog] = useState<{
    embedUrl: string;
    timestamp: number;
  } | null>(null);

  const isClickable =
    !!assetSource &&
    assetSource.sourceType !== 'upload' &&
    !!assetSource.sourceUrl;

  function handleClick(seconds: number) {
    if (!assetSource) return;
    const result = getEmbedUrl(
      assetSource.sourceType,
      assetSource.sourceUrl,
      assetSource.sourceId,
      seconds,
    );
    if (!result) return;
    if (result.type === 'embed') {
      setMomentDialog({ embedUrl: result.url, timestamp: seconds });
    } else {
      window.open(result.url, '_blank', 'noopener');
    }
  }

  function clearDialog() {
    setMomentDialog(null);
  }

  return { isClickable, handleClick, momentDialog, clearDialog } as const;
}
