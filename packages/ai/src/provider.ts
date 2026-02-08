import { openai } from '@ai-sdk/openai';
import type { LanguageModel, EmbeddingModel } from 'ai';

export const chatModel: LanguageModel = openai('gpt-4o');
export const embeddingModel: EmbeddingModel<string> = openai.textEmbeddingModel(
  'text-embedding-3-small'
);
