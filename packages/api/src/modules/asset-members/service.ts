import { db } from '@milkpod/db';
import {
  assetInvites,
  assetMembers,
  user as userTable,
} from '@milkpod/db/schemas';
import { and, eq } from 'drizzle-orm';
import { emitReplicachePokes } from '../../events/replicache-events';

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

      await db().insert(assetMembers).values({
        assetId,
        userId: existingUser.id,
        role,
        invitedBy,
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
    return {
      kind: 'invite',
      inviteId: inserted.id,
      email: normalizedEmail,
      role,
    };
  }

  static async removeMember(
    assetId: string,
    userIdToRemove: string,
  ): Promise<{ removed: boolean; reason?: 'owner_protected' | 'not_found' }> {
    const role = await AssetMemberService.getRole(assetId, userIdToRemove);
    if (!role) return { removed: false, reason: 'not_found' };
    if (role === 'owner') return { removed: false, reason: 'owner_protected' };

    await db()
      .delete(assetMembers)
      .where(
        and(
          eq(assetMembers.assetId, assetId),
          eq(assetMembers.userId, userIdToRemove),
        ),
      );
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
