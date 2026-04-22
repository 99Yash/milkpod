import { Elysia, status } from 'elysia';
import { authMacro } from '../../middleware/auth';
import { AssetMemberModel } from './model';
import { AssetMemberService } from './service';

export const assetMembers = new Elysia({ prefix: '/api/assets' })
  .use(authMacro)
  .get(
    '/:id/members',
    async ({ params, user }) => {
      const role = await AssetMemberService.getRole(params.id, user.id);
      if (!role) return status(404, { message: 'Asset not found' });
      return AssetMemberService.list(params.id);
    },
    { auth: true },
  )
  .post(
    '/:id/members',
    async ({ params, body, user }) => {
      const isOwner = await AssetMemberService.isOwner(params.id, user.id);
      if (!isOwner) {
        return status(403, { message: 'Only the owner can invite members' });
      }

      const result = await AssetMemberService.invite(
        params.id,
        user.id,
        body.email,
        body.role,
      );

      if (result.kind === 'already_member') {
        return status(409, { message: 'User is already a member' });
      }
      if (result.kind === 'already_invited') {
        return status(409, { message: 'User already has a pending invite' });
      }
      return result;
    },
    { auth: true, body: AssetMemberModel.invite },
  )
  .delete(
    '/:id/members/:userId',
    async ({ params, user }) => {
      const isOwner = await AssetMemberService.isOwner(params.id, user.id);
      if (!isOwner) {
        return status(403, { message: 'Only the owner can remove members' });
      }
      const result = await AssetMemberService.removeMember(
        params.id,
        params.userId,
      );
      if (!result.removed) {
        if (result.reason === 'owner_protected') {
          return status(400, { message: 'The owner cannot be removed' });
        }
        return status(404, { message: 'Member not found' });
      }
      return { success: true };
    },
    { auth: true },
  )
  .delete(
    '/:id/invites/:inviteId',
    async ({ params, user }) => {
      const isOwner = await AssetMemberService.isOwner(params.id, user.id);
      if (!isOwner) {
        return status(403, { message: 'Only the owner can revoke invites' });
      }
      const revoked = await AssetMemberService.revokeInvite(
        params.id,
        params.inviteId,
      );
      if (!revoked) return status(404, { message: 'Invite not found' });
      return { success: true };
    },
    { auth: true },
  );
