import { t } from 'elysia';

export namespace ChatModel {
  export const send = t.Object({
    messages: t.Array(t.Any()),
    threadId: t.Optional(t.String()),
    assetId: t.Optional(t.String()),
    collectionId: t.Optional(t.String()),
  });
  export type Send = typeof send.static;
}
