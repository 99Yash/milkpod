import { sql } from 'drizzle-orm';
import { timestamp } from 'drizzle-orm/pg-core';
import { customAlphabet } from 'nanoid';

// ---------------------------------------------------------------------------
// Branded ID types — prevents mixing AssetId with ThreadId, etc.
// See: tutorials/total-ts/advanced-patterns-workshop/src/01-branded-types
// ---------------------------------------------------------------------------

/** Nominal/branded type utility. `Brand<string, "AssetId">` is incompatible
 *  with `Brand<string, "ThreadId">` even though both are strings at runtime. */
export type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand };

export type UserId = Brand<string, 'UserId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type AccountId = Brand<string, 'AccountId'>;
export type VerificationId = Brand<string, 'VerificationId'>;
export type AssetId = Brand<string, 'AssetId'>;
export type TranscriptId = Brand<string, 'TranscriptId'>;
export type SegmentId = Brand<string, 'SegmentId'>;
export type EmbeddingId = Brand<string, 'EmbeddingId'>;
export type CollectionId = Brand<string, 'CollectionId'>;
export type CollectionItemId = Brand<string, 'CollectionItemId'>;
export type ThreadId = Brand<string, 'ThreadId'>;
export type MessageId = Brand<string, 'MessageId'>;
export type MessagePartId = Brand<string, 'MessagePartId'>;
export type EvidenceId = Brand<string, 'EvidenceId'>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const lifecycle_dates = {
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .default(sql`current_timestamp`)
    .$onUpdate(() => new Date()),
};

export function createId<T extends string = string>(
  prefix?: string,
  { length = 12, separator = '_' } = {}
): T {
  const id = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', length)();
  return (prefix ? `${prefix}${separator}${id}` : id) as T;
}

export function generateRandomCode(length: number = 8) {
  return customAlphabet('123456789', length)();
}
