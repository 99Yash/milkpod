import { t } from 'elysia';

export namespace ChatModel {
  export const send = t.Object({
    messages: t.Array(t.Any()),
    id: t.Optional(t.String()),
    trigger: t.Optional(
      t.Union([t.Literal('submit-message'), t.Literal('regenerate-message')])
    ),
    messageId: t.Optional(t.String()),
    threadId: t.Optional(t.String()),
    assetId: t.Optional(t.String()),
    collectionId: t.Optional(t.String()),
  });
  export type Send = typeof send.static;
}
