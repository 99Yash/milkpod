'use client';

import { useMemo } from 'react';
import { useOptionalAssetContext } from '~/contexts/asset-context';
import {
  extractSpeakerNames,
  formatSpeakerId,
} from '~/components/asset/transcript/speaker-names';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '~/components/ui/tooltip';

const LABEL_CLASS =
  'inline rounded-sm bg-muted px-1 py-0.5 text-[0.8125rem] font-medium text-foreground/80';

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

  const customName = speakerNames[speakerId];
  const fallbackName = formatSpeakerId(speakerId);

  // User has set a custom name — show it with a tooltip for the generic label
  if (customName) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`${LABEL_CLASS} cursor-default transition-colors hover:bg-muted/80`}>
            {customName}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{fallbackName}</TooltipContent>
      </Tooltip>
    );
  }

  // No custom name — show formatted ID inline (e.g. "Speaker 1")
  return <span className={LABEL_CLASS}>{fallbackName}</span>;
}
