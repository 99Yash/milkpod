import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import type { EmbeddingModel, JSONValue, LanguageModel } from 'ai';

export const chatModel: LanguageModel = openai('gpt-5.4-mini');

/** Cheap, fast model used for lightweight tasks like title generation. */
export const fastModel: LanguageModel = google('gemini-2.5-flash-lite');

/** Gemini 2.5 Flash for visual context extraction (video understanding). */
export const visualModel: LanguageModel = google('gemini-2.5-flash');

// ---------------------------------------------------------------------------
// Embedding providers — tried in order during generation. All must produce
// vectors with EMBEDDING_DIMENSIONS so they fit the same pgvector column.
// ---------------------------------------------------------------------------

export const EMBEDDING_DIMENSIONS = 1536;

export interface EmbeddingProvider {
  /** Stored in the `model` column of embedding tables. */
  id: string;
  model: EmbeddingModel;
  dimensions: number;
  /** Provider-specific options forwarded to `embed` / `embedMany`. */
  providerOptions?: Record<string, { [key: string]: JSONValue | undefined }>;
}

export const EMBEDDING_PROVIDERS: readonly EmbeddingProvider[] = [
  {
    id: 'text-embedding-3-small',
    model: openai.embeddingModel('text-embedding-3-small'),
    dimensions: EMBEDDING_DIMENSIONS,
  },
  {
    id: 'gemini-embedding-001',
    model: google.embeddingModel('gemini-embedding-001'),
    dimensions: EMBEDDING_DIMENSIONS,
    providerOptions: {
      google: { outputDimensionality: EMBEDDING_DIMENSIONS },
    },
  },
];
