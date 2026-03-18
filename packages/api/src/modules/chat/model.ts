import { t } from 'elysia';
import { VALID_MODEL_IDS } from '@milkpod/ai';
import { uiMessageSchema } from '../../schemas';

const modelIdLiterals = VALID_MODEL_IDS.map((id) => t.Literal(id));

export namespace ChatModel {
  export const send = t.Object({
    messages: t.Array(uiMessageSchema, { minItems: 1 }),
    id: t.Optional(t.String({ maxLength: 100 })),
    trigger: t.Optional(
      t.Union([t.Literal('submit-message'), t.Literal('regenerate-message')])
    ),
    messageId: t.Optional(t.String({ maxLength: 100 })),
    threadId: t.Optional(t.String({ maxLength: 100 })),
    assetId: t.Optional(t.String({ maxLength: 100 })),
    collectionId: t.Optional(t.String({ maxLength: 100 })),
    modelId: t.Optional(t.Union(modelIdLiterals)),
    wordLimit: t.Optional(t.Union([t.Number({ minimum: 1 }), t.Null()])),
  });
  export type Send = typeof send.static;
}
