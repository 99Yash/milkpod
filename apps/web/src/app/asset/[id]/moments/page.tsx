export const dynamic = 'force-dynamic';

import { getServerSession, assertAuthenticated } from '~/lib/auth/session';
import { getMoments } from '~/lib/data/queries';
import { MomentsTab } from '~/components/moments/moments-tab';

export default async function MomentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession();
  assertAuthenticated(session);

  const { id } = await params;
  const moments = await getMoments(id, session.user.id);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-b-xl border-x border-b border-border/40">
      <MomentsTab assetId={id} initialMoments={moments} />
    </div>
  );
}
