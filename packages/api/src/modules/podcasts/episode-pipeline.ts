import {
  chunkTranscript,
  generateEmbeddings,
  EMBEDDING_MODEL_NAME,
  EMBEDDING_DIMENSIONS,
} from '@milkpod/ai/embeddings';
import { transcribeAudio } from '../ingest/elevenlabs';
import { groupWordsIntoSegments } from '../ingest/segments';
import { IngestService } from '../ingest/service';
import { AssetService } from '../assets/service';
import { PodcastService } from './service';
import {
  emitAssetStatus,
  emitAssetProgress,
} from '../../events/asset-events';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function delayWithJitter(attempt: number): Promise<void> {
  const exponential = BASE_DELAY_MS * 2 ** attempt;
  const jitter = Math.random() * exponential;
  return new Promise((resolve) => setTimeout(resolve, exponential + jitter));
}

async function withRetry<T>(
  stage: string,
  episodeId: string,
  fn: () => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      await PodcastService.incrementEpisodeAttempts(episodeId, message);
      console.error(
        `[podcast] Stage "${stage}" failed for episode ${episodeId} (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`,
        message
      );
      if (attempt < MAX_RETRIES) {
        await delayWithJitter(attempt);
      } else {
        throw error;
      }
    }
  }
  throw new Error(`Stage "${stage}" exhausted retries`);
}

/**
 * Ingest a single podcast episode:
 * 1. Create a media_asset (sourceType: podcast)
 * 2. Link episode → asset
 * 3. Transcribe audio (sourceUrl is already a direct audio URL from RSS enclosure)
 * 4. Generate and store embeddings
 * 5. Mark both episode and asset as ready
 */
export async function orchestrateEpisodePipeline(
  episodeId: string,
  userId: string
): Promise<void> {
  // Load episode to get sourceUrl and metadata
  const episode = await PodcastService.getEpisode(episodeId, userId);
  if (!episode) {
    console.error(`[podcast] Episode ${episodeId} not found`);
    return;
  }

  let assetId = episode.assetId;

  try {
    // Stage 1: Create asset (if not already linked)
    if (!assetId) {
      await PodcastService.updateEpisodeStatus(episodeId, 'fetching');

      const asset = await AssetService.create(userId, {
        title: episode.title,
        sourceUrl: episode.sourceUrl,
        sourceType: 'podcast',
        mediaType: 'audio',
      });

      if (!asset) {
        throw new Error('Failed to create media asset for episode');
      }

      assetId = asset.id;
      await PodcastService.linkAsset(episodeId, assetId);

      if (episode.duration) {
        await IngestService.updateStatus(assetId, 'fetching', {
          duration: episode.duration,
        });
      }
    }

    emitAssetStatus(userId, assetId, 'fetching');

    // Stage 2: Transcribe audio
    // Podcast episodes have a direct audio URL from the RSS enclosure — no yt-dlp needed
    await IngestService.updateStatus(assetId, 'transcribing');
    await PodcastService.updateEpisodeStatus(episodeId, 'transcribing');
    emitAssetStatus(userId, assetId, 'transcribing');

    const result = await withRetry('transcribing', episodeId, () =>
      transcribeAudio(episode.sourceUrl)
    );
    const segments = groupWordsIntoSegments(result.words);
    const { segments: storedSegments } = await IngestService.storeTranscript(
      assetId,
      result.language_code,
      segments
    );

    // Stage 3: Generate and store embeddings
    await IngestService.updateStatus(assetId, 'embedding');
    await PodcastService.updateEpisodeStatus(episodeId, 'transcribing'); // episode stays at transcribing until embeddings done
    emitAssetStatus(userId, assetId, 'embedding');

    // Concatenate all segments into full transcript, then chunk recursively
    const chunkItems = chunkTranscript(storedSegments);
    const embeddingItems: {
      segmentId: string;
      content: string;
      embedding: number[];
      model: string;
      dimensions: number;
    }[] = [];

    const EMBED_BATCH = 64;
    for (let i = 0; i < chunkItems.length; i += EMBED_BATCH) {
      const batch = chunkItems.slice(i, i + EMBED_BATCH);
      const vectors = await withRetry('embedding', episodeId, () =>
        generateEmbeddings(batch.map((c) => c.content))
      );
      for (let j = 0; j < batch.length; j++) {
        embeddingItems.push({
          segmentId: batch[j]!.segmentId,
          content: batch[j]!.content,
          embedding: vectors[j]!,
          model: EMBEDDING_MODEL_NAME,
          dimensions: EMBEDDING_DIMENSIONS,
        });
      }

      const done = Math.min(i + EMBED_BATCH, chunkItems.length);
      const pct = (done / chunkItems.length) * 100;
      emitAssetProgress(userId, assetId, 'embedding', pct, `Embedding chunks (${done}/${chunkItems.length})`);
    }

    if (embeddingItems.length > 0) {
      await IngestService.storeEmbeddings(embeddingItems);
    }

    // Stage 4: Mark as ready
    await IngestService.updateStatus(assetId, 'ready');
    await PodcastService.updateEpisodeStatus(episodeId, 'ready');
    emitAssetStatus(userId, assetId, 'ready');
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown pipeline error';
    console.error(
      `[podcast] Pipeline failed for episode ${episodeId}:`,
      message
    );

    if (assetId) {
      await IngestService.updateStatus(assetId, 'failed', {
        lastError: message,
      });
      emitAssetStatus(userId, assetId, 'failed', message);
    }

    await PodcastService.updateEpisodeStatus(episodeId, 'failed', {
      lastError: message,
    });
  }
}
