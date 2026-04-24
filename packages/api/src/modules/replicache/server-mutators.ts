import { and, eq, isNull } from 'drizzle-orm';
import {
  assetComments,
  assetMoments,
  notifications,
} from '@milkpod/db/schemas';
import type {
  CommentCreateArgs,
  CommentDeleteArgs,
  CommentUpdateArgs,
  MomentCreateArgs,
  MomentDeleteArgs,
  MomentUpdateArgs,
  NotificationMarkAllReadArgs,
  NotificationMarkReadArgs,
} from '@milkpod/sync';
import { AssetMemberService } from '../asset-members/service';

export class MutatorForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MutatorForbiddenError';
  }
}

export interface ServerMutatorCtx {
  userId: string;
}

/**
 * Drizzle pg transaction. Typed as `unknown` here because the exact type
 * varies with the driver version; the call sites are narrow enough that
 * typed member calls are all we use.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbTx = any;

async function requireEditor(
  assetId: string,
  userId: string,
): Promise<void> {
  const allowed = await AssetMemberService.isEditor(assetId, userId);
  if (!allowed) {
    throw new MutatorForbiddenError(
      `User ${userId} is not an editor of asset ${assetId}`,
    );
  }
}

export const serverMutators = {
  async momentCreate(
    tx: DbTx,
    args: MomentCreateArgs,
    ctx: ServerMutatorCtx,
  ): Promise<void> {
    await requireEditor(args.assetId, ctx.userId);
    await tx
      .insert(assetMoments)
      .values({
        id: args.id,
        assetId: args.assetId,
        userId: ctx.userId,
        preset: args.preset,
        title: args.title,
        rationale: args.rationale,
        startTime: args.startTime,
        endTime: args.endTime,
        score: args.score,
        source: args.source,
        createdAt: new Date(args.createdAt),
      })
      .onConflictDoNothing();
  },

  async momentUpdate(
    tx: DbTx,
    args: MomentUpdateArgs,
    ctx: ServerMutatorCtx,
  ): Promise<void> {
    await requireEditor(args.assetId, ctx.userId);
    const patch: Record<string, unknown> = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.rationale !== undefined) patch.rationale = args.rationale;
    if (args.isSaved !== undefined) patch.isSaved = args.isSaved;
    if (Object.keys(patch).length === 0) return;
    await tx
      .update(assetMoments)
      .set(patch)
      .where(
        and(
          eq(assetMoments.id, args.id),
          eq(assetMoments.assetId, args.assetId),
        ),
      );
  },

  async momentDelete(
    tx: DbTx,
    args: MomentDeleteArgs,
    ctx: ServerMutatorCtx,
  ): Promise<void> {
    await requireEditor(args.assetId, ctx.userId);
    await tx
      .update(assetMoments)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(assetMoments.id, args.id),
          eq(assetMoments.assetId, args.assetId),
        ),
      );
  },

  async commentCreate(
    tx: DbTx,
    args: CommentCreateArgs,
    ctx: ServerMutatorCtx,
  ): Promise<void> {
    await requireEditor(args.assetId, ctx.userId);
    await tx
      .insert(assetComments)
      .values({
        id: args.id,
        assetId: args.assetId,
        userId: ctx.userId,
        body: args.body,
        startTime: args.startTime,
        endTime: args.endTime,
        source: args.source,
        evidenceRefs: args.evidenceRefs ?? null,
        createdAt: new Date(args.createdAt),
      })
      .onConflictDoNothing();
  },

  async commentUpdate(
    tx: DbTx,
    args: CommentUpdateArgs,
    ctx: ServerMutatorCtx,
  ): Promise<void> {
    await requireEditor(args.assetId, ctx.userId);
    const patch: Record<string, unknown> = {};
    if (args.body !== undefined) patch.body = args.body;
    if (Object.keys(patch).length === 0) return;
    await tx
      .update(assetComments)
      .set(patch)
      .where(
        and(
          eq(assetComments.id, args.id),
          eq(assetComments.assetId, args.assetId),
        ),
      );
  },

  async commentDelete(
    tx: DbTx,
    args: CommentDeleteArgs,
    ctx: ServerMutatorCtx,
  ): Promise<void> {
    await requireEditor(args.assetId, ctx.userId);
    await tx
      .update(assetComments)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(assetComments.id, args.id),
          eq(assetComments.assetId, args.assetId),
        ),
      );
  },

  /**
   * Flip readAt on a single notification — only if the caller is the
   * recipient. The `recipientId` WHERE clause makes the ownership check
   * atomic with the update; no separate auth query needed.
   */
  async notificationMarkRead(
    tx: DbTx,
    args: NotificationMarkReadArgs,
    ctx: ServerMutatorCtx,
  ): Promise<void> {
    await tx
      .update(notifications)
      .set({ readAt: new Date(args.readAt) })
      .where(
        and(
          eq(notifications.id, args.id),
          eq(notifications.recipientId, ctx.userId),
          isNull(notifications.readAt),
        ),
      );
  },

  /** Bulk mark-read for every unread notification owned by the caller. */
  async notificationMarkAllRead(
    tx: DbTx,
    args: NotificationMarkAllReadArgs,
    ctx: ServerMutatorCtx,
  ): Promise<void> {
    await tx
      .update(notifications)
      .set({ readAt: new Date(args.readAt) })
      .where(
        and(
          eq(notifications.recipientId, ctx.userId),
          isNull(notifications.readAt),
        ),
      );
  },
} as const;

export type ServerMutators = typeof serverMutators;
export type ServerMutatorName = keyof ServerMutators;
