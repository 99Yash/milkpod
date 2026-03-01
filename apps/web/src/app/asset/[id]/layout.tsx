export const dynamic = 'force-dynamic';

import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { DashboardLayout } from '~/components/layouts/dashboard';
import { getServerSession, assertAuthenticated } from '~/lib/auth/session';
import { getAssetWithTranscript } from '~/lib/data/queries';
import { AssetShell } from '~/components/asset/asset-shell';

export default async function AssetLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession();
  assertAuthenticated(session);

  const { id } = await params;
  const asset = await getAssetWithTranscript(id, session.user.id);
  if (!asset) notFound();

  return (
    <DashboardLayout activeNav="library">
      <AssetShell assetId={id} initialAsset={asset}>
        {children}
      </AssetShell>
    </DashboardLayout>
  );
}
