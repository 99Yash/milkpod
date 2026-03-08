import type { FinishReason } from 'ai';
import { z } from 'zod';

/**
 * All possible finish reasons from the AI SDK, as a const tuple.
 * `satisfies` validates each element; the exhaustiveness check below
 * ensures we haven't missed any — if the SDK adds a new value, the
 * build breaks here instead of silently diverging.
 */
const FINISH_REASONS = [
  'stop', 'length', 'content-filter', 'tool-calls', 'error', 'other',
] as const satisfies readonly FinishReason[];

type _Exhaustive = [FinishReason] extends [typeof FINISH_REASONS[number]] ? true : never;
const _exhaustiveCheck: _Exhaustive = true;
void _exhaustiveCheck;

export const finishReasonSchema = z.enum(FINISH_REASONS);

export const chatMetadataSchema = z.object({
  threadId: z.string().optional(),
  assetId: z.string().optional(),
  collectionId: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  finishReason: finishReasonSchema.optional(),
});
