import { embed, embedMany } from 'ai';
import { embeddingModel } from './provider';

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

export function chunkSegmentText(text: string, maxLen = 500): string[] {
  if (text.length <= maxLen) return [text];

  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxLen && current.length > 0) {
      chunks.push(current.trim());
      current = '';
    }
    current += sentence;
  }

  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  return chunks;
}
