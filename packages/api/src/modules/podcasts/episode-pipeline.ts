import { transcribeAudio } from '../ingest/elevenlabs';
import { groupWordsIntoSegments } from '../ingest/segments';
import { IngestService } from '../ingest/service';
import { withRetry } from '../ingest/retry';
import { embedSegments } from '../ingest/embed';
import { AssetService } from '../assets/service';
import { PodcastService } from './service';
import { emitAssetStatus } from '../../events/asset-events';

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

  const retry = <T>(stage: string, fn: () => Promise<T>) =>
    withRetry(
      { stage, entityId: episodeId, logPrefix: 'podcast', onError: PodcastService.incrementEpisodeAttempts },
      fn
    );

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

    const result = await retry('transcribing', () =>
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

    await embedSegments({
      entityId: episodeId,
      userId,
      assetId,
      storedSegments,
      retry,
    });

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
