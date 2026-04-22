import { db } from '@milkpod/db';
import { assetComments, commentSourceEnum } from '@milkpod/db/schemas';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Comment } from '../../types';
import { AssetMemberService } from '../asset-members/service';

type SourceValue = (typeof commentSourceEnum.enumValues)[number];

export abstract class CommentService {
  static async list(userId: string, assetId: string): Promise<Comment[]> {
    return db()
      .select()
      .from(assetComments)
      .where(
        and(
          eq(assetComments.assetId, assetId),
          eq(assetComments.userId, userId),
          isNull(assetComments.dismissedAt),
        ),
      )
      .orderBy(asc(assetComments.startTime));
  }

  static async getById(
    commentId: string,
    userId: string,
  ): Promise<Comment | null> {
    const [comment] = await db()
      .select()
      .from(assetComments)
      .where(
        and(eq(assetComments.id, commentId), eq(assetComments.userId, userId)),
      );
    return comment ?? null;
  }

  static async deleteByAsset(assetId: string, userId: string): Promise<void> {
    await db()
      .delete(assetComments)
      .where(
        and(
          eq(assetComments.assetId, assetId),
          eq(assetComments.userId, userId),
        ),
      );
    await AssetMemberService.pokeMembers(assetId);
  }

  static async insertMany(
    rows: Array<{
      assetId: string;
      userId: string;
      body: string;
      startTime: number;
      endTime: number;
      source: SourceValue;
      evidenceRefs?: {
        transcriptSegmentIds: string[];
        visualSegmentIds: string[];
      };
    }>,
  ): Promise<Comment[]> {
    if (rows.length === 0) return [];
    const inserted = await db().insert(assetComments).values(rows).returning();
    const assetIds = new Set(inserted.map((r) => r.assetId));
    for (const assetId of assetIds) {
      await AssetMemberService.pokeMembers(assetId);
    }
    return inserted;
  }

  static async dismissComment(
    commentId: string,
    userId: string,
  ): Promise<Comment | null> {
    const [updated] = await db()
      .update(assetComments)
      .set({ dismissedAt: new Date() })
      .where(
        and(eq(assetComments.id, commentId), eq(assetComments.userId, userId)),
      )
      .returning();
    if (updated) await AssetMemberService.pokeMembers(updated.assetId);
    return updated ?? null;
  }
}
