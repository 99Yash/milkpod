'use client';

import { useRef, useCallback, useEffect } from 'react';
import { useChat, type UseChatHelpers } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { clientEnv } from '@milkpod/env/client';
import { chatMetadataSchema } from '@milkpod/ai/schemas';
import type { MilkpodMessage } from '@milkpod/ai/types';

const SERVER_URL = clientEnv().NEXT_PUBLIC_SERVER_URL;

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
} = {}): UseChatHelpers<MilkpodMessage> & { threadId: string | undefined } {
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
