import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  validateUIMessages,
  RetryError,
  generateId,
} from 'ai';
import type { LanguageModel } from 'ai';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import type { MilkpodMessage } from './types';
import { createQAToolSet } from './tools';
import { buildSystemPrompt } from './system-prompt';
import { chatMetadataSchema } from './schemas';
import { AIError } from './errors';
import { checkInput, createRefusalResponse } from './guardrails';
import { DEFAULT_MODEL_ID, modelIdSchema, type ModelId } from './models';
import { HARD_WORD_CAP, wordLimitToMaxTokens } from './limits';

function resolveModel(id: ModelId): LanguageModel {
  const sep = id.indexOf(':');
  const provider = id.slice(0, sep);
  const model = id.slice(sep + 1);

  switch (provider) {
    case 'openai':
      return openai(model);
    case 'google':
      return google(model);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

type MessagePart = MilkpodMessage['parts'][number];

export interface ChatRequest {
  messages: MilkpodMessage[];
  threadId?: string;
  assetId?: string;
  collectionId?: string;
  modelId?: ModelId;
  wordLimit?: number | null;
  onFinish?: (params: { responseMessage: MilkpodMessage; wordCount: number }) => Promise<void>;
  headers?: Record<string, string>;
}

/**
 * Reconstruct a persistable UIMessage from streamText step results.
 *
 * toUIMessageStreamResponse's onFinish relies on the client fully consuming
 * the stream (TransformStream flush), which doesn't fire reliably with
 * @elysiajs/node. streamText's onFinish fires server-side regardless.
 */
type StepContent = {
  type: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
};

function buildResponseMessage(steps: readonly { content: readonly StepContent[] }[]): MilkpodMessage {
  const parts: MessagePart[] = [];

  for (const step of steps) {
    parts.push({ type: 'step-start' } as MessagePart);

    for (const content of step.content) {
      if (content.type === 'text' && content.text) {
        parts.push({ type: 'text', text: content.text } as MessagePart);
      } else if (content.type === 'reasoning') {
        parts.push({ type: 'reasoning', text: content.text } as MessagePart);
      } else if (content.type === 'tool-call') {
        const toolResult = step.content.find(
          (c) => c.type === 'tool-result' && 'toolCallId' in c && c.toolCallId === content.toolCallId,
        );
        // Type assertion required: building a static tool UI part from model-level
        // content. The discriminated union can't be satisfied from a dynamic `type`.
        parts.push({
          type: `tool-${content.toolName}`,
          toolCallId: content.toolCallId,
          toolName: content.toolName,
          state: 'output-available',
          input: content.input,
          output: toolResult && 'output' in toolResult ? toolResult.output : undefined,
        } as unknown as MessagePart);
      }
    }
  }

  return { id: generateId(), role: 'assistant', parts };
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
      metadataSchema: chatMetadataSchema.optional(),
      tools,
    });
  } catch (error) {
    console.error('[AI Stream Error]', error);
    return new Response('Invalid messages', { status: 400 });
  }

  const guardrailResult = await checkInput(validatedMessages);
  if (!guardrailResult.allowed) {
    return createRefusalResponse(validatedMessages, req.headers);
  }

  const modelMessages = await convertToModelMessages(validatedMessages);
  const startTime = Date.now();
  const parsedModelId = modelIdSchema.parse(req.modelId ?? DEFAULT_MODEL_ID);
  const model = resolveModel(parsedModelId);
  const effectiveWordLimit =
    req.wordLimit != null
      ? Math.max(1, Math.min(req.wordLimit, HARD_WORD_CAP))
      : HARD_WORD_CAP;

  const result = streamText({
    model,
    system: buildSystemPrompt({
      assetId: req.assetId,
      collectionId: req.collectionId,
      wordLimit: effectiveWordLimit,
    }),
    messages: modelMessages,
    tools,
    maxOutputTokens: wordLimitToMaxTokens(effectiveWordLimit),
    stopWhen: [stepCountIs(5)],
    onError: (error) => {
      console.error('[AI Stream Error]', error);
    },
    onFinish: async ({ steps, text }) => {
      if (!req.onFinish) return;
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      await req.onFinish({ responseMessage: buildResponseMessage(steps), wordCount });
    },
  });

  return result.toUIMessageStreamResponse<MilkpodMessage>({
    headers: req.headers,
    sendReasoning: true,
    originalMessages: validatedMessages,
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
