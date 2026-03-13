export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { getServerSession, assertAuthenticated } from '~/lib/auth/session';
import { getCollectionWithItems } from '~/lib/data/queries';
import { CollectionDetail } from '~/components/collection/collection-detail';

type CollectionPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CollectionPage({ params }: CollectionPageProps) {
  const session = await getServerSession();

  assertAuthenticated(session);

  const { id } = await params;

  const collection = await getCollectionWithItems(id, session.user.id);
  if (!collection) notFound();

  return <CollectionDetail collectionId={id} initialCollection={collection} />;
}
