'use client';

import { useState, useCallback } from 'react';
import { getLocalStorageItem, setLocalStorageItem } from '~/lib/utils';

export function useChatSettings() {
  const [modelId, setModelIdState] = useState<string>(
    () => getLocalStorageItem('CHAT_MODEL_ID', 'openai:gpt-5.2') ?? 'openai:gpt-5.2',
  );

  const [wordLimit, setWordLimitState] = useState<number | null>(
    () => getLocalStorageItem('CHAT_WORD_LIMIT', 250) ?? 250,
  );

  const setModelId = useCallback((id: string) => {
    setModelIdState(id);
    setLocalStorageItem('CHAT_MODEL_ID', id);
  }, []);

  const setWordLimit = useCallback((limit: number | null) => {
    setWordLimitState(limit);
    setLocalStorageItem('CHAT_WORD_LIMIT', limit);
  }, []);

  return { modelId, setModelId, wordLimit, setWordLimit };
}
