import { t } from 'elysia';
import { VALID_MODEL_IDS } from '@milkpod/ai';
import { uiMessageSchema } from '../../schemas';

const modelIdLiterals = VALID_MODEL_IDS.map((id) => t.Literal(id));

export namespace ChatModel {
  export const send = t.Object({
    messages: t.Array(uiMessageSchema, { minItems: 1 }),
    id: t.Optional(t.String()),
    trigger: t.Optional(
      t.Union([t.Literal('submit-message'), t.Literal('regenerate-message')])
    ),
    messageId: t.Optional(t.String()),
    threadId: t.Optional(t.String()),
    assetId: t.Optional(t.String()),
    collectionId: t.Optional(t.String()),
    modelId: t.Optional(t.Union(modelIdLiterals)),
    wordLimit: t.Optional(t.Union([t.Number({ minimum: 1 }), t.Null()])),
  });
  export type Send = typeof send.static;
}
