import { Elysia, status } from 'elysia';
import { authMacro } from '../../middleware/auth';
import { PodcastModel } from './model';
import { PodcastService } from './service';
import { orchestrateEpisodePipeline } from './episode-pipeline';

export const podcasts = new Elysia({ prefix: '/api/podcasts' })
  .use(authMacro)

  // ---------------------------------------------------------------------------
  // Feed CRUD
  // ---------------------------------------------------------------------------

  .post(
    '/feeds',
    async ({ body, user }) => {
      try {
        const result = await PodcastService.addFeed(
          user.id,
          body.feedUrl
        );
        return status(201, result);
      } catch (error) {
        return status(422, {
          message:
            error instanceof Error
              ? error.message
              : 'Could not parse RSS feed',
        });
      }
    },
    { auth: true, body: PodcastModel.addFeed }
  )

  .get('/feeds', async ({ user }) => {
    return PodcastService.listFeeds(user.id);
  }, { auth: true })

  .get('/feeds/:id', async ({ params, user }) => {
    const feed = await PodcastService.getFeed(params.id, user.id);
    if (!feed) return status(404, { message: 'Feed not found' });
    return feed;
  }, { auth: true })

  .patch(
    '/feeds/:id',
    async ({ params, body, user }) => {
      const updated = await PodcastService.updateFeed(
        params.id,
        user.id,
        body
      );
      if (!updated) return status(404, { message: 'Feed not found' });
      return updated;
    },
    { auth: true, body: PodcastModel.updateFeed }
  )

  .delete('/feeds/:id', async ({ params, user }) => {
    const deleted = await PodcastService.deleteFeed(
      params.id,
      user.id
    );
    if (!deleted) return status(404, { message: 'Feed not found' });
    return deleted;
  }, { auth: true })

  // ---------------------------------------------------------------------------
  // Feed refresh
  // ---------------------------------------------------------------------------

  .post('/feeds/:id/refresh', async ({ params, user }) => {
    try {
      const result = await PodcastService.refreshFeed(
        params.id,
        user.id
      );
      if (!result) return status(404, { message: 'Feed not found' });
      return result;
    } catch (error) {
      return status(422, {
        message:
          error instanceof Error
            ? error.message
            : 'Could not refresh RSS feed',
      });
    }
  }, { auth: true })

  // ---------------------------------------------------------------------------
  // Episodes
  // ---------------------------------------------------------------------------

  .get('/feeds/:id/episodes', async ({ params, user }) => {
    const episodes = await PodcastService.listEpisodes(
      params.id,
      user.id
    );
    if (episodes === null) return status(404, { message: 'Feed not found' });
    return episodes;
  }, { auth: true })

  .get('/episodes/:id', async ({ params, user }) => {
    const episode = await PodcastService.getEpisode(
      params.id,
      user.id
    );
    if (!episode) return status(404, { message: 'Episode not found' });
    return episode;
  }, { auth: true })

  // ---------------------------------------------------------------------------
  // Episode ingestion — trigger transcription pipeline
  // ---------------------------------------------------------------------------

  .post('/episodes/:id/ingest', async ({ params, user }) => {
    const episode = await PodcastService.getEpisode(
      params.id,
      user.id
    );
    if (!episode) return status(404, { message: 'Episode not found' });

    if (episode.status !== 'queued' && episode.status !== 'failed') {
      return status(409, {
        message: `Episode is already ${episode.status}`,
      });
    }

    // Reset if retrying a failed episode
    if (episode.status === 'failed') {
      await PodcastService.resetEpisodeForRetry(episode.id);
    }

    // Fire-and-forget pipeline
    orchestrateEpisodePipeline(episode.id, user.id);

    return { message: 'Ingestion started', episodeId: episode.id };
  }, { auth: true })

  // ---------------------------------------------------------------------------
  // Batch ingest — trigger transcription for all queued episodes in a feed
  // ---------------------------------------------------------------------------

  .post('/feeds/:id/ingest', async ({ params, user }) => {
    const episodes = await PodcastService.listEpisodes(
      params.id,
      user.id
    );
    if (episodes === null) return status(404, { message: 'Feed not found' });

    const queued = episodes.filter((ep) => ep.status === 'queued');
    if (queued.length === 0) {
      return { message: 'No queued episodes to ingest', started: 0 };
    }

    // Fire-and-forget each episode pipeline
    for (const ep of queued) {
      orchestrateEpisodePipeline(ep.id, user.id);
    }

    return {
      message: `Ingestion started for ${queued.length} episodes`,
      started: queued.length,
    };
  }, { auth: true });
