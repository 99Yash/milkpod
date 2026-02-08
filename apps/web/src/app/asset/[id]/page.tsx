export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getServerSession } from '~/lib/auth/session';
import { route } from '~/lib/routes';
import { AssetDetail } from '~/components/asset/asset-detail';

type AssetPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AssetPage({ params }: AssetPageProps) {
  const session = await getServerSession();

  if (!session?.user) {
    redirect(route('/signin'));
  }

  const { id } = await params;

  return <AssetDetail assetId={id} />;
}
