'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAssetContext } from '~/contexts/asset-context';
import { useAssetTabContext, type AssetTab } from './asset-tab-context';
import { TranscriptViewer } from '~/components/asset/transcript-viewer';
import { ChatTabContent } from '~/components/asset/tabs/chat-tab-content';
import { MomentsTabContent } from '~/components/asset/tabs/moments-tab-content';
import { CommentsTabContent } from '~/components/asset/tabs/comments-tab-content';
import { updateAssetSpeakerNames } from '~/lib/api-fetchers';
import {
  sanitizeSpeakerNames,
  type SpeakerNamesMap,
} from './transcript/speaker-names';

export function AssetTabsClient() {
  const { activeTab, assetId } = useAssetTabContext();
  const { asset, setAsset } = useAssetContext();
  const [isSavingSpeakerNames, setIsSavingSpeakerNames] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Re-focus the chat textarea when switching back to the chat tab
  useEffect(() => {
    if (activeTab === 'chat') {
      requestAnimationFrame(() => {
        chatContainerRef.current?.querySelector('textarea')?.focus();
      });
    }
  }, [activeTab]);

  const mountedTabsRef = useRef<Record<AssetTab, boolean>>({
    transcript: true,
    chat: activeTab === 'chat',
    moments: activeTab === 'moments',
    comments: activeTab === 'comments',
  });
  mountedTabsRef.current[activeTab] = true;
  const mounted = mountedTabsRef.current;

  const handleSaveSpeakerNames = useCallback(
    async (speakerNames: SpeakerNamesMap) => {
      const sanitized = sanitizeSpeakerNames(speakerNames);

      setIsSavingSpeakerNames(true);
      try {
        const updatedSpeakerNames = await updateAssetSpeakerNames(
          assetId,
          sanitized,
        );

        if (updatedSpeakerNames == null) {
          throw new Error('Failed to save speaker names');
        }

        setAsset((prev) => {
          if (!prev.transcript) return prev;

          const providerMetadata =
            prev.transcript.providerMetadata &&
            typeof prev.transcript.providerMetadata === 'object' &&
            !Array.isArray(prev.transcript.providerMetadata)
              ? (prev.transcript.providerMetadata as Record<string, unknown>)
              : {};

          return {
            ...prev,
            transcript: {
              ...prev.transcript,
              providerMetadata: {
                ...providerMetadata,
                speakerNames: updatedSpeakerNames,
              },
            },
          };
        });

        toast.success('Speaker names updated');
      } catch (error) {
        toast.error('Failed to save speaker names');
        throw error;
      } finally {
        setIsSavingSpeakerNames(false);
      }
    },
    [assetId, setAsset],
  );

  return (
    <>
      {/* Transcript — always mounted, data already in context */}
      <div
        className={
          activeTab !== 'transcript'
            ? 'hidden'
            : 'min-h-0 flex-1 overflow-hidden rounded-b-xl border-x border-b border-border/40'
        }
      >
        <TranscriptViewer
          assetId={assetId}
          segments={asset.segments}
          transcriptMetadata={asset.transcript?.providerMetadata}
          onSaveSpeakerNames={handleSaveSpeakerNames}
          isSavingSpeakerNames={isSavingSpeakerNames}
        />
      </div>

      {/* Chat — lazy mount; needs flex-col so ChatShell's flex-1 children size properly */}
      {mounted.chat ? (
        <div ref={chatContainerRef} className={activeTab !== 'chat' ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}>
          <ChatTabContent />
        </div>
      ) : null}

      {/* Moments — lazy mount */}
      {mounted.moments ? (
        <div
          className={
            activeTab !== 'moments'
              ? 'hidden'
              : 'min-h-0 flex-1 overflow-y-auto rounded-b-xl border-x border-b border-border/40'
          }
        >
          <MomentsTabContent assetId={assetId} />
        </div>
      ) : null}

      {/* Comments — lazy mount */}
      {mounted.comments ? (
        <div
          className={
            activeTab !== 'comments'
              ? 'hidden'
              : 'min-h-0 flex-1 overflow-y-auto rounded-b-xl border-x border-b border-border/40'
          }
        >
          <CommentsTabContent assetId={assetId} />
        </div>
      ) : null}
    </>
  );
}
