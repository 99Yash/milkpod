'use client';

import { useRef, useCallback } from 'react';
import { useChat, type UseChatHelpers } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { clientEnv } from '@milkpod/env/client';
import { chatMetadataSchema } from '@milkpod/ai/schemas';
import type { MilkpodMessage } from '@milkpod/ai/types';

const SERVER_URL = clientEnv().NEXT_PUBLIC_SERVER_URL;

export function useSharedChat({ token }: { token: string }): UseChatHelpers<MilkpodMessage> & { rateLimitRemaining: number | null } {
  const rateLimitRef = useRef<number | null>(null);

  const customFetch: typeof globalThis.fetch = useCallback(
    async (input, init) => {
      const response = await globalThis.fetch(input, init);
      const remaining = response.headers.get('X-RateLimit-Remaining');
      if (remaining !== null) {
        rateLimitRef.current = Number(remaining);
      }
      return response;
    },
    []
  );

  const chat = useChat<MilkpodMessage>({
    messageMetadataSchema: chatMetadataSchema,
    transport: new DefaultChatTransport({
      api: `${SERVER_URL}/api/shares/chat/${token}`,
      fetch: customFetch,
    }),
  });

  return {
    ...chat,
    rateLimitRemaining: rateLimitRef.current,
  };
}
