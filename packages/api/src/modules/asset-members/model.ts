import { t } from 'elysia';

export namespace AssetMemberModel {
  export const invite = t.Object({
    email: t.String({ format: 'email', maxLength: 320 }),
    role: t.Union([t.Literal('editor'), t.Literal('viewer')]),
  });
  export type Invite = typeof invite.static;

  export const member = t.Object({
    userId: t.String(),
    role: t.Union([
      t.Literal('owner'),
      t.Literal('editor'),
      t.Literal('viewer'),
    ]),
    invitedBy: t.Nullable(t.String()),
    createdAt: t.Date(),
    name: t.String(),
    email: t.String(),
    image: t.Nullable(t.String()),
  });

  export const pendingInvite = t.Object({
    id: t.String(),
    email: t.String(),
    role: t.Union([t.Literal('editor'), t.Literal('viewer')]),
    invitedBy: t.String(),
    expiresAt: t.Nullable(t.Date()),
    createdAt: t.Date(),
  });

  export const list = t.Object({
    members: t.Array(member),
    pendingInvites: t.Array(pendingInvite),
  });
}
