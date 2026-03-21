import { APICallError, RetryError } from 'ai';

// ---------------------------------------------------------------------------
// Internal error classes
// ---------------------------------------------------------------------------

export class AIError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(message: string, code: string, retryable = false) {
    super(message);
    this.name = 'AIError';
    this.code = code;
    this.retryable = retryable;
  }
}

export class EmbeddingError extends AIError {
  constructor(message: string, retryable = true) {
    super(message, 'EMBEDDING_ERROR', retryable);
    this.name = 'EmbeddingError';
  }
}

export class RetrievalError extends AIError {
  constructor(message: string, retryable = false) {
    super(message, 'RETRIEVAL_ERROR', retryable);
    this.name = 'RetrievalError';
  }
}

export class StreamingError extends AIError {
  constructor(message: string, retryable = true) {
    super(message, 'STREAMING_ERROR', retryable);
    this.name = 'StreamingError';
  }
}

// ---------------------------------------------------------------------------
// Provider error classification
// ---------------------------------------------------------------------------

/**
 * Provider-agnostic error category derived from the structured `data` field
 * each AI SDK provider attaches to APICallError:
 *
 *   Anthropic: { type: 'error', error: { type, message } }
 *   OpenAI:    { error: { message, type?, code? } }
 *   Google:    { error: { code?, message, status } }
 */
export type ProviderErrorType =
  | 'rate_limit'
  | 'auth'
  | 'context_length'
  | 'overloaded'
  | 'bad_request'
  | 'unknown';

export function classifyAPICallError(
  error: InstanceType<typeof APICallError>,
): ProviderErrorType {
  const status = error.statusCode;
  const data = error.data as Record<string, unknown> | undefined;
  const inner = data?.error as Record<string, unknown> | undefined;

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

const SAFE_MESSAGES: Record<ProviderErrorType, string> = {
  rate_limit: 'This model is currently unavailable due to high demand. Please try again later or switch models.',
  auth: 'This model is temporarily unavailable. Please try a different model.',
  context_length: 'Your conversation is too long for this model. Start a new thread or try a model with a larger context window.',
  overloaded: 'The AI provider is experiencing issues. Please try again shortly.',
  bad_request: 'The request could not be processed. Please try again.',
  unknown: 'Something went wrong. Please try again.',
};

/** Whether this error type suggests trying a different model would help. */
const FALLBACK_ELIGIBLE: Set<ProviderErrorType> = new Set([
  'rate_limit',
  'auth',
  'overloaded',
]);

export interface SanitizedError {
  message: string;
  type: ProviderErrorType;
  /** True when switching to a different model is likely to resolve the error. */
  suggestFallback: boolean;
}

/**
 * Classify any AI SDK error and return a safe, user-facing message.
 * Works for APICallError (direct or wrapped inside RetryError),
 * our own AIError subclasses, AbortError, and unknown errors.
 */
export function sanitizeStreamError(error: unknown): SanitizedError {
  if (error instanceof Error && error.name === 'AbortError') {
    return { message: 'Response timed out. Please try again.', type: 'overloaded', suggestFallback: true };
  }
  if (RetryError.isInstance(error) && APICallError.isInstance(error.lastError)) {
    const type = classifyAPICallError(error.lastError);
    return { message: SAFE_MESSAGES[type], type, suggestFallback: FALLBACK_ELIGIBLE.has(type) };
  }
  if (RetryError.isInstance(error)) {
    return { message: 'Unable to complete the request. Please try again.', type: 'unknown', suggestFallback: false };
  }
  if (error instanceof AIError) {
    return { message: error.message, type: 'unknown', suggestFallback: false };
  }
  if (APICallError.isInstance(error)) {
    const type = classifyAPICallError(error);
    return { message: SAFE_MESSAGES[type], type, suggestFallback: FALLBACK_ELIGIBLE.has(type) };
  }
  return { message: 'Something went wrong. Please try again.', type: 'unknown', suggestFallback: false };
}
