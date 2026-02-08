'use client';

import { useRef, useCallback, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { chatMetadataSchema, type MilkpodMessage } from '@milkpod/ai';

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

export function useMilkpodChat({
  threadId,
  assetId,
  collectionId,
  initialMessages,
}: {
  threadId?: string;
  assetId?: string;
  collectionId?: string;
  initialMessages?: MilkpodMessage[];
} = {}) {
  const threadIdRef = useRef<string | undefined>(threadId);

  useEffect(() => {
    threadIdRef.current = threadId;
  }, [threadId]);

  const customFetch: typeof globalThis.fetch = useCallback(
    async (input, init) => {
      const response = await globalThis.fetch(input, init);
      const id = response.headers.get('X-Thread-Id');
      if (id) {
        threadIdRef.current = id;
      }
      return response;
    },
    []
  );

  const body = useCallback(
    () => ({
      threadId: threadIdRef.current,
      assetId,
      collectionId,
    }),
    [assetId, collectionId]
  );

  const chat = useChat<MilkpodMessage>({
    id: threadId,
    messages: initialMessages,
    messageMetadataSchema: chatMetadataSchema,
    transport: new DefaultChatTransport({
      api: `${SERVER_URL}/api/chat`,
      credentials: 'include',
      fetch: customFetch,
      body,
    }),
  });

  return {
    ...chat,
    threadId: threadIdRef.current,
  };
}
