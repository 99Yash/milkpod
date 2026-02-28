'use client';

import { useState, useCallback } from 'react';
import { DEFAULT_MODEL_ID, type ModelId } from '@milkpod/ai/models';
import { DEFAULT_WORD_LIMIT } from '@milkpod/ai/limits';
import { getLocalStorageItem, setLocalStorageItem } from '~/lib/utils';

export function useChatSettings() {
  const [modelId, setModelIdState] = useState<ModelId>(
    () => getLocalStorageItem('CHAT_MODEL_ID', DEFAULT_MODEL_ID) ?? DEFAULT_MODEL_ID,
  );

  const [wordLimit, setWordLimitState] = useState<number | null>(
    () => getLocalStorageItem('CHAT_WORD_LIMIT', DEFAULT_WORD_LIMIT) ?? DEFAULT_WORD_LIMIT,
  );

  const setModelId = useCallback((id: ModelId) => {
    setModelIdState(id);
    setLocalStorageItem('CHAT_MODEL_ID', id);
  }, []);

  const setWordLimit = useCallback((limit: number | null) => {
    setWordLimitState(limit);
    setLocalStorageItem('CHAT_WORD_LIMIT', limit);
  }, []);

  return { modelId, setModelId, wordLimit, setWordLimit };
}
