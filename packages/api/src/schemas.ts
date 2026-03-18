import { t } from 'elysia';
import type { MilkpodMessage } from '@milkpod/ai/types';

/**
 * TypeBox schema for AI SDK UIMessage envelope validation.
 * Parts are a complex discriminated union — we validate they exist as objects
 * with a `type` field and let the AI SDK handle deep part validation.
 */
export const uiMessageSchema = t.Unsafe<MilkpodMessage>(
  t.Object({
    id: t.String({ maxLength: 100 }),
    role: t.Union([
      t.Literal('system'),
      t.Literal('user'),
      t.Literal('assistant'),
    ]),
    parts: t.Array(
      t.Object({ type: t.String({ maxLength: 50 }) }, { additionalProperties: true }),
      { maxItems: 200 }
    ),
    metadata: t.Optional(t.Record(t.String({ maxLength: 100 }), t.Unknown())),
  })
);
