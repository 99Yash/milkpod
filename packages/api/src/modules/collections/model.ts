import { t } from 'elysia';

export namespace CollectionModel {
  export const create = t.Object({
    name: t.String({ minLength: 1, maxLength: 100 }),
    description: t.Optional(t.String({ maxLength: 1000 })),
  });
  export type Create = typeof create.static;

  export const update = t.Object({
    name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
    description: t.Optional(t.String({ maxLength: 1000 })),
  });
  export type Update = typeof update.static;

  export const addItem = t.Object({
    assetId: t.String({ maxLength: 100 }),
    position: t.Optional(t.Number({ minimum: 0 })),
  });
  export type AddItem = typeof addItem.static;

  export const listQuery = t.Object({
    cursor: t.Optional(t.String({ maxLength: 500 })),
    limit: t.Optional(t.String({ maxLength: 10 })),
  });
  export type ListQuery = typeof listQuery.static;
}
