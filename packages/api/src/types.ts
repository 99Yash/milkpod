import type { InferSelectModel } from 'drizzle-orm';
import type {
  mediaAssets,
  transcripts,
  transcriptSegments,
  qaThreads,
  qaMessages,
  qaEvidence,
  collections,
  collectionItems,
  shareLinks,
  shareQueries,
} from '@milkpod/db/schemas';

// ---------------------------------------------------------------------------
// Row types derived from Drizzle schema (single source of truth)
// ---------------------------------------------------------------------------

export type Asset = InferSelectModel<typeof mediaAssets>;
export type Transcript = InferSelectModel<typeof transcripts>;
export type TranscriptSegment = InferSelectModel<typeof transcriptSegments>;
export type Thread = InferSelectModel<typeof qaThreads>;
export type Message = InferSelectModel<typeof qaMessages>;
export type Evidence = InferSelectModel<typeof qaEvidence>;
export type Collection = InferSelectModel<typeof collections>;
export type CollectionItem = InferSelectModel<typeof collectionItems>;
export type ShareLink = InferSelectModel<typeof shareLinks>;
export type ShareQuery = InferSelectModel<typeof shareQueries>;

// ---------------------------------------------------------------------------
// Asset status — discriminated union + type predicates
// ---------------------------------------------------------------------------

export type AssetStatus = Asset['status'];

const TERMINAL_STATUSES = new Set<AssetStatus>(['ready', 'failed']);
const PROCESSING_STATUSES = new Set<AssetStatus>([
  'queued',
  'fetching',
  'transcribing',
  'embedding',
]);

export function isTerminalStatus(
  s: AssetStatus
): s is 'ready' | 'failed' {
  return TERMINAL_STATUSES.has(s);
}

export function isProcessingStatus(
  s: AssetStatus
): s is 'queued' | 'fetching' | 'transcribing' | 'embedding' {
  return PROCESSING_STATUSES.has(s);
}

// ---------------------------------------------------------------------------
// Composite response types (matching what services return)
// ---------------------------------------------------------------------------

export type AssetWithTranscript = Asset & {
  transcript: Transcript | null;
  segments: TranscriptSegment[];
};

export type ThreadWithMessages = Thread & {
  messages: Message[];
};

export type CollectionWithItems = Collection & {
  items: Array<{
    id: CollectionItem['id'];
    position: CollectionItem['position'];
    asset: Pick<
      Asset,
      'id' | 'title' | 'sourceType' | 'mediaType' | 'status' | 'thumbnailUrl' | 'duration'
    >;
  }>;
};
