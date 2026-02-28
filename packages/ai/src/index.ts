// Provider
export { chatModel, embeddingModel } from './provider';

// Embeddings
export {
  generateEmbedding,
  generateEmbeddings,
  chunkSegmentText,
  chunkTranscript,
  EMBEDDING_MODEL_NAME,
  EMBEDDING_DIMENSIONS,
} from './embeddings';

// Retrieval
export { findRelevantSegments, getTranscriptContext } from './retrieval';
export type { RelevantSegment, RetrievalOptions } from './retrieval';

// Tools
export { createQAToolSet } from './tools';
export type { QAToolSet } from './tools';

// Types
export type {
  ChatMetadata,
  ChatDataParts,
  MilkpodMessage,
  ToolContext,
  RetrieveSegmentsOutput,
  GetTranscriptContextOutput,
  ContextSegment,
  ToolOutput,
} from './types';
export { isToolOutput } from './types';

// Title generation
export { generateThreadTitle } from './title';

// Streaming
export { createChatStream } from './stream';
export type { ChatRequest } from './stream';

// System prompt
export { buildSystemPrompt } from './system-prompt';
export type { SystemPromptContext } from './system-prompt';

// Schemas
export { chatMetadataSchema } from './schemas';

// Guardrails
export { checkInput, createRefusalResponse } from './guardrails';
export type { GuardrailResult } from './guardrails';

// Models
export { MODEL_REGISTRY, DEFAULT_MODEL_ID, VALID_MODEL_IDS, modelIdSchema } from './models';
export type { ModelDescriptor, ModelId } from './models';

// Limits
export {
  WORD_LIMIT_OPTIONS,
  DEFAULT_WORD_LIMIT,
  HARD_WORD_CAP,
  DAILY_WORD_BUDGET,
  wordLimitToMaxTokens,
} from './limits';
export type { WordLimitOption } from './limits';

// Errors
export { AIError, EmbeddingError, RetrievalError, StreamingError } from './errors';
