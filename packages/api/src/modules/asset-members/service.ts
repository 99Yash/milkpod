import { db } from '@milkpod/db';
import {
  assetInvites,
  assetMembers,
  mediaAssets,
  user as userTable,
} from '@milkpod/db/schemas';
import { and, eq } from 'drizzle-orm';
import { sendInviteEmail } from '@milkpod/auth/invite-email';
import { serverEnv } from '@milkpod/env/server';
import { emitReplicachePokes } from '../../events/replicache-events';
import { NotificationService } from '../notifications/service';

export type AssetMemberRole = 'owner' | 'editor' | 'viewer';
export type AssetInviteRole = Exclude<AssetMemberRole, 'owner'>;

export interface MemberRow {
  userId: string;
  role: AssetMemberRole;
  invitedBy: string | null;
  createdAt: Date;
  name: string;
  email: string;
  image: string | null;
}

export interface PendingInviteRow {
  id: string;
  email: string;
  role: AssetInviteRole;
  invitedBy: string;
  expiresAt: Date | null;
  createdAt: Date;
}

export type InviteResult =
  | { kind: 'member'; userId: string; role: AssetMemberRole }
  | { kind: 'invite'; inviteId: string; email: string; role: AssetInviteRole }
  | { kind: 'already_member' }
  | { kind: 'already_invited' };

export abstract class AssetMemberService {
  static async getRole(
    assetId: string,
    userId: string,
  ): Promise<AssetMemberRole | null> {
    const [row] = await db()
      .select({ role: assetMembers.role })
      .from(assetMembers)
      .where(
        and(eq(assetMembers.assetId, assetId), eq(assetMembers.userId, userId)),
      );
    return row?.role ?? null;
  }

  static async isOwner(assetId: string, userId: string): Promise<boolean> {
    const role = await AssetMemberService.getRole(assetId, userId);
    return role === 'owner';
  }

  static async isEditor(assetId: string, userId: string): Promise<boolean> {
    const role = await AssetMemberService.getRole(assetId, userId);
    return role === 'owner' || role === 'editor';
  }

  static async listMemberUserIds(assetId: string): Promise<string[]> {
    const rows = await db()
      .select({ userId: assetMembers.userId })
      .from(assetMembers)
      .where(eq(assetMembers.assetId, assetId));
    return rows.map((r) => r.userId);
  }

  /**
   * Fan out a Replicache poke to every member of the asset. Fire-and-forget;
   * call after a sync-relevant write commits. Best-effort — never throws.
   */
  static async pokeMembers(assetId: string): Promise<void> {
    try {
      const userIds = await AssetMemberService.listMemberUserIds(assetId);
      if (userIds.length === 0) return;
      emitReplicachePokes(userIds, assetId);
    } catch (err) {
      console.warn(
        '[asset-members] pokeMembers failed:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  static async list(assetId: string): Promise<{
    members: MemberRow[];
    pendingInvites: PendingInviteRow[];
  }> {
    const members = await db()
      .select({
        userId: assetMembers.userId,
        role: assetMembers.role,
        invitedBy: assetMembers.invitedBy,
        createdAt: assetMembers.createdAt,
        name: userTable.name,
        email: userTable.email,
        image: userTable.image,
      })
      .from(assetMembers)
      .innerJoin(userTable, eq(assetMembers.userId, userTable.id))
      .where(eq(assetMembers.assetId, assetId));

    const invites = await db()
      .select({
        id: assetInvites.id,
        email: assetInvites.email,
        role: assetInvites.role,
        invitedBy: assetInvites.invitedBy,
        expiresAt: assetInvites.expiresAt,
        createdAt: assetInvites.createdAt,
      })
      .from(assetInvites)
      .where(eq(assetInvites.assetId, assetId));

    return {
      members: members as MemberRow[],
      pendingInvites: invites.filter(
        (i): i is PendingInviteRow =>
          i.role === 'editor' || i.role === 'viewer',
      ),
    };
  }

  static async invite(
    assetId: string,
    invitedBy: string,
    email: string,
    role: AssetInviteRole,
  ): Promise<InviteResult> {
    const normalizedEmail = email.trim().toLowerCase();

    const [existingUser] = await db()
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, normalizedEmail));

    if (existingUser) {
      const currentRole = await AssetMemberService.getRole(
        assetId,
        existingUser.id,
      );
      if (currentRole) return { kind: 'already_member' };

      // Insert the membership + its notification row in a single transaction
      // so the invitee cannot end up with access but no bell entry (or the
      // reverse). After commit, fire the Replicache poke so their client
      // pulls immediately.
      await db().transaction(async (tx) => {
        await tx.insert(assetMembers).values({
          assetId,
          userId: existingUser.id,
          role,
          invitedBy,
        });
        await NotificationService.record(tx, {
          type: 'asset.member.added',
          recipientId: existingUser.id,
          actorId: invitedBy,
          assetId,
          body: { role },
        });
      });
      NotificationService.poke(existingUser.id, assetId);
      void AssetMemberService.sendInviteEmailIfPossible({
        to: normalizedEmail,
        actorId: invitedBy,
        assetId,
        role,
        requiresSignup: false,
      });

      return { kind: 'member', userId: existingUser.id, role };
    }

    const [existingInvite] = await db()
      .select({ id: assetInvites.id })
      .from(assetInvites)
      .where(
        and(
          eq(assetInvites.assetId, assetId),
          eq(assetInvites.email, normalizedEmail),
        ),
      );
    if (existingInvite) return { kind: 'already_invited' };

    const [inserted] = await db()
      .insert(assetInvites)
      .values({
        assetId,
        email: normalizedEmail,
        role,
        invitedBy,
      })
      .returning({ id: assetInvites.id });

    if (!inserted) throw new Error('Failed to create invite');
    void AssetMemberService.sendInviteEmailIfPossible({
      to: normalizedEmail,
      actorId: invitedBy,
      assetId,
      role,
      requiresSignup: true,
    });
    return {
      kind: 'invite',
      inviteId: inserted.id,
      email: normalizedEmail,
      role,
    };
  }

