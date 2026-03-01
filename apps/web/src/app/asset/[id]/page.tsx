'use client';

import { useAssetContext } from '~/contexts/asset-context';
import { TranscriptViewer } from '~/components/asset/transcript-viewer';

export default function TranscriptPage() {
  const { asset, assetId } = useAssetContext();

  return (
    <div className="min-h-0 flex-1 overflow-hidden rounded-b-xl border-x border-b border-border/40">
      <TranscriptViewer assetId={assetId} segments={asset.segments} />
    </div>
  );
}
