import { generateText, Output } from 'ai';
import { z } from 'zod';
import { visualModel } from '@milkpod/ai/provider';
import {
  generateEmbeddings,
  EMBEDDING_MODEL_NAME,
  EMBEDDING_DIMENSIONS,
} from '@milkpod/ai/embeddings';
import { withRetry } from './retry';
import { IngestService } from './service';
import { QuotaService } from '../quota/service';

const MAX_SEGMENTS_PER_ASSET = 50;
const EMBED_BATCH = 64;

const visualSegmentSchema = z.object({
  startTime: z.number().describe('Start time in seconds'),
  endTime: z.number().describe('End time in seconds'),
  summary: z.string().describe('Concise visual summary of what appears on screen'),
  ocrText: z.string().optional().describe('Any text visible on screen (OCR)'),
  entities: z.array(z.string()).optional().describe('Notable visual entities (people, products, UI elements, diagrams)'),
  confidence: z.number().min(0).max(1).describe('Confidence that this segment has meaningful visual content (0-1)'),
});

export type VisualSegment = z.infer<typeof visualSegmentSchema>;

function buildExtractionPrompt(duration: number): string {
  const maxSegments = Math.min(MAX_SEGMENTS_PER_ASSET, Math.ceil(duration / 20));
  return `You are a visual context extractor for video analysis. Analyze the video and identify visually meaningful segments.

For each segment where the visual content changes meaningfully (new slide, diagram, code, demo, scene change):
1. Record the start and end time (target 20-45 second windows)
2. Summarize what is visually shown on screen
3. Extract any on-screen text (OCR)
4. List key visual entities (people, products, UI elements, diagrams, code)
5. Rate your confidence that this segment has meaningful visual content (0-1)

Rules:
- Focus on visually meaningful changes — skip static talking-head segments with no visual aids
- Target 20-45 second segment windows
- Return at most ${maxSegments} segments
- OCR text should capture slides, code, URLs, or any readable text on screen
- Entities should be specific and descriptive
- Higher confidence for segments with slides, code, diagrams, or demos; lower for talking head only`;
}

/** Compose a single text block from visual segment fields (used for embeddings and prompt context). */
export function formatVisualContextText(segment: {
  summary: string;
  ocrText?: string | null;
  entities?: string[] | null;
}): string {
  const parts = [segment.summary];
  if (segment.ocrText) parts.push(`[On-Screen Text] ${segment.ocrText}`);
  if (segment.entities?.length) parts.push(`[Entities] ${segment.entities.join(', ')}`);
  return parts.join('\n');
}

/**
 * Extract visual context from a video via Gemini, store segments and embeddings.
 * Designed to run non-blocking after transcript pipeline completes.
 * Failures are logged but do not affect asset readiness (FR9).
 */
export async function extractVideoContext(
  assetId: string,
  sourceUrl: string,
  userId: string,
  duration: number,
): Promise<void> {
  const retry = <T>(stage: string, fn: () => Promise<T>) =>
    withRetry(
      {
        stage,
        entityId: assetId,
        logPrefix: 'ingest:visual',
        onError: async (_id, msg) => {
          await IngestService.incrementVisualAttempts(assetId, msg);
        },
      },
      fn
    );

  console.log(`[ingest] Starting visual context extraction for asset ${assetId}`);
  await IngestService.updateVisualStatus(assetId, 'processing');

  try {
  // 1. Extract visual segments via Gemini
  const segments = await retry('visual-extraction', async () => {
    const result = await generateText({
      model: visualModel,
      system: buildExtractionPrompt(duration),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: new URL(sourceUrl),
              mediaType: 'video/mp4',
            },
            {
              type: 'text',
              text: 'Analyze this video and extract timestamped visual context segments.',
            },
          ],
        },
      ],
      output: Output.array({
        element: visualSegmentSchema,
        name: 'visual_segments',
        description: 'Timestamped visual context segments from the video',
      }),
      maxOutputTokens: 4096,
    });

    return result.output ?? [];
  });

  if (segments.length === 0) {
    console.log(`[ingest] No visual segments found for asset ${assetId}`);
    await IngestService.updateVisualStatus(assetId, 'completed');
    return;
  }

  // Clamp and validate segments
  const validSegments = segments
    .filter((s) => s.endTime > s.startTime && s.summary.length > 0)
    .map((s) => ({
      ...s,
      startTime: Math.max(0, s.startTime),
      endTime: Math.min(duration, s.endTime),
      confidence: Math.max(0, Math.min(1, s.confidence)),
    }))
    .slice(0, MAX_SEGMENTS_PER_ASSET);

  console.log(`[ingest] Extracted ${validSegments.length} visual segments for asset ${assetId}`);

  // 2. Store visual segments
  const storedSegments = await IngestService.storeVideoContextSegments(
    assetId,
    validSegments,
  );

  // 3. Generate and store embeddings for visual context
  const textsToEmbed = storedSegments.map((seg) => ({
    id: seg.id,
    text: formatVisualContextText(seg),
  }));

  const embeddingItems: {
    segmentId: string;
    content: string;
    embedding: number[];
    model: string;
    dimensions: number;
  }[] = [];

  for (let i = 0; i < textsToEmbed.length; i += EMBED_BATCH) {
    const batch = textsToEmbed.slice(i, i + EMBED_BATCH);
    const vectors = await retry('visual-embedding', () =>
      generateEmbeddings(batch.map((t) => t.text))
    );

    for (const [j, item] of batch.entries()) {
      const vector = vectors[j];
      if (!vector) continue;
      embeddingItems.push({
        segmentId: item.id,
        content: item.text,
        embedding: vector,
        model: EMBEDDING_MODEL_NAME,
        dimensions: EMBEDDING_DIMENSIONS,
      });
    }
  }

  if (embeddingItems.length > 0) {
    await IngestService.storeVideoContextEmbeddings(embeddingItems);
  }

  await IngestService.updateVisualStatus(assetId, 'completed');

  // Increment visual segments quota counter
  if (storedSegments.length > 0) {
    QuotaService.increment(userId, 'visual_segments', storedSegments.length).catch((err) => {
      console.warn(`[ingest] Failed to increment visual segments quota for ${assetId}:`, err);
    });
  }

  console.log(
    `[ingest] Visual context complete for asset ${assetId}: ${storedSegments.length} segments, ${embeddingItems.length} embeddings`
  );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown visual extraction error';
    await IngestService.updateVisualStatus(assetId, 'failed', { visualLastError: message });
    throw err;
  }
}
