import { t } from 'elysia';

export namespace PodcastModel {
  export const addFeed = t.Object({
    feedUrl: t.String({ format: 'uri' }),
  });
  export type AddFeed = typeof addFeed.static;

  export const updateFeed = t.Object({
    refreshIntervalMins: t.Optional(t.Integer({ minimum: 5 })),
  });
  export type UpdateFeed = typeof updateFeed.static;

  export const refreshFeed = t.Object({
    feedId: t.String(),
  });
  export type RefreshFeed = typeof refreshFeed.static;
}
