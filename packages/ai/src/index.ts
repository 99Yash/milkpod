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
export type { ToolContext, RetrieveResult, ContextResult, QAToolSet } from './tools';

// Types
export type { ChatMetadata, ChatDataParts, MilkpodMessage } from './types';

// Streaming
export { createChatStream } from './stream';
export type { ChatRequest } from './stream';

// System prompt
export { QA_SYSTEM_PROMPT } from './system-prompt';

// Schemas
export { chatMetadataSchema } from './schemas';

// Errors
export { AIError, EmbeddingError, RetrievalError, StreamingError } from './errors';
