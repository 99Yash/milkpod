'use client';

import { useMemo } from 'react';
import { useOptionalAssetContext } from '~/contexts/asset-context';
import {
  extractSpeakerNames,
  formatSpeakerId,
} from '~/components/asset/transcript/speaker-names';

interface SpeakerLabelProps {
  speakerId: string;
}

export function SpeakerLabel({ speakerId }: SpeakerLabelProps) {
  const assetCtx = useOptionalAssetContext();

  const speakerNames = useMemo(
    () =>
      extractSpeakerNames(assetCtx?.asset.transcript?.providerMetadata),
    [assetCtx?.asset.transcript?.providerMetadata],
  );

  const displayName = speakerNames[speakerId] ?? formatSpeakerId(speakerId);

  return (
    <span className="inline rounded-sm bg-muted px-1 py-0.5 text-[0.8125rem] font-medium text-foreground/80">
      {displayName}
    </span>
  );
}
