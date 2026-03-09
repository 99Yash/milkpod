export const dynamic = 'force-dynamic';

import { getServerSession, assertAuthenticated } from '~/lib/auth/session';
import { getComments } from '~/lib/data/queries';
import { CommentsTab } from '~/components/comments/comments-tab';

export default async function CommentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession();
  assertAuthenticated(session);

  const { id } = await params;
  const comments = await getComments(id, session.user.id);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-b-xl border-x border-b border-border/40">
      <CommentsTab assetId={id} initialComments={comments} />
    </div>
  );
}
