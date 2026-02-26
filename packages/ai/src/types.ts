import type { InferUITools, LanguageModelUsage, UIMessage } from 'ai';
import type { QAToolSet } from './tools';
import type { RelevantSegment } from './retrieval';

// --- Chat metadata & message types ---

export type ChatMetadata = {
  threadId?: string;
  assetId?: string;
  collectionId?: string;
  durationMs?: number;
};

export type ChatDataParts = {
  status: {
    threadId: string;
    status: 'processing' | 'completed';
    usage?: LanguageModelUsage;
  };
};

export type MilkpodMessage = UIMessage<
  ChatMetadata,
  ChatDataParts,
  InferUITools<QAToolSet>
>;

// --- Tool context ---

export interface ToolContext {
  assetId?: string;
  collectionId?: string;
}

// --- Tool output types ---

export interface RetrieveSegmentsOutput {
  tool: 'retrieve';
  status: 'searching' | 'found';
  query: string;
  segments: RelevantSegment[];
  message: string;
}

export interface ContextSegment {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  speaker: string | null;
}

export interface GetTranscriptContextOutput {
  tool: 'context';
  status: 'loading' | 'loaded';
  segments: ContextSegment[];
  message: string;
}

export interface ReadTranscriptOutput {
  tool: 'read';
  status: 'loading' | 'loaded';
  totalSegments: number;
  segments: ContextSegment[];
  message: string;
}

export type ToolOutput =
  | RetrieveSegmentsOutput
  | GetTranscriptContextOutput
  | ReadTranscriptOutput;

/** Runtime type guard for tool outputs deserialized from `unknown`. */
export function isToolOutput(val: unknown): val is ToolOutput {
  if (typeof val !== 'object' || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    (obj.tool === 'retrieve' || obj.tool === 'context' || obj.tool === 'read') &&
    typeof obj.status === 'string' &&
    typeof obj.message === 'string' &&
    Array.isArray(obj.segments)
  );
}
