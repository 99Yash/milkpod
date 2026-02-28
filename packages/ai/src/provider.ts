import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import type { EmbeddingModel, LanguageModel } from 'ai';

export const chatModel: LanguageModel = openai('gpt-5.2');

/** Cheap, fast model used for lightweight tasks like title generation. */
export const fastModel: LanguageModel = google('gemini-2.5-flash-lite');

export const EMBEDDING_MODEL_NAME = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;

export const embeddingModel: EmbeddingModel =
  openai.embeddingModel(EMBEDDING_MODEL_NAME);
