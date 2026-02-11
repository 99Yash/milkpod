import type { InferUITools, UIMessage } from 'ai';
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
    usage?: unknown;
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
  status: 'loading' | 'loaded';
  segments: ContextSegment[];
  message: string;
}

export type ToolOutput = RetrieveSegmentsOutput | GetTranscriptContextOutput;
