import { ChatPanel } from '~/components/chat/chat-panel';

export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ id: string; threadId: string }>;
}) {
  const { id, threadId } = await params;
  return <ChatPanel assetId={id} threadId={threadId} />;
}
