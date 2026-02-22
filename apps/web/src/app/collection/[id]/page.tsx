export const dynamic = 'force-dynamic';

import { getServerSession, assertAuthenticated } from '~/lib/auth/session';
import { CollectionDetail } from '~/components/collection/collection-detail';

type CollectionPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CollectionPage({ params }: CollectionPageProps) {
  const session = await getServerSession();

  assertAuthenticated(session);

  const { id } = await params;

  return <CollectionDetail collectionId={id} />;
}
