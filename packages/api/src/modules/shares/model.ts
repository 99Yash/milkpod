import { t } from 'elysia';
import { uiMessageSchema } from '../../schemas';

export namespace ShareModel {
  export const create = t.Object({
    assetId: t.Optional(t.String()),
    collectionId: t.Optional(t.String()),
    canQuery: t.Optional(t.Boolean()),
    expiresAt: t.Optional(t.String({ format: 'date-time' })),
  });
  export type Create = typeof create.static;

  export const chat = t.Object({
    messages: t.Array(uiMessageSchema, { minItems: 1 }),
  });
  export type Chat = typeof chat.static;
}
