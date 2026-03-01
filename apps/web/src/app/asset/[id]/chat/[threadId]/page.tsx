export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { getServerSession, assertAuthenticated } from '~/lib/auth/session';
import { getChatThread } from '~/lib/data/queries';
import { ChatPanel } from '~/components/chat/chat-panel';

export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ id: string; threadId: string }>;
}) {
  const session = await getServerSession();
  assertAuthenticated(session);

  const { id, threadId } = await params;
  const thread = await getChatThread(threadId, session.user.id);
  if (!thread) notFound();

  return (
    <ChatPanel
      assetId={id}
      threadId={threadId}
      initialMessages={thread.messages}
    />
  );
}