  /**
   * Post-commit side effect: fetch actor + asset display info and hand off to
   * the mailer. Intentionally swallows failures — a missing email shouldn't
   * roll back a successful membership insert. Fires asynchronously; callers
   * use `void` to detach.
   */
  private static async sendInviteEmailIfPossible(input: {
    to: string;
    actorId: string;
    assetId: string;
    role: AssetInviteRole;
    requiresSignup: boolean;
  }): Promise<void> {
    try {
      const [row] = await db()
        .select({
          actorName: userTable.name,
          assetTitle: mediaAssets.title,
        })
        .from(userTable)
        .leftJoin(mediaAssets, eq(mediaAssets.id, input.assetId))
        .where(eq(userTable.id, input.actorId));
      if (!row || !row.assetTitle) return;

      const origin = serverEnv().CORS_ORIGIN;
      const targetUrl = input.requiresSignup
        ? `${origin}/signin?email=${encodeURIComponent(input.to)}&redirect=${encodeURIComponent(`/asset/${input.assetId}`)}`
        : `${origin}/asset/${input.assetId}`;
      await sendInviteEmail({
        to: input.to,
        actorName: row.actorName,
        assetTitle: row.assetTitle,
        role: input.role,
        targetUrl,
        requiresSignup: input.requiresSignup,
      });
    } catch (err) {
      console.warn(
        '[asset-members] invite email lookup failed:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  static async removeMember(
    assetId: string,
    userIdToRemove: string,
    removedBy: string,
  ): Promise<{ removed: boolean; reason?: 'owner_protected' | 'not_found' }> {
    const role = await AssetMemberService.getRole(assetId, userIdToRemove);
    if (!role) return { removed: false, reason: 'not_found' };
    if (role === 'owner') return { removed: false, reason: 'owner_protected' };

    await db().transaction(async (tx) => {
      await tx
        .delete(assetMembers)
        .where(
          and(
            eq(assetMembers.assetId, assetId),
            eq(assetMembers.userId, userIdToRemove),
          ),
        );
      await NotificationService.record(tx, {
        type: 'asset.member.removed',
        recipientId: userIdToRemove,
        actorId: removedBy,
        assetId,
      });
    });

    // Poke the removed user so their Replicache pulls immediately and CVR
    // diffing emits `del` ops for every row on this asset. Without this, the
    // removed user's client would keep showing the asset's rows until their
    // next manual pull or page reload. The same poke also delivers the
    // "removed" notification row to their bell.
    try {
      emitReplicachePokes([userIdToRemove], assetId);
    } catch (err) {
      console.warn(
        '[asset-members] revocation poke failed:',
        err instanceof Error ? err.message : err,
      );
    }
    return { removed: true };
  }

  static async revokeInvite(
    assetId: string,
    inviteId: string,
  ): Promise<boolean> {
    const result = await db()
      .delete(assetInvites)
      .where(
        and(eq(assetInvites.id, inviteId), eq(assetInvites.assetId, assetId)),
      )
      .returning({ id: assetInvites.id });
    return result.length > 0;
  }
}
