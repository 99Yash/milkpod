import { t } from 'elysia';

export namespace ThreadModel {
  export const create = t.Object({
    title: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
    assetId: t.Optional(t.String({ maxLength: 100 })),
    collectionId: t.Optional(t.String({ maxLength: 100 })),
  });
  export type Create = typeof create.static;

  export const update = t.Object({
    title: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
  });
  export type Update = typeof update.static;

  export const listQuery = t.Object({
    assetId: t.Optional(t.String({ maxLength: 100 })),
    cursor: t.Optional(t.String({ maxLength: 500 })),
    limit: t.Optional(t.String({ maxLength: 10 })),
  });
  export type ListQuery = typeof listQuery.static;
}
