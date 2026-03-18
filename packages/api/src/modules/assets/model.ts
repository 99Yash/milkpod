import { t } from 'elysia';

export namespace AssetModel {
  const speakerId = t.String({ minLength: 1, maxLength: 64 });
  const speakerDisplayName = t.String({ minLength: 1, maxLength: 80 });

  export const create = t.Object({
    title: t.String({ minLength: 1, maxLength: 200 }),
    sourceUrl: t.Optional(t.String({ maxLength: 2048 })),
    sourceType: t.Union([
      t.Literal('youtube'),
      t.Literal('podcast'),
      t.Literal('upload'),
      t.Literal('external'),
    ]),
    mediaType: t.Union([t.Literal('audio'), t.Literal('video')]),
    channelName: t.Optional(t.String({ maxLength: 200 })),
    thumbnailUrl: t.Optional(t.String({ maxLength: 2048 })),
    sourceId: t.Optional(t.String({ maxLength: 500 })),
    idempotencyKey: t.Optional(t.String({ maxLength: 100 })),
  });
  export type Create = typeof create.static;

  export const update = t.Object({
    title: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
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

  export const speakerNamesUpdate = t.Object({
    speakerNames: t.Record(speakerId, speakerDisplayName, {
      maxProperties: 50,
    }),
  });
  export type SpeakerNamesUpdate = typeof speakerNamesUpdate.static;

  export const listQuery = t.Object({
    q: t.Optional(t.String({ maxLength: 200 })),
    status: t.Optional(t.String({ maxLength: 20 })),
    sourceType: t.Optional(t.String({ maxLength: 20 })),
    cursor: t.Optional(t.String({ maxLength: 500 })),
    limit: t.Optional(t.String({ maxLength: 10 })),
    paginate: t.Optional(t.String({ maxLength: 10 })),
  });
  export type ListQuery = typeof listQuery.static;

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
