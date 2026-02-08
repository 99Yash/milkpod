export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getServerSession } from '~/lib/auth/session';
import { route } from '~/lib/routes';
import { CollectionDetail } from '~/components/collection/collection-detail';

type CollectionPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CollectionPage({ params }: CollectionPageProps) {
  const session = await getServerSession();

  if (!session?.user) {
    redirect(route('/signin'));
  }

  const { id } = await params;

  return <CollectionDetail collectionId={id} />;
}
