'use client';

import { useRef } from 'react';
import { useAssetContext } from '~/contexts/asset-context';
import { useAssetTabContext, type AssetTab } from './asset-tab-context';
import { TranscriptViewer } from '~/components/asset/transcript-viewer';
import { ChatTabContent } from '~/components/asset/tabs/chat-tab-content';
import { MomentsTabContent } from '~/components/asset/tabs/moments-tab-content';
import { CommentsTabContent } from '~/components/asset/tabs/comments-tab-content';

export function AssetTabsClient() {
  const { activeTab, assetId } = useAssetTabContext();
  const { asset } = useAssetContext();

  const mountedTabsRef = useRef<Record<AssetTab, boolean>>({
    transcript: true,
    chat: activeTab === 'chat',
    moments: activeTab === 'moments',
    comments: activeTab === 'comments',
  });
  mountedTabsRef.current[activeTab] = true;
  const mounted = mountedTabsRef.current;

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
        <TranscriptViewer assetId={assetId} segments={asset.segments} />
      </div>

      {/* Chat — lazy mount; needs flex-col so ChatShell's flex-1 children size properly */}
      {mounted.chat ? (
        <div className={activeTab !== 'chat' ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}>
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
