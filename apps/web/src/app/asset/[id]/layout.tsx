export const dynamic = 'force-dynamic';

import { Suspense, type ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { DashboardLayout } from '~/components/layouts/dashboard';
import { getServerSession, assertAuthenticated } from '~/lib/auth/session';
import { getAssetWithTranscript } from '~/lib/data/queries';
import { AssetShell } from '~/components/asset/asset-shell';
import { AssetShellSkeleton } from '~/components/asset/asset-shell-skeleton';

export default function AssetLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  return (
    <DashboardLayout initialTab="library">
      <Suspense fallback={<AssetShellSkeleton />}>
        <AssetShellServer params={params} />
      </Suspense>
      {children}
    </DashboardLayout>
  );
}

async function AssetShellServer({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession();
  assertAuthenticated(session);

  const { id } = await params;
  const asset = await getAssetWithTranscript(id, session.user.id);
  if (!asset) notFound();

  return <AssetShell assetId={id} initialAsset={asset} />;
}
