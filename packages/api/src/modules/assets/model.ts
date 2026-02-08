import { t } from 'elysia';

export namespace AssetModel {
  export const create = t.Object({
    title: t.String(),
    sourceUrl: t.Optional(t.String()),
    sourceType: t.Union([
      t.Literal('youtube'),
      t.Literal('podcast'),
      t.Literal('upload'),
      t.Literal('external'),
    ]),
    mediaType: t.Union([t.Literal('audio'), t.Literal('video')]),
    channelName: t.Optional(t.String()),
    thumbnailUrl: t.Optional(t.String()),
    sourceId: t.Optional(t.String()),
    idempotencyKey: t.Optional(t.String()),
  });
  export type Create = typeof create.static;

  export const update = t.Object({
    title: t.Optional(t.String()),
    status: t.Optional(
      t.Union([
        t.Literal('queued'),
        t.Literal('fetching'),
        t.Literal('transcribing'),
        t.Literal('embedding'),
        t.Literal('ready'),
        t.Literal('failed'),
      ])
    ),
  });
  export type Update = typeof update.static;

  export const asset = t.Object({
    id: t.String(),
    title: t.String(),
    sourceUrl: t.Nullable(t.String()),
    sourceType: t.String(),
    mediaType: t.String(),
    status: t.String(),
    duration: t.Nullable(t.Number()),
    channelName: t.Nullable(t.String()),
    thumbnailUrl: t.Nullable(t.String()),
    createdAt: t.Date(),
  });
  export type Asset = typeof asset.static;
}
