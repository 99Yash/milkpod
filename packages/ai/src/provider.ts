import { createGoogleGenerativeAI, google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import type { EmbeddingModel, JSONValue, LanguageModel } from 'ai';

export const chatModel: LanguageModel = openai('gpt-5.4-mini');

// ---------------------------------------------------------------------------
// Google provider — Cloudflare AI Gateway (Unified Billing) when configured,
// direct Google AI Studio otherwise.
//
// When CF_AI_GATEWAY_ACCOUNT_ID + CF_AI_GATEWAY_ID + CF_AI_GATEWAY_TOKEN are
// all set, every Gemini call (chat, visual, embeddings) routes via
// gateway.ai.cloudflare.com with `cf-aig-authorization`, so no provider key
// is billed. Otherwise the SDK default reads GOOGLE_GENERATIVE_AI_API_KEY
// (local dev path). Same validated shape as alfred's gateway transport.
// ---------------------------------------------------------------------------

function gatewayGoogleProvider() {
  const accountId = process.env.CF_AI_GATEWAY_ACCOUNT_ID;
  const gatewayId = process.env.CF_AI_GATEWAY_ID;
  const token = process.env.CF_AI_GATEWAY_TOKEN;
  if (!accountId || !gatewayId || !token) return undefined;
  return createGoogleGenerativeAI({
    // Dummy for the SDK's key check — gateway auth rides cf-aig-authorization
    // (Google's native x-goog-api-key header is left untouched, as validated).
    apiKey: token,
    baseURL: `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/google-ai-studio/v1beta`,
    headers: { 'cf-aig-authorization': `Bearer ${token}` },
  });
}

/** Google provider for all Gemini usage (chat, visual, embeddings). */
export const googleProvider = gatewayGoogleProvider() ?? google;

/** Cheap, fast model used for lightweight tasks like title generation. */
export const fastModel: LanguageModel = googleProvider('gemini-2.5-flash-lite');

/** Gemini 2.5 Flash for visual context extraction (video understanding). */
export const visualModel: LanguageModel = googleProvider('gemini-2.5-flash');

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
    model: googleProvider.embeddingModel('gemini-embedding-001'),
    dimensions: EMBEDDING_DIMENSIONS,
    providerOptions: {
      google: { outputDimensionality: EMBEDDING_DIMENSIONS },
    },
  },
];
