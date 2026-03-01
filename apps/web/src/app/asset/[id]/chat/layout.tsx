export const dynamic = 'force-dynamic';

import type { ReactNode } from 'react';
import { getServerSession, assertAuthenticated } from '~/lib/auth/session';
import { getThreadsForAsset } from '~/lib/data/queries';
import { ChatShell } from '~/components/chat/chat-shell';

export default async function ChatLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession();
  assertAuthenticated(session);

  const { id } = await params;
  const threads = await getThreadsForAsset(id, session.user.id);

  const initialThreads = threads.map((t) => ({
    id: t.id,
    title: t.title,
    createdAt: t.createdAt.toISOString(),
  }));

  return (
    <ChatShell assetId={id} initialThreads={initialThreads}>
      {children}
    </ChatShell>
  );
}
