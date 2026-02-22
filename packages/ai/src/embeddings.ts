import { embed, embedMany } from 'ai';
import { embeddingModel, EMBEDDING_MODEL_NAME, EMBEDDING_DIMENSIONS } from './provider';

export { EMBEDDING_MODEL_NAME, EMBEDDING_DIMENSIONS };

export async function generateEmbedding(text: string): Promise<number[]> {
  const input = text.replaceAll('\n', ' ');
  const { embedding } = await embed({
    model: embeddingModel,
    value: input,
  });
  return embedding;
}

export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: texts.map((t) => t.replaceAll('\n', ' ')),
  });
  return embeddings;
}

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
