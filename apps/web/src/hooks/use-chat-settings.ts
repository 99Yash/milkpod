'use client';

import { useState, useCallback, useEffect } from 'react';
import { DEFAULT_MODEL_ID, type ModelId } from '@milkpod/ai/models';
import { DEFAULT_WORD_LIMIT } from '@milkpod/ai/limits';
import { getLocalStorageItem, setLocalStorageItem } from '~/lib/utils';

export function useChatSettings() {
  const [modelId, setModelIdState] = useState<ModelId>(DEFAULT_MODEL_ID);
  const [wordLimit, setWordLimitState] = useState<number | null>(DEFAULT_WORD_LIMIT);

  useEffect(() => {
    const storedModel = getLocalStorageItem('CHAT_MODEL_ID', DEFAULT_MODEL_ID);
    if (storedModel != null) setModelIdState(storedModel);

    const storedLimit = getLocalStorageItem('CHAT_WORD_LIMIT', DEFAULT_WORD_LIMIT);
    if (storedLimit !== undefined) setWordLimitState(storedLimit);
  }, []);

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
