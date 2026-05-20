export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { getServerSession, assertAuthenticated } from '~/lib/auth/session';
import { getAssetWithTranscript } from '~/lib/data/queries';
import { AssetShell } from '~/components/asset/asset-shell';
import { markNotificationsReadForAsset } from '~/lib/server/notifications';

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

  // Direct-navigation auto-read: any unread bell items pointing at this asset
  // flip to read. Fire-and-forget; a failure here should not block the page.
  // The server helper also pokes the user so other sessions rebase.
  void markNotificationsReadForAsset(session.user.id, id);

  // ReplicacheProvider is mounted in DashboardLayout — don't nest a second
  // one here or Replicache will create two instances for the same user.
  return <AssetShell assetId={id} initialAsset={asset} />;
}
