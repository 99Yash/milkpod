import { embed, embedMany } from 'ai';
import { EMBEDDING_PROVIDERS, EMBEDDING_DIMENSIONS } from './provider';
import type { EmbeddingProvider } from './provider';
import { EmbeddingError } from './errors';

export { EMBEDDING_DIMENSIONS };

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface EmbeddingResult {
  embedding: number[];
  /** The provider id that produced this embedding (stored in the `model` column). */
  model: string;
}

export interface BatchEmbeddingResult {
  embeddings: number[][];
  /** The provider id that produced these embeddings. */
  model: string;
}

// ---------------------------------------------------------------------------
// Fallback helpers
// ---------------------------------------------------------------------------

function normalise(text: string): string {
  return text.replaceAll('\n', ' ');
}

/**
 * Try each provider in `EMBEDDING_PROVIDERS` order.
 * On transient failure the next provider is attempted; the last provider's
 * error is re-thrown so upstream retry logic (e.g. `withRetry`) still works.
 */
async function withFallback<T>(
  fn: (provider: EmbeddingProvider) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (const provider of EMBEDDING_PROVIDERS) {
    try {
      return await fn(provider);
    } catch (err) {
      lastError = err;
      const isLast = provider === EMBEDDING_PROVIDERS[EMBEDDING_PROVIDERS.length - 1];
      if (isLast) break;
      console.warn(
        `[embedding] ${provider.id} failed, falling back to next provider:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Public API — generation with automatic fallback
// ---------------------------------------------------------------------------

/** Embed a single text, trying providers in priority order. */
export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  const input = normalise(text);
  return withFallback(async (provider) => {
    const { embedding } = await embed({
      model: provider.model,
      value: input,
      providerOptions: provider.providerOptions,
    });
    return { embedding, model: provider.id };
  });
}

/** Embed multiple texts in one call, trying providers in priority order. */
export async function generateEmbeddings(texts: string[]): Promise<BatchEmbeddingResult> {
  const values = texts.map(normalise);
  return withFallback(async (provider) => {
    const { embeddings } = await embedMany({
      model: provider.model,
      values,
      providerOptions: provider.providerOptions,
    });
    return { embeddings, model: provider.id };
  });
}

// ---------------------------------------------------------------------------
// Targeted API — query-time model matching
// ---------------------------------------------------------------------------

/**
 * Generate an embedding with a specific provider (identified by model id).
 * Used at query time to match the model that produced the stored embeddings.
 */
export async function generateEmbeddingWith(
  modelId: string,
  text: string,
): Promise<number[]> {
  const provider = EMBEDDING_PROVIDERS.find((p) => p.id === modelId);
  if (!provider) {
    throw new EmbeddingError(`Unknown embedding model: ${modelId}`, false);
  }

  const { embedding } = await embed({
    model: provider.model,
    value: normalise(text),
    providerOptions: provider.providerOptions,
  });
  return embedding;
}

// ---------------------------------------------------------------------------
// Text chunking (unchanged)
// ---------------------------------------------------------------------------

const DEFAULT_SEPARATORS = [
  '\n\n',
  '\n',
  // Punctuation with trailing space (ideal boundaries)
  '. ', '! ', '? ', ': ', '; ', ', ',
  // Punctuation without trailing space (common in auto-captions)
  '.', '!', '?', ':', ';', ',',
  ' ',
  '',
];

export function chunkSegmentText(
  text: string,
  maxLen = 2800,
  overlap = 200,
  separators = DEFAULT_SEPARATORS
): string[] {
  if (text.length <= maxLen) return [text];

  // The default separators list ends with '' which always matches,
  // so this find() is guaranteed to return a result.
  const sep = separators.find((s) =>
    s === '' ? true : text.includes(s)
  ) ?? '';
  const remaining = separators.slice(separators.indexOf(sep) + 1);

  const splits = sep === ''
    ? [...text]
    : text.split(sep).flatMap((part, i, arr) =>
        // re-attach the separator to the end of each part (except the last)
        i < arr.length - 1 ? [part + sep] : [part]
      );

  const chunks: string[] = [];
  let current = '';

  for (const piece of splits) {
    if (current.length + piece.length > maxLen && current.length > 0) {
      // If the accumulated chunk is still too long, recurse with finer separators
      if (current.length > maxLen && remaining.length > 0) {
        chunks.push(...chunkSegmentText(current.trim(), maxLen, overlap, remaining));
      } else {
        chunks.push(current.trim());
      }
      // Apply overlap: carry trailing text from previous chunk
      if (overlap > 0 && current.length > overlap) {
        current = current.slice(-overlap);
      } else {
        current = '';
      }
    }
    current += piece;
  }

  if (current.trim().length > 0) {
    if (current.length > maxLen && remaining.length > 0) {
      chunks.push(...chunkSegmentText(current.trim(), maxLen, overlap, remaining));
    } else {
      chunks.push(current.trim());
    }
  }

  return chunks;
}

/**
 * Concatenates all segment texts into a full transcript, runs recursive
 * character splitting on the result, then maps each chunk back to the
 * segment it starts in (for the segmentId FK).
 */
export function chunkTranscript(
  segments: { id: string; text: string }[]
): { content: string; segmentId: string }[] {
  if (segments.length === 0) return [];

  const fullText = segments.map((s) => s.text).join('\n');

  // Build offset-to-segment lookup
  const segOffsets: { offset: number; id: string }[] = [];
  let offset = 0;
  for (const seg of segments) {
    segOffsets.push({ offset, id: seg.id });
    offset += seg.text.length + 1; // +1 for \n separator
  }

  const chunks = chunkSegmentText(fullText);

  // Map each chunk back to the segment whose offset range contains its position
  const result: { content: string; segmentId: string }[] = [];
  let searchFrom = 0;

  for (const chunk of chunks) {
    const pos = fullText.indexOf(chunk, searchFrom);
    const charPos = pos >= 0 ? pos : 0;

    const first = segOffsets[0];
    if (!first) throw new Error('Invariant: segOffsets is empty');
    let segId = first.id;
    for (const so of segOffsets) {
      if (so.offset <= charPos) segId = so.id;
      else break;
    }

    result.push({ content: chunk, segmentId: segId });
    if (pos >= 0) searchFrom = pos + 1;
  }

  return result;
}
