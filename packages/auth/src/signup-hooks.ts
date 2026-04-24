import { db } from '@milkpod/db';
import {
  assetInvites,
  assetMembers,
  notifications,
} from '@milkpod/db/schemas';
import { and, eq, gt, isNull, or } from 'drizzle-orm';

/**
 * On signup, convert any pending `asset_invite` rows matching the new user's
 * email into real `asset_member` + `notification` rows. Deletes the invite.
 *
 * Everything happens in one transaction per invite so the user never ends up
 * with half-applied state. No Replicache poke is needed — the user's client
 * hasn't initialized yet; its first pull after login picks up everything
 * naturally.
 *
 * Must be invoked from `databaseHooks.user.create.after`. Expired invites
 * (`expires_at <= NOW()`) are silently skipped, matching the spirit of
 * rejecting stale tokens.
 */
export async function claimPendingInvitesOnSignup(
  newUserId: string,
  newUserEmail: string,
): Promise<void> {
  const normalized = newUserEmail.trim().toLowerCase();
  if (!normalized) return;

  try {
    const pending = await db()
      .select({
        id: assetInvites.id,
        assetId: assetInvites.assetId,
        role: assetInvites.role,
        invitedBy: assetInvites.invitedBy,
      })
      .from(assetInvites)
      .where(
        and(
          eq(assetInvites.email, normalized),
          or(
            isNull(assetInvites.expiresAt),
            gt(assetInvites.expiresAt, new Date()),
          ),
        ),
      );

    if (pending.length === 0) return;

    for (const invite of pending) {
      // Skip invites with an invalid role (should never happen given the DB
      // CHECK constraint on asset_invite.role, but defensive: role 'owner'
      // would nonsensically apply here).
      if (invite.role !== 'editor' && invite.role !== 'viewer') continue;

      await db().transaction(async (tx) => {
        // Atomically claim the invite. The expiry predicate is repeated here
        // so an invite that expired between the SELECT above and this tx is
        // still rejected — and a concurrent revoke (DELETE by the owner) is
        // observed as `claimed` being empty. Without this, a revoked/expired
        // invite could still grant membership.
        const [claimed] = await tx
          .delete(assetInvites)
          .where(
            and(
              eq(assetInvites.id, invite.id),
              or(
                isNull(assetInvites.expiresAt),
                gt(assetInvites.expiresAt, new Date()),
              ),
            ),
          )
          .returning({ id: assetInvites.id });
        if (!claimed) return;

        // Idempotent membership insert. If the user was added concurrently by
        // another claim (two invites, or a direct add from the invite flow's
        // existingUser branch that raced with this hook), returning() is
        // empty and we skip the notification to avoid a duplicate.
        const [inserted] = await tx
          .insert(assetMembers)
          .values({
            assetId: invite.assetId,
            userId: newUserId,
            role: invite.role,
            invitedBy: invite.invitedBy,
          })
          .onConflictDoNothing()
          .returning({ userId: assetMembers.userId });
        if (!inserted) return;

        await tx.insert(notifications).values({
          recipientId: newUserId,
          type: 'asset.member.added',
          actorId: invite.invitedBy,
          resourceType: 'asset',
          resourceId: invite.assetId,
          body: { role: invite.role },
        });
      });
    }
  } catch (err) {
    // Logged only — signup itself should not fail because an invite claim hit
    // a transient DB error. Worst case: the invite stays in pending state and
    // the user re-signups or the owner re-invites.
    console.error('[signup] claimPendingInvitesOnSignup failed', {
      newUserId,
      email: normalized,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
