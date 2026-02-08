import { chunkSegmentText, generateEmbeddings, EMBEDDING_MODEL_NAME, EMBEDDING_DIMENSIONS } from '@milkpod/ai/embeddings';
import { resolveAudioUrl } from './ytdlp';
import { transcribeAudio } from './elevenlabs';
import { groupWordsIntoSegments } from './segments';
import { IngestService } from './service';

export async function orchestratePipeline(
  assetId: string,
  sourceUrl: string
): Promise<void> {
  try {
    // Stage 1: Fetch direct audio URL
    await IngestService.updateStatus(assetId, 'fetching');
    const audioUrl = await resolveAudioUrl(sourceUrl);

    // Stage 2: Transcribe audio
    await IngestService.updateStatus(assetId, 'transcribing');
    const result = await transcribeAudio(audioUrl);
    const segments = groupWordsIntoSegments(result.words);
    const { segments: storedSegments } = await IngestService.storeTranscript(
      assetId,
      result.language_code,
      segments
    );

    // Stage 3: Generate and store embeddings
    await IngestService.updateStatus(assetId, 'embedding');
    const embeddingItems: {
      segmentId: string;
      content: string;
      embedding: number[];
      model: string;
      dimensions: number;
    }[] = [];

    for (const seg of storedSegments) {
      const chunks = chunkSegmentText(seg.text);
      if (chunks.length === 0) continue;

      const vectors = await generateEmbeddings(chunks);
      for (let i = 0; i < chunks.length; i++) {
        embeddingItems.push({
          segmentId: seg.id,
          content: chunks[i]!,
          embedding: vectors[i]!,
          model: EMBEDDING_MODEL_NAME,
          dimensions: EMBEDDING_DIMENSIONS,
        });
      }
    }

    if (embeddingItems.length > 0) {
      await IngestService.storeEmbeddings(embeddingItems);
    }

    // Stage 4: Mark as ready
    await IngestService.updateStatus(assetId, 'ready');
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown pipeline error';
    console.error(`[ingest] Pipeline failed for asset ${assetId}:`, message);
    await IngestService.updateStatus(assetId, 'failed', {
      lastError: message,
    });
  }
}
