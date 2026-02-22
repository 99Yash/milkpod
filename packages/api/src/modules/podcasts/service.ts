import { db } from '@milkpod/db';
import {
  episodeStatusEnum,
  podcastFeeds,
  podcastEpisodes,
} from '@milkpod/db/schemas';
import { and, eq, sql } from 'drizzle-orm';
import { parseFeed, type FeedEpisode } from './rss';

type EpisodeStatus = (typeof episodeStatusEnum.enumValues)[number];

export abstract class PodcastService {
  // ---------------------------------------------------------------------------
  // Feed CRUD
  // ---------------------------------------------------------------------------

  /** Add a new podcast feed and discover its episodes. */
  static async addFeed(userId: string, feedUrl: string) {
    const parsed = await parseFeed(feedUrl);

    const [feed] = await db
      .insert(podcastFeeds)
      .values({
        userId,
        feedUrl,
        title: parsed.meta.title,
        description: parsed.meta.description,
        imageUrl: parsed.meta.imageUrl,
        author: parsed.meta.author,
        language: parsed.meta.language,
        totalEpisodes: parsed.episodes.length,
        lastFetchedAt: new Date(),
      })
      .returning();

    if (!feed) throw new Error('Failed to insert podcast feed');

    // Discover episodes (insert new GUIDs only)
    const newEpisodes = await PodcastService.upsertEpisodes(
      feed.id,
      parsed.episodes
    );

    return { feed, newEpisodes };
  }

  /** List all feeds for a user. */
  static async listFeeds(userId: string) {
    return db
      .select()
      .from(podcastFeeds)
      .where(eq(podcastFeeds.userId, userId))
      .orderBy(podcastFeeds.createdAt);
  }

  /** Get a single feed by ID, scoped to user. */
  static async getFeed(feedId: string, userId: string) {
    const [feed] = await db
      .select()
      .from(podcastFeeds)
      .where(
        and(eq(podcastFeeds.id, feedId), eq(podcastFeeds.userId, userId))
      );
    return feed ?? null;
  }

  /** Update feed settings. */
  static async updateFeed(
    feedId: string,
    userId: string,
    data: { refreshIntervalMins?: number }
  ) {
    const [updated] = await db
      .update(podcastFeeds)
      .set(data)
      .where(
        and(eq(podcastFeeds.id, feedId), eq(podcastFeeds.userId, userId))
      )
      .returning();
    return updated ?? null;
  }

  /** Delete a feed and all its episodes (cascade). */
  static async deleteFeed(feedId: string, userId: string) {
    const [deleted] = await db
      .delete(podcastFeeds)
      .where(
        and(eq(podcastFeeds.id, feedId), eq(podcastFeeds.userId, userId))
      )
      .returning();
    return deleted ?? null;
  }

  // ---------------------------------------------------------------------------
  // Feed refresh
  // ---------------------------------------------------------------------------

  /** Re-fetch the RSS feed and discover new episodes. */
  static async refreshFeed(feedId: string, userId: string) {
    const feed = await PodcastService.getFeed(feedId, userId);
    if (!feed) return null;

    const parsed = await parseFeed(feed.feedUrl);

    // Update feed metadata
    await db
      .update(podcastFeeds)
      .set({
        title: parsed.meta.title,
        description: parsed.meta.description,
        imageUrl: parsed.meta.imageUrl,
        author: parsed.meta.author,
        language: parsed.meta.language,
        totalEpisodes: parsed.episodes.length,
        lastFetchedAt: new Date(),
      })
      .where(eq(podcastFeeds.id, feedId));

    const newEpisodes = await PodcastService.upsertEpisodes(
      feedId,
      parsed.episodes
    );

    return { feed: { ...feed, ...parsed.meta }, newEpisodes };
  }

  // ---------------------------------------------------------------------------
  // Episode management
  // ---------------------------------------------------------------------------

  /** Insert new episodes that don't already exist (by guid+feedId). */
  private static async upsertEpisodes(
    feedId: string,
    episodes: FeedEpisode[]
  ) {
    if (episodes.length === 0) return [];

    // Get existing GUIDs for this feed
    const existing = await db
      .select({ guid: podcastEpisodes.guid })
      .from(podcastEpisodes)
      .where(eq(podcastEpisodes.feedId, feedId));

    const existingGuids = new Set(existing.map((e) => e.guid));
    const newItems = episodes.filter((e) => !existingGuids.has(e.guid));

    if (newItems.length === 0) return [];

    const inserted = await db
      .insert(podcastEpisodes)
      .values(
        newItems.map((ep) => ({
          feedId,
          guid: ep.guid,
          title: ep.title,
          description: ep.description,
          sourceUrl: ep.sourceUrl,
          publishedAt: ep.publishedAt,
          duration: ep.duration,
        }))
      )
      .returning();

    return inserted;
  }

  /** List episodes for a feed. */
  static async listEpisodes(feedId: string, userId: string) {
    // Verify feed ownership
    const feed = await PodcastService.getFeed(feedId, userId);
    if (!feed) return null;

    return db
      .select()
      .from(podcastEpisodes)
      .where(eq(podcastEpisodes.feedId, feedId))
      .orderBy(podcastEpisodes.createdAt);
  }

  /** Get a single episode, verifying feed ownership. */
  static async getEpisode(episodeId: string, userId: string) {
    const [episode] = await db
      .select()
      .from(podcastEpisodes)
      .where(eq(podcastEpisodes.id, episodeId));

    if (!episode) return null;

    // Verify ownership through feed
    const feed = await PodcastService.getFeed(episode.feedId, userId);
    if (!feed) return null;

    return episode;
  }

  /** Update episode status. */
  static async updateEpisodeStatus(
    episodeId: string,
    status: EpisodeStatus,
    opts?: { lastError?: string; assetId?: string }
  ) {
    await db
      .update(podcastEpisodes)
      .set({
        status,
        ...(opts?.lastError != null && { lastError: opts.lastError }),
        ...(opts?.assetId != null && { assetId: opts.assetId }),
      })
      .where(eq(podcastEpisodes.id, episodeId));
  }

  /** Increment attempt counter on episode failure. */
  static async incrementEpisodeAttempts(
    episodeId: string,
    lastError: string
  ) {
    await db
      .update(podcastEpisodes)
      .set({
        attempts: sql`${podcastEpisodes.attempts} + 1`,
        lastError,
      })
      .where(eq(podcastEpisodes.id, episodeId));
  }

  /** Link an episode to its transcribed media asset. */
  static async linkAsset(episodeId: string, assetId: string) {
    await db
      .update(podcastEpisodes)
      .set({ assetId })
      .where(eq(podcastEpisodes.id, episodeId));
  }

  /** Reset episode for retry. */
  static async resetEpisodeForRetry(episodeId: string) {
    await db
      .update(podcastEpisodes)
      .set({
        status: 'queued',
        lastError: null,
        attempts: 0,
      })
      .where(eq(podcastEpisodes.id, episodeId));
  }
}
