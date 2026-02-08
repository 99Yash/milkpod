import { t } from 'elysia';

export namespace ThreadModel {
  export const create = t.Object({
    title: t.Optional(t.String()),
    assetId: t.Optional(t.String()),
    collectionId: t.Optional(t.String()),
  });
  export type Create = typeof create.static;

  export const update = t.Object({
    title: t.Optional(t.String()),
  });
  export type Update = typeof update.static;
}
