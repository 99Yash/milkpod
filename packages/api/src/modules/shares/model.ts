import { t } from 'elysia';
import { uiMessageSchema } from '../../schemas';

export namespace ShareModel {
  export const create = t.Object({
    assetId: t.Optional(t.String({ maxLength: 100 })),
    collectionId: t.Optional(t.String({ maxLength: 100 })),
    canQuery: t.Optional(t.Boolean()),
    expiresAt: t.Optional(t.String({ format: 'date-time', maxLength: 50 })),
  });
  export type Create = typeof create.static;

  export const chat = t.Object({
    messages: t.Array(uiMessageSchema, { minItems: 1 }),
  });
  export type Chat = typeof chat.static;
}
