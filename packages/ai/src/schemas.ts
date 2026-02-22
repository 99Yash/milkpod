import { z } from 'zod';

export const chatMetadataSchema = z
  .object({
    threadId: z.string().optional(),
    assetId: z.string().optional(),
    collectionId: z.string().optional(),
    durationMs: z.number().int().nonnegative().optional(),
  })
  .optional();
