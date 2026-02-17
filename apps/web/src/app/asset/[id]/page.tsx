export const dynamic = 'force-dynamic';

import { getServerSession, assertAuthenticated } from '~/lib/auth/session';
import { AssetDetail } from '~/components/asset/asset-detail';

type AssetPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AssetPage({ params }: AssetPageProps) {
  const session = await getServerSession();

  assertAuthenticated(session);

  const { id } = await params;

  return <AssetDetail assetId={id} />;
}
