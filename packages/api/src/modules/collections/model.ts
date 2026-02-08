import { t } from 'elysia';

export namespace CollectionModel {
  export const create = t.Object({
    name: t.String(),
    description: t.Optional(t.String()),
  });
  export type Create = typeof create.static;

  export const update = t.Object({
    name: t.Optional(t.String()),
    description: t.Optional(t.String()),
  });
  export type Update = typeof update.static;

  export const addItem = t.Object({
    assetId: t.String(),
    position: t.Optional(t.Number()),
  });
  export type AddItem = typeof addItem.static;
}
