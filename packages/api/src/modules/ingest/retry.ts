import { toSafeErrorMessage } from './error-message';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export type RetryControl = {
  maxRetries?: number;
  shouldRetry?: (
    error: unknown,
    message: string,
    attempt: number,
  ) => boolean | Promise<boolean>;
};

function delayWithJitter(attempt: number): Promise<void> {
  const exponential = BASE_DELAY_MS * 2 ** attempt;
  const jitter = Math.random() * exponential;
  return new Promise((resolve) => setTimeout(resolve, exponential + jitter));
}

export async function withRetry<T>(
  opts: {
    stage: string;
    entityId: string;
    logPrefix: string;
    onError: (entityId: string, message: string) => Promise<void>;
  } & RetryControl,
  fn: () => Promise<T>
): Promise<T> {
  const maxRetries = opts.maxRetries ?? MAX_RETRIES;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const message = toSafeErrorMessage(error);
      await opts.onError(opts.entityId, message);
      console.error(
        `[${opts.logPrefix}] Stage "${opts.stage}" failed for ${opts.entityId} (attempt ${attempt + 1}/${maxRetries + 1}):`,
        message
      );
      if (attempt < maxRetries) {
        if (opts.shouldRetry) {
          const retryable = await opts.shouldRetry(error, message, attempt);
          if (!retryable) {
            throw error;
          }
        }

        await delayWithJitter(attempt);
      } else {
        throw error;
      }
    }
  }
  throw new Error(`Stage "${opts.stage}" exhausted retries`);
}
