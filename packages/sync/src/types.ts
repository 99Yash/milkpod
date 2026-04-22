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
