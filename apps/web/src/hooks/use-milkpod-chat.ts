'use client';

import { useRef, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';

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
  initialMessages?: UIMessage[];
} = {}) {
  const threadIdRef = useRef<string | undefined>(threadId);

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

  const chat = useChat({
    id: threadId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: `${SERVER_URL}/api/chat`,
      credentials: 'include',
      fetch: customFetch,
      body: {
        threadId,
        assetId,
        collectionId,
      },
    }),
  });

  return {
    ...chat,
    threadId: threadIdRef.current,
  };
}
