export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { getServerSession, assertAuthenticated } from '~/lib/auth/session';
import { getAssetWithTranscript, getLatestChatThread } from '~/lib/data/queries';
import { AssetDetail } from '~/components/asset/asset-detail';

type AssetPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AssetPage({ params }: AssetPageProps) {
  const session = await getServerSession();

  assertAuthenticated(session);

  const { id } = await params;
  const [asset, initialThread] = await Promise.all([
    getAssetWithTranscript(id, session.user.id),
    getLatestChatThread(id, session.user.id),
  ]);

  if (!asset) notFound();

  return <AssetDetail assetId={id} initialAsset={asset} initialThread={initialThread} />;
}
