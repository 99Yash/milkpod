-- Defense-in-depth: the API layer already restricts invite roles to
-- editor/viewer, but `asset_invite.role` shares the `asset_member_role`
-- enum which also includes 'owner'. A privileged caller bypassing the API
-- could otherwise write an owner invite. This CHECK makes the DB itself
-- refuse it.

ALTER TABLE "asset_invite"
  ADD CONSTRAINT "asset_invite_role_not_owner"
  CHECK (role IN ('editor', 'viewer'));
