// Provider
export { chatModel, embeddingModel } from './provider';

// Embeddings
export {
  generateEmbedding,
  generateEmbeddings,
  chunkSegmentText,
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

// Streaming
export { createChatStream } from './stream';
export type { ChatRequest } from './stream';

// System prompt
export { buildSystemPrompt, QA_SYSTEM_PROMPT } from './system-prompt';
export type { SystemPromptContext } from './system-prompt';

// Schemas
export { chatMetadataSchema } from './schemas';

// Guardrails
export { checkInput, createRefusalResponse } from './guardrails';
export type { GuardrailResult } from './guardrails';

// Errors
export { AIError, EmbeddingError, RetrievalError, StreamingError } from './errors';
