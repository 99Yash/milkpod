import { t } from 'elysia';
import type { MilkpodMessage } from '@milkpod/ai/types';

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

export namespace ShareModel {
  export const create = t.Object({
    assetId: t.Optional(t.String()),
    collectionId: t.Optional(t.String()),
    canQuery: t.Optional(t.Boolean()),
    expiresAt: t.Optional(t.String({ format: 'date-time' })),
  });
  export type Create = typeof create.static;

  export const chat = t.Object({
    messages: t.Array(uiMessage, { minItems: 1 }),
  });
  export type Chat = typeof chat.static;
}
