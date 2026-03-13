import { redirect } from 'next/navigation';

export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ id: string; threadId: string }>;
}) {
  const { id, threadId } = await params;
  redirect(`/asset/${id}?tab=chat&thread=${threadId}`);
}
