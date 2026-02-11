import { Elysia } from 'elysia';
import { authMiddleware } from '../../middleware/auth';
import { PodcastModel } from './model';
import { PodcastService } from './service';
import { orchestrateEpisodePipeline } from './episode-pipeline';

export const podcasts = new Elysia({ prefix: '/api/podcasts' })
  .use(authMiddleware)

  // ---------------------------------------------------------------------------
  // Feed CRUD
  // ---------------------------------------------------------------------------

  .post(
    '/feeds',
    async ({ body, session, set }) => {
      if (!session) {
        set.status = 401;
        return { message: 'Authentication required' };
      }

      try {
        const result = await PodcastService.addFeed(
          session.user.id,
          body.feedUrl
        );
        set.status = 201;
        return result;
      } catch (error) {
        set.status = 422;
        return {
          message:
            error instanceof Error
              ? error.message
              : 'Could not parse RSS feed',
        };
      }
    },
    { body: PodcastModel.addFeed }
  )

  .get('/feeds', async ({ session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }
    return PodcastService.listFeeds(session.user.id);
  })

  .get('/feeds/:id', async ({ params, session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }
    const feed = await PodcastService.getFeed(params.id, session.user.id);
    if (!feed) {
      set.status = 404;
      return { message: 'Feed not found' };
    }
    return feed;
  })

  .patch(
    '/feeds/:id',
    async ({ params, body, session, set }) => {
      if (!session) {
        set.status = 401;
        return { message: 'Authentication required' };
      }
      const updated = await PodcastService.updateFeed(
        params.id,
        session.user.id,
        body
      );
      if (!updated) {
        set.status = 404;
        return { message: 'Feed not found' };
      }
      return updated;
    },
    { body: PodcastModel.updateFeed }
  )

  .delete('/feeds/:id', async ({ params, session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }
    const deleted = await PodcastService.deleteFeed(
      params.id,
      session.user.id
    );
    if (!deleted) {
      set.status = 404;
      return { message: 'Feed not found' };
    }
    return deleted;
  })

  // ---------------------------------------------------------------------------
  // Feed refresh
  // ---------------------------------------------------------------------------

  .post('/feeds/:id/refresh', async ({ params, session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }

    try {
      const result = await PodcastService.refreshFeed(
        params.id,
        session.user.id
      );
      if (!result) {
        set.status = 404;
        return { message: 'Feed not found' };
      }
      return result;
    } catch (error) {
      set.status = 422;
      return {
        message:
          error instanceof Error
            ? error.message
            : 'Could not refresh RSS feed',
      };
    }
  })

  // ---------------------------------------------------------------------------
  // Episodes
  // ---------------------------------------------------------------------------

  .get('/feeds/:id/episodes', async ({ params, session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }
    const episodes = await PodcastService.listEpisodes(
      params.id,
      session.user.id
    );
    if (episodes === null) {
      set.status = 404;
      return { message: 'Feed not found' };
    }
    return episodes;
  })

  .get('/episodes/:id', async ({ params, session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }
    const episode = await PodcastService.getEpisode(
      params.id,
      session.user.id
    );
    if (!episode) {
      set.status = 404;
      return { message: 'Episode not found' };
    }
    return episode;
  })

  // ---------------------------------------------------------------------------
  // Episode ingestion — trigger transcription pipeline
  // ---------------------------------------------------------------------------

  .post('/episodes/:id/ingest', async ({ params, session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }

    const episode = await PodcastService.getEpisode(
      params.id,
      session.user.id
    );
    if (!episode) {
      set.status = 404;
      return { message: 'Episode not found' };
    }

    if (episode.status !== 'queued' && episode.status !== 'failed') {
      set.status = 409;
      return {
        message: `Episode is already ${episode.status}`,
      };
    }

    // Reset if retrying a failed episode
    if (episode.status === 'failed') {
      await PodcastService.resetEpisodeForRetry(episode.id);
    }

    // Fire-and-forget pipeline
    orchestrateEpisodePipeline(episode.id, session.user.id);

    return { message: 'Ingestion started', episodeId: episode.id };
  })

  // ---------------------------------------------------------------------------
  // Batch ingest — trigger transcription for all queued episodes in a feed
  // ---------------------------------------------------------------------------

  .post('/feeds/:id/ingest', async ({ params, session, set }) => {
    if (!session) {
      set.status = 401;
      return { message: 'Authentication required' };
    }

    const episodes = await PodcastService.listEpisodes(
      params.id,
      session.user.id
    );
    if (episodes === null) {
      set.status = 404;
      return { message: 'Feed not found' };
    }

    const queued = episodes.filter((ep) => ep.status === 'queued');
    if (queued.length === 0) {
      return { message: 'No queued episodes to ingest', started: 0 };
    }

    // Fire-and-forget each episode pipeline
    for (const ep of queued) {
      orchestrateEpisodePipeline(ep.id, session.user.id);
    }

    return {
      message: `Ingestion started for ${queued.length} episodes`,
      started: queued.length,
    };
  });
