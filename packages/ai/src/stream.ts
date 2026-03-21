import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  validateUIMessages,
  RetryError,
  APICallError,
  generateId,
} from 'ai';
import type { LanguageModel } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
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
    case 'anthropic':
      return anthropic(model);
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
  assetTitle?: string;
  collectionId?: string;
  modelId?: ModelId;
  wordLimit?: number | null;
  transcriptLanguage?: string | null;
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

/**
 * Map provider API errors to safe, user-facing messages.
 * Raw provider responses can leak workspace IDs, quota details,
 * rate-limit windows, API endpoints, and other internal state.
 */
/**
 * Extract a provider-agnostic error type from the structured data that each
 * AI SDK provider attaches to APICallError.data.
 *
 * Anthropic: { type: 'error', error: { type, message } }
 * OpenAI:    { error: { message, type?, code? } }
 * Google:    { error: { code?, message, status } }
 */
type ErrorType = 'rate_limit' | 'auth' | 'context_length' | 'overloaded' | 'bad_request' | 'unknown';

function classifyAPICallError(error: InstanceType<typeof APICallError>): ErrorType {
  const status = error.statusCode;
  const data = error.data as Record<string, unknown> | undefined;
  const inner = data?.error as Record<string, unknown> | undefined;

  // --- Structured type from provider error schemas ---
  const errorType = (inner?.type as string | undefined)?.toLowerCase();
  const errorCode = String(inner?.code ?? '').toLowerCase();
  const errorStatus = (inner?.status as string | undefined)?.toUpperCase();

  // Rate-limit / quota (429 or provider-level type)
  if (status === 429) return 'rate_limit';
  if (errorType === 'rate_limit_error') return 'rate_limit';
  if (errorCode === 'rate_limit_exceeded') return 'rate_limit';
  if (errorStatus === 'RESOURCE_EXHAUSTED') return 'rate_limit';

  // Anthropic misclassifies workspace quota exhaustion as
  // invalid_request_error with a 400. Detect via the structured message
  // rather than the type field — this is their bad API design, not ours.
  if (errorType === 'invalid_request_error') {
    const innerMsg = (inner?.message as string | undefined)?.toLowerCase() ?? '';
    if (innerMsg.includes('usage limit') || innerMsg.includes('regain access')) {
      return 'rate_limit';
    }
  }

  // Auth
  if (status === 401 || status === 403) return 'auth';
  if (errorType === 'authentication_error' || errorType === 'permission_error') return 'auth';
  if (errorCode === 'invalid_api_key') return 'auth';
  if (errorStatus === 'UNAUTHENTICATED' || errorStatus === 'PERMISSION_DENIED') return 'auth';

  // Overloaded / outage
  if (status === 529 || status === 503 || status === 502 || status === 500) return 'overloaded';
  if (errorType === 'overloaded_error' || errorType === 'api_error') return 'overloaded';
  if (errorStatus === 'UNAVAILABLE' || errorStatus === 'INTERNAL') return 'overloaded';

  // Context length (subset of invalid_request / bad request)
  if (errorType === 'invalid_request_error' || status === 400 || status === 413) {
    const msg = error.message?.toLowerCase() ?? '';
    if (msg.includes('context length') || msg.includes('too many tokens') || msg.includes('max tokens')) {
      return 'context_length';
    }
    return 'bad_request';
  }

  return 'unknown';
}

const SAFE_ERROR_MESSAGES: Record<ErrorType, string> = {
  rate_limit: 'This model is currently unavailable due to high demand. Please try again later or switch models.',
  auth: 'This model is temporarily unavailable. Please try a different model.',
  context_length: 'Your conversation is too long for this model. Start a new thread or try a model with a larger context window.',
  overloaded: 'The AI provider is experiencing issues. Please try again shortly.',
  bad_request: 'The request could not be processed. Please try again.',
  unknown: 'Something went wrong. Please try again.',
};

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

  const formatStreamError = (error: unknown): string => {
    if (error instanceof Error && error.name === 'AbortError') {
      return 'Response timed out. Please try again.';
    }
    if (RetryError.isInstance(error)) {
      // The underlying cause is usually an APICallError — surface a
      // status-aware message instead of a generic "unable to complete".
      if (APICallError.isInstance(error.lastError)) {
        return SAFE_ERROR_MESSAGES[classifyAPICallError(error.lastError)];
      }
      return 'Unable to complete the request. Please try again.';
    }
    // Our own errors have pre-sanitized messages — pass through.
    if (error instanceof AIError) {
      return error.message;
    }
    if (APICallError.isInstance(error)) {
      return SAFE_ERROR_MESSAGES[classifyAPICallError(error)];
    }
    return 'Something went wrong. Please try again.';
  };

  const result = streamText({
    model,
    system: buildSystemPrompt({
      assetId: req.assetId,
      assetTitle: req.assetTitle,
      collectionId: req.collectionId,
      wordLimit: effectiveWordLimit,
      transcriptLanguage: req.transcriptLanguage,
    }),
    messages: modelMessages,
    tools,
    maxOutputTokens: wordLimitToMaxTokens(effectiveWordLimit),
    stopWhen: [stepCountIs(5)],
    timeout: { totalMs: 120_000, chunkMs: 30_000 },
    onError: ({ error }) => {
      if (APICallError.isInstance(error)) {
        console.error('[AI Stream Error]', error.statusCode, error.message);
      } else {
        console.error('[AI Stream Error]', error instanceof Error ? error.message : 'Unknown error');
      }
    },
    onFinish: async ({ steps, text, finishReason }) => {
      if (!req.onFinish) return;
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      const responseMessage = buildResponseMessage(steps);
      responseMessage.metadata = {
        threadId: req.threadId,
        assetId: req.assetId,
        collectionId: req.collectionId,
        durationMs: Date.now() - startTime,
        finishReason,
      };
      await req.onFinish({ responseMessage, wordCount });
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
        finishReason: part.finishReason,
      };
    },
    onError: formatStreamError,
  });
}
