import { db } from '@milkpod/db';
import {
  assetMoments,
  assetMomentFeedback,
  momentPresetEnum,
} from '@milkpod/db/schemas';
import { and, desc, eq, isNull, type SQL } from 'drizzle-orm';
import type { Moment, MomentFeedback } from '../../types';
import type { MomentModel } from './model';
import { AssetMemberService } from '../asset-members/service';

type PresetValue = (typeof momentPresetEnum.enumValues)[number];

export abstract class MomentService {
  static async list(
    userId: string,
    assetId: string,
    preset?: PresetValue,
  ): Promise<Moment[]> {
    const conditions: SQL[] = [
      eq(assetMoments.assetId, assetId),
      eq(assetMoments.userId, userId),
      isNull(assetMoments.dismissedAt),
      // Sync mutators use `deletedAt` for soft-delete; keep parity so REST
      // SSR payloads don't briefly show rows that Replicache has removed.
      isNull(assetMoments.deletedAt),
    ];

    if (preset) {
      conditions.push(eq(assetMoments.preset, preset));
    }

    return db()
      .select()
      .from(assetMoments)
      .where(and(...conditions))
      .orderBy(desc(assetMoments.score));
  }

  static async getById(
    momentId: string,
    userId: string,
  ): Promise<Moment | null> {
    const [moment] = await db()
      .select()
      .from(assetMoments)
      .where(
        and(eq(assetMoments.id, momentId), eq(assetMoments.userId, userId)),
      );
    return moment ?? null;
  }

  static async deleteByAssetAndPreset(
    assetId: string,
    userId: string,
    preset: PresetValue,
  ): Promise<void> {
    await db()
      .delete(assetMoments)
      .where(
        and(
          eq(assetMoments.assetId, assetId),
          eq(assetMoments.userId, userId),
          eq(assetMoments.preset, preset),
        ),
      );
    await AssetMemberService.pokeMembers(assetId);
  }

  static async insertMany(
    rows: Array<{
      assetId: string;
      userId: string;
      preset: PresetValue;
      title: string;
      rationale: string;
      startTime: number;
      endTime: number;
      score: number;
      scoreBreakdown?: unknown;
      source: 'hybrid' | 'llm' | 'qa';
    }>,
  ): Promise<Moment[]> {
    if (rows.length === 0) return [];
    const inserted = await db().insert(assetMoments).values(rows).returning();
    const assetIds = new Set(inserted.map((r) => r.assetId));
    for (const assetId of assetIds) {
      await AssetMemberService.pokeMembers(assetId);
    }
    return inserted;
  }

  static async saveMoment(
    momentId: string,
    userId: string,
  ): Promise<Moment | null> {
    const [updated] = await db()
      .update(assetMoments)
      .set({ isSaved: true })
      .where(
        and(eq(assetMoments.id, momentId), eq(assetMoments.userId, userId)),
      )
      .returning();
    if (updated) await AssetMemberService.pokeMembers(updated.assetId);
    return updated ?? null;
  }

  static async dismissMoment(
    momentId: string,
    userId: string,
  ): Promise<Moment | null> {
    const [updated] = await db()
      .update(assetMoments)
      .set({ dismissedAt: new Date() })
      .where(
        and(eq(assetMoments.id, momentId), eq(assetMoments.userId, userId)),
      )
      .returning();
    if (updated) await AssetMemberService.pokeMembers(updated.assetId);
    return updated ?? null;
  }

  static async addFeedback(
    momentId: string,
    userId: string,
    action: MomentModel.Feedback['action'],
  ): Promise<MomentFeedback | null> {
    const [feedback] = await db()
      .insert(assetMomentFeedback)
      .values({ momentId, userId, action })
      .onConflictDoNothing()
      .returning();
    if (!feedback) {
      // Already exists — return the existing row
      const [existing] = await db()
        .select()
        .from(assetMomentFeedback)
        .where(
          and(
            eq(assetMomentFeedback.momentId, momentId),
            eq(assetMomentFeedback.userId, userId),
            eq(assetMomentFeedback.action, action),
          ),
        );
      return existing ?? null;
    }
    return feedback;
  }
}
