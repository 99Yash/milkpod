const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

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
  },
  fn: () => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      await opts.onError(opts.entityId, message);
      console.error(
        `[${opts.logPrefix}] Stage "${opts.stage}" failed for ${opts.entityId} (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`,
        message
      );
      if (attempt < MAX_RETRIES) {
        await delayWithJitter(attempt);
      } else {
        throw error;
      }
    }
  }
  throw new Error(`Stage "${opts.stage}" exhausted retries`);
}
