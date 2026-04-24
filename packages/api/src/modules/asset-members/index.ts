import { Elysia, status } from 'elysia';
import { authMacro } from '../../middleware/auth';
import { AssetMemberModel } from './model';
import { AssetMemberService } from './service';

export const assetMembers = new Elysia({ prefix: '/api/assets' })
  .use(authMacro)
  .guard({ auth: true }, (app) =>
    app
      .get('/:id/members', async ({ params, user }) => {
        const role = await AssetMemberService.getRole(params.id, user.id);
        if (!role) return status(404, { message: 'Asset not found' });
        return AssetMemberService.list(params.id);
      })
      .post(
        '/:id/members',
        async ({ params, body, user }) => {
          const result = await AssetMemberService.invite(
            params.id,
            user.id,
            body.email,
            body.role,
          );
          switch (result.kind) {
            case 'forbidden':
              return status(403, {
                message: 'Only the owner can invite members',
              });
            case 'already_member':
              return status(409, { message: 'User is already a member' });
            case 'already_invited':
              return status(409, {
                message: 'User already has a pending invite',
              });
            case 'member':
            case 'invite':
              return result;
            default: {
              const _exhaustive: never = result;
              throw new Error(
                `Unhandled invite result: ${JSON.stringify(_exhaustive)}`,
              );
            }
          }
        },
        { body: AssetMemberModel.invite },
      )
      .delete('/:id/members/:userId', async ({ params, user }) => {
        const result = await AssetMemberService.removeMember(
          params.id,
          params.userId,
          user.id,
        );
        if (result.removed) return { success: true };
        switch (result.reason) {
          case 'forbidden':
            return status(403, {
              message: 'Only the owner can remove members',
            });
          case 'owner_protected':
            return status(400, { message: 'The owner cannot be removed' });
          case 'not_found':
            return status(404, { message: 'Member not found' });
          default: {
            const _exhaustive: never = result.reason;
            throw new Error(
              `Unhandled remove reason: ${JSON.stringify(_exhaustive)}`,
            );
          }
        }
      })
      .delete('/:id/invites/:inviteId', async ({ params, user }) => {
        const result = await AssetMemberService.revokeInvite(
          params.id,
          params.inviteId,
          user.id,
        );
        if (result.revoked) return { success: true };
        switch (result.reason) {
          case 'forbidden':
            return status(403, {
              message: 'Only the owner can revoke invites',
            });
          case 'not_found':
            return status(404, { message: 'Invite not found' });
          default: {
            const _exhaustive: never = result.reason;
            throw new Error(
              `Unhandled revoke reason: ${JSON.stringify(_exhaustive)}`,
            );
          }
        }
      }),
  );
