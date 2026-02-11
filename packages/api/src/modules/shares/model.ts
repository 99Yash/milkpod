import { t } from 'elysia';

export namespace ShareModel {
  export const create = t.Object({
    assetId: t.Optional(t.String()),
    collectionId: t.Optional(t.String()),
    canQuery: t.Optional(t.Boolean()),
    expiresAt: t.Optional(t.String({ format: 'date-time' })),
  });
  export type Create = typeof create.static;
}
