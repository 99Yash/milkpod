'use client';

import { useRef, useCallback, useEffect, useMemo, useState } from 'react';
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
  modelId,
  wordLimit,
  initialMessages,
}: {
  threadId?: string;
  assetId?: string;
  collectionId?: string;
  modelId?: string;
  wordLimit?: number | null;
  initialMessages?: MilkpodMessage[];
} = {}): UseChatHelpers<MilkpodMessage> & {
  threadId: string | undefined;
  wordsRemaining: number | null;
} {
  const threadIdRef = useRef<string | undefined>(threadId);
  const [wordsRemaining, setWordsRemaining] = useState<number | null>(null);

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
      const remaining = response.headers.get('X-Words-Remaining');
      if (remaining !== null) {
        setWordsRemaining(Number(remaining));
      }
      return response;
    },
    [],
  );

  const body = useCallback(
    () => ({
      threadId: threadIdRef.current,
      assetId,
      collectionId,
      modelId,
      wordLimit,
    }),
    [assetId, collectionId, modelId, wordLimit],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${SERVER_URL}/api/chat`,
        credentials: 'include',
        fetch: customFetch,
        body,
      }),
    [customFetch, body],
  );

  const chat = useChat<MilkpodMessage>({
    ...(threadId != null && { id: threadId }),
    messages: initialMessages,
    messageMetadataSchema: chatMetadataSchema,
    transport,
  });

  return {
    ...chat,
    threadId: threadIdRef.current,
    wordsRemaining,
  };
}
