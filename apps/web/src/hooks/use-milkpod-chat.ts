'use client';

import { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import { useChat, type UseChatHelpers } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { clientEnv } from '@milkpod/env/client';
import { chatMetadataSchema } from '@milkpod/ai/schemas';
import type { MilkpodMessage } from '@milkpod/ai/types';
import type { ModelId } from '@milkpod/ai/models';
import type { PlanId } from '@milkpod/ai/plans';
import { handleUpgradeError } from '~/lib/upgrade-prompt';
import { setCachedPlan } from '~/lib/plan-cache';

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
  modelId?: ModelId;
  wordLimit?: number | null;
  initialMessages?: MilkpodMessage[];
} = {}): UseChatHelpers<MilkpodMessage> & {
  threadId: string | undefined;
  wordsRemaining: number | null;
  plan: PlanId | null;
} {
  const threadIdRef = useRef<string | undefined>(threadId);
  const [wordsRemaining, setWordsRemaining] = useState<number | null>(null);
  const [plan, setPlan] = useState<PlanId | null>(null);

  // useChat stores the Chat object (and its transport) in a ref that is NOT
  // recreated when the transport prop changes — only when `id` changes.
  // This means the body function baked into the initial transport would
  // permanently close over the initial modelId/wordLimit values.
  // Using refs ensures the body function always reads the latest values.
  const modelIdRef = useRef(modelId);
  modelIdRef.current = modelId;
  const wordLimitRef = useRef(wordLimit);
  wordLimitRef.current = wordLimit;

  useEffect(() => {
    threadIdRef.current = threadId;
  }, [threadId]);

  const customFetch: typeof globalThis.fetch = useCallback(
    async (input, init) => {
      const response = await globalThis.fetch(input, init);

      // Intercept 402 upgrade-required errors before useChat processes them
      if (response.status === 402) {
        try {
          const body = await response.clone().json();
          handleUpgradeError({ status: 402, value: body });
        } catch {
          handleUpgradeError({ status: 402, value: undefined });
        }
      }

      const id = response.headers.get('X-Thread-Id');
      if (id) {
        threadIdRef.current = id;
      }
      const planHeader = response.headers.get('X-Plan') as PlanId | null;
      if (planHeader) {
        setPlan(planHeader);
        setCachedPlan(planHeader);
      }
      const isAdmin = response.headers.get('X-Is-Admin') === 'true';
      if (isAdmin) {
        setWordsRemaining(null);
      } else {
        const remaining = response.headers.get('X-Words-Remaining');
        if (remaining !== null) {
          const parsed = Number(remaining);
          setWordsRemaining(Number.isFinite(parsed) ? parsed : null);
        }
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
      modelId: modelIdRef.current,
      wordLimit: wordLimitRef.current,
    }),
    [assetId, collectionId],
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
    plan,
  };
}
