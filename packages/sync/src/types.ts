/**
 * Shape of a moment as stored in the Replicache client cache and emitted by
 * the pull endpoint. Includes denormalized author metadata so the UI can
 * render without a second fetch.
 */
export interface SyncedMoment {
  id: string;
  assetId: string;
  authorId: string;
  authorName: string | null;
  authorImage: string | null;
  authorEmail: string | null;
  preset: 'default' | 'hook' | 'insight' | 'quote' | 'actionable' | 'story';
  title: string;
  rationale: string;
  startTime: number;
  endTime: number;
  score: number;
  source: 'hybrid' | 'llm' | 'qa';
  isSaved: boolean;
  createdAt: string;
  rowVersion: number;
}

/**
 * Shape of a notification in the Replicache client cache. Mirrors the
 * discriminated union from `@milkpod/api/types` but kept here as a structural
 * contract so the sync package doesn't import from the API package (which
 * would pull server-only deps into the client bundle).
 */
export type SyncedNotificationRole = 'editor' | 'viewer';

export interface SyncedNotificationActor {
  id: string;
  name: string;
  image: string | null;
}

interface SyncedNotificationBase {
  id: string;
  recipientId: string;
  actorId: string | null;
  resourceType: 'asset';
  resourceId: string;
  /** Epoch ms. Null = unread. */
  readAt: number | null;
  /** Epoch ms. */
  createdAt: number;
  rowVersion: number;
  actor: SyncedNotificationActor | null;
}

export type SyncedNotification = SyncedNotificationBase &
  (
    | {
        type: 'asset.member.added';
        body: { role: SyncedNotificationRole };
      }
    | {
        type: 'asset.member.role_changed';
        body: {
          fromRole: SyncedNotificationRole;
          toRole: SyncedNotificationRole;
        };
      }
    | {
        type: 'asset.member.removed';
        body: Record<string, never>;
      }
  );

export interface SyncedComment {
  id: string;
  assetId: string;
  authorId: string;
  authorName: string | null;
  authorImage: string | null;
  authorEmail: string | null;
  body: string;
  startTime: number;
  endTime: number;
  source: 'audio' | 'visual' | 'hybrid';
  evidenceRefs: {
    transcriptSegmentIds: string[];
    visualSegmentIds: string[];
  } | null;
  createdAt: string;
  rowVersion: number;
}
