export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getServerSession, assertAuthenticated } from '~/lib/auth/session';
import { getThreadsForAsset } from '~/lib/data/queries';
import { NewThreadChat } from '~/components/chat/new-thread-chat';

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession();
  assertAuthenticated(session);

  const { id } = await params;
  const threads = await getThreadsForAsset(id, session.user.id);

  if (threads.length > 0) {
    redirect(`/asset/${id}/chat/${threads[0]!.id}`);
  }

  // No threads yet — render empty ChatPanel with thread creation handling
  return <NewThreadChat assetId={id} />;
}
