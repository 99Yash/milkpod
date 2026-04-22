-- Idempotent backfill for any media_asset that doesn't yet have an owner-row
-- in asset_member. The original 0031 backfill covered assets that existed
-- BEFORE asset_member was introduced, but assets created AFTER that migration
-- (and before AssetService.create started seeding memberships) were missed.
-- Running this ensures every owner is also a member before the next deploy.

INSERT INTO "asset_member" ("asset_id", "user_id", "role", "invited_by", "created_at", "updated_at")
SELECT ma."id", ma."user_id", 'owner', NULL, ma."created_at", ma."created_at"
FROM "media_asset" ma
LEFT JOIN "asset_member" am
  ON am."asset_id" = ma."id" AND am."user_id" = ma."user_id"
WHERE am."user_id" IS NULL
ON CONFLICT ("asset_id", "user_id") DO NOTHING;
