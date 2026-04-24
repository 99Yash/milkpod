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

/**
 * Default lifetime for pending invites. Stale pending invites are a quiet
 * risk: an owner who changes their mind can revoke explicitly, but an
 * abandoned invite that sits in the table for months could grant access to
 * an email address that got reused (employee left, personal account
 * repurposed). 14 days matches common SaaS norms (GitHub ~7, Slack none,
 * Linear 30) and is long enough for realistic email delivery + human delay.
 * The schema allows `null` expiry for callers that want to opt out.
 */
const INVITE_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000;

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
  | { kind: 'already_invited' }
  | { kind: 'forbidden' };

export type RemoveMemberResult =
  | { removed: true }
  | { removed: false; reason: 'owner_protected' | 'not_found' | 'forbidden' };

export type RevokeInviteResult =
  | { revoked: true }
  | { revoked: false; reason: 'not_found' | 'forbidden' };

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
        err instanceof Error ? err.message : String(err),
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

    const pendingInvites = await db()
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

    // `assetInvites.role` is narrowed to `'editor' | 'viewer'` via `$type<>()`
    // in the schema and enforced at the DB via a CHECK constraint (migration
    // 0034), so no runtime filter is needed here.
    return { members, pendingInvites };
  }

  static async invite(
    assetId: string,
    invitedBy: string,
    email: string,
    role: AssetInviteRole,
  ): Promise<InviteResult> {
    // Service-layer authz: only owners can invite. The router also checks,
    // but enforcing here guarantees no future caller (sync mutators, admin
    // tools, etc.) can skip the rule.
    const callerRole = await AssetMemberService.getRole(assetId, invitedBy);
    if (callerRole !== 'owner') return { kind: 'forbidden' };

    const normalizedEmail = email.trim().toLowerCase();

    const [existingUser] = await db()
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, normalizedEmail));

    if (existingUser) {
      // Insert the membership + its notification row in a single transaction
      // so the invitee cannot end up with access but no bell entry (or the
      // reverse). `onConflictDoNothing` on the (assetId, userId) PK closes
      // the TOCTOU race between the existence check and the insert — two
      // concurrent invites can no longer produce a 500.
      const inserted = await db().transaction(async (tx) => {
        const [row] = await tx
          .insert(assetMembers)
          .values({
            assetId,
            userId: existingUser.id,
            role,
            invitedBy,
          })
          .onConflictDoNothing()
          .returning({ userId: assetMembers.userId });
        if (!row) return null;
        await NotificationService.record(tx, {
          type: 'asset.member.added',
          recipientId: existingUser.id,
          actorId: invitedBy,
          assetId,
          body: { role },
        });
        return row;
      });
      if (!inserted) return { kind: 'already_member' };

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

    // No user row yet — create a pending invite. `onConflictDoNothing` on the
    // unique (assetId, email) constraint replaces the check-then-insert
    // pattern so concurrent invites produce `already_invited` instead of a
    // unique-violation 500.
    const [inserted] = await db()
      .insert(assetInvites)
      .values({
        assetId,
        email: normalizedEmail,
        role,
        invitedBy,
        expiresAt: new Date(Date.now() + INVITE_EXPIRY_MS),
      })
      .onConflictDoNothing({
        target: [assetInvites.assetId, assetInvites.email],
      })
      .returning({ id: assetInvites.id });

    if (!inserted) return { kind: 'already_invited' };

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
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  static async removeMember(
    assetId: string,
    userIdToRemove: string,
    removedBy: string,
  ): Promise<RemoveMemberResult> {
    // Service-layer authz: only owners can remove members. Check BEFORE the
    // target lookup so non-owners can't probe membership by trial.
    const callerRole = await AssetMemberService.getRole(assetId, removedBy);
    if (callerRole !== 'owner') return { removed: false, reason: 'forbidden' };

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
        err instanceof Error ? err.message : String(err),
      );
    }
    return { removed: true };
  }

  static async revokeInvite(
    assetId: string,
    inviteId: string,
    revokedBy: string,
  ): Promise<RevokeInviteResult> {
    // Service-layer authz: only owners can revoke invites.
    const callerRole = await AssetMemberService.getRole(assetId, revokedBy);
    if (callerRole !== 'owner') return { revoked: false, reason: 'forbidden' };

    const result = await db()
      .delete(assetInvites)
      .where(
        and(eq(assetInvites.id, inviteId), eq(assetInvites.assetId, assetId)),
      )
      .returning({ id: assetInvites.id });
    if (result.length === 0) return { revoked: false, reason: 'not_found' };
    return { revoked: true };
  }
}
