import type { UIMessage } from 'ai';

export type ChatMetadata = {
  threadId?: string;
  assetId?: string;
  collectionId?: string;
};

export type ChatDataParts = {
  status: {
    threadId: string;
    status: 'processing' | 'completed';
    usage?: unknown;
  };
};

export type MilkpodMessage = UIMessage<ChatMetadata, ChatDataParts>;
