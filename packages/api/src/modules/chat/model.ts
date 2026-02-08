import { t } from 'elysia';
import type { MilkpodMessage } from '@milkpod/ai/types';

// Validate the UIMessage envelope at runtime (id, role, parts array).
// Parts are a complex discriminated union — we validate they exist as objects
// with a `type` field and let the AI SDK handle deep part validation.
const uiMessage = t.Unsafe<MilkpodMessage>(
  t.Object({
    id: t.String(),
    role: t.Union([
      t.Literal('system'),
      t.Literal('user'),
      t.Literal('assistant'),
    ]),
    parts: t.Array(
      t.Object({ type: t.String() }, { additionalProperties: true })
    ),
    metadata: t.Optional(t.Any()),
  })
);

export namespace ChatModel {
  export const send = t.Object({
    messages: t.Array(uiMessage, { minItems: 1 }),
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
