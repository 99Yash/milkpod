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
  assetMoments,
  assetMomentFeedback,
  assetComments,
  billingCustomers,
  billingSubscriptions,
  billingWebhookEvents,
  notifications,
  NotificationType,
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
export type Moment = InferSelectModel<typeof assetMoments>;
export type MomentFeedback = InferSelectModel<typeof assetMomentFeedback>;
export type Comment = InferSelectModel<typeof assetComments>;
export type BillingCustomer = InferSelectModel<typeof billingCustomers>;
export type BillingSubscription = InferSelectModel<typeof billingSubscriptions>;
export type BillingWebhookEvent = InferSelectModel<typeof billingWebhookEvents>;

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

/** How long an asset can sit in a processing state before it is considered stale (ms). */
export const STALE_ASSET_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

// ---------------------------------------------------------------------------
// Composite response types (matching what services return)
// ---------------------------------------------------------------------------

export type AssetWithTranscript = Asset & {
  transcript: Transcript | null;
  segments: TranscriptSegment[];
};

export type AssetRole = 'owner' | 'editor' | 'viewer';

export interface AssetOwner {
  id: string;
  name: string;
  image: string | null;
}

/** Asset row with the caller's role + the owner's display info attached. */
export type AssetWithAccess = Asset & {
  role: AssetRole;
  owner: AssetOwner;
};

// ---------------------------------------------------------------------------
// Notifications — discriminated union.
// Hoisted columns are always present; `body` is narrowed by `type`.
// Adding a new type = add a branch here + a case in the server create path.
// No migration required (storage is a jsonb column).
// ---------------------------------------------------------------------------

export type NotificationRow = InferSelectModel<typeof notifications>;

export type { NotificationType };

/** Shape every notification shares, independent of type. */
export interface BaseNotification {
  id: string;
  recipientId: string;
  actorId: string | null;
  resourceType: 'asset';
  resourceId: string;
  /** Epoch ms. Null = unread. */
  readAt: number | null;
  /** Epoch ms. */
  createdAt: number;
  /** Row version used by Replicache CVR to detect changes. */
  rowVersion: number;
  /** Actor display info, hydrated server-side for bell rendering. Null when the actor has been deleted. */
  actor: AssetOwner | null;
}

export type Notification = BaseNotification &
  (
    | {
        type: 'asset.member.added';
        body: { role: Exclude<AssetRole, 'owner'> };
      }
    | {
        type: 'asset.member.role_changed';
        body: {
          fromRole: Exclude<AssetRole, 'owner'>;
          toRole: Exclude<AssetRole, 'owner'>;
        };
      }
    | {
        type: 'asset.member.removed';
        body: Record<string, never>;
      }
  );

/** Narrow helper for exhaustive switches. */
export function isNotificationOfType<T extends Notification['type']>(
  n: Notification,
  t: T,
): n is Extract<Notification, { type: T }> {
  return n.type === t;
}

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

// ---------------------------------------------------------------------------
// Shared resource — returned by ShareService.getSharedResource()
// ---------------------------------------------------------------------------

export type SharedResourceResult =
  | {
      link: ShareLink;
      resource: AssetWithTranscript;
      type: 'asset';
    }
  | {
      link: ShareLink;
      resource: CollectionWithItems;
      type: 'collection';
    };
