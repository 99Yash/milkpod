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

  export const listQuery = t.Object({
    assetId: t.Optional(t.String()),
    cursor: t.Optional(t.String()),
    limit: t.Optional(t.String()),
  });
  export type ListQuery = typeof listQuery.static;
}
