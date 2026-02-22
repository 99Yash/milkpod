import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  validateUIMessages,
  RetryError,
} from 'ai';
import type { MilkpodMessage } from './types';
import { chatModel } from './provider';
import { createQAToolSet } from './tools';
import { QA_SYSTEM_PROMPT } from './system-prompt';
import { chatMetadataSchema } from './schemas';
import { AIError } from './errors';

export interface ChatRequest {
  messages: MilkpodMessage[];
  threadId?: string;
  assetId?: string;
  collectionId?: string;
  onFinish?: (params: { messages: MilkpodMessage[] }) => Promise<void>;
  headers?: Record<string, string>;
}

export async function createChatStream(req: ChatRequest): Promise<Response> {
  const tools = createQAToolSet({
    assetId: req.assetId,
    collectionId: req.collectionId,
  });
  let validatedMessages: MilkpodMessage[];

  try {
    validatedMessages = await validateUIMessages<MilkpodMessage>({
      messages: req.messages,
      metadataSchema: chatMetadataSchema,
      tools,
    });
  } catch (error) {
    console.error('[AI Stream Error]', error);
    return new Response('Invalid messages', { status: 400 });
  }

  const modelMessages = await convertToModelMessages(validatedMessages);
  const startTime = Date.now();

  const result = streamText({
    model: chatModel,
    system: QA_SYSTEM_PROMPT,
    messages: modelMessages,
    tools,
    stopWhen: [stepCountIs(5)],
    onError: (error) => {
      console.error('[AI Stream Error]', error);
    },
  });

  return result.toUIMessageStreamResponse<MilkpodMessage>({
    headers: req.headers,
    originalMessages: validatedMessages,
    onFinish: req.onFinish,
    messageMetadata: ({ part }) => {
      if (part.type !== 'finish') return undefined;

      return {
        threadId: req.threadId,
        assetId: req.assetId,
        collectionId: req.collectionId,
        durationMs: Date.now() - startTime,
      };
    },
    onError: (error) =>
      RetryError.isInstance(error)
        ? 'Unable to complete the request. Please try again.'
        : error instanceof AIError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'An error occurred.',
  });
}
