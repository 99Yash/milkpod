import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import type { UIMessage } from 'ai';
import type { MilkpodMessage } from './types';
import { chatModel } from './provider';
import { createQAToolSet } from './tools';
import { QA_SYSTEM_PROMPT } from './system-prompt';

export interface ChatRequest {
  messages: MilkpodMessage[];
  threadId?: string;
  assetId?: string;
  collectionId?: string;
  onFinish?: (params: { messages: UIMessage[] }) => Promise<void>;
  headers?: Record<string, string>;
}

export async function createChatStream(req: ChatRequest): Promise<Response> {
  const modelMessages = await convertToModelMessages(req.messages);

  const result = streamText({
    model: chatModel,
    system: QA_SYSTEM_PROMPT,
    messages: modelMessages,
    tools: createQAToolSet({
      assetId: req.assetId,
      collectionId: req.collectionId,
    }),
    stopWhen: stepCountIs(5),
    onError: (error) => {
      console.error('[AI Stream Error]', error);
    },
  });

  return result.toUIMessageStreamResponse({
    headers: req.headers,
    sendReasoning: true,
    originalMessages: req.messages,
    onFinish: req.onFinish,
    onError: (error) =>
      error instanceof Error ? error.message : 'An error occurred.',
  });
}
