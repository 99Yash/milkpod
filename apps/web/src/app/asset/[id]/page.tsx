export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { getServerSession, assertAuthenticated } from '~/lib/auth/session';
import { getAssetWithTranscript } from '~/lib/data/queries';
import { AssetShell } from '~/components/asset/asset-shell';
import { ReplicacheProvider } from '~/lib/replicache/context';

export default async function AssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession();
  assertAuthenticated(session);

  const { id } = await params;
  const asset = await getAssetWithTranscript(id, session.user.id);
  if (!asset) notFound();

  return (
    <ReplicacheProvider userId={session.user.id}>
      <AssetShell assetId={id} initialAsset={asset} />
    </ReplicacheProvider>
  );
}
