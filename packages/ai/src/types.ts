import type { InferUITools, UIMessage } from 'ai';
import type { QAToolSet } from './tools';

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
