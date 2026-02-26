export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { getServerSession, assertAuthenticated } from '~/lib/auth/session';
import { getAssetWithTranscript, getLatestChatThread } from '~/lib/data/queries';
import { AssetDetail } from '~/components/asset/asset-detail';
import type { InitialThread } from '~/components/chat/chat-panel';

type AssetPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AssetPage({ params }: AssetPageProps) {
  const session = await getServerSession();

  assertAuthenticated(session);

  const { id } = await params;
  const [asset, thread] = await Promise.all([
    getAssetWithTranscript(id, session.user.id),
    getLatestChatThread(id, session.user.id),
  ]);

  if (!asset) notFound();

  const initialThread: InitialThread = thread
    ? { status: 'loaded', threadId: thread.threadId, messages: thread.messages }
    : { status: 'empty' };

  return <AssetDetail assetId={id} initialAsset={asset} initialThread={initialThread} />;
}
