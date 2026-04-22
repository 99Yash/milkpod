-- Seed asset_member rows for every existing media_asset, granting its creator 'owner'.
-- Idempotent via ON CONFLICT — safe to re-run.
INSERT INTO "asset_member" ("asset_id", "user_id", "role", "invited_by", "created_at", "updated_at")
SELECT "id", "user_id", 'owner', NULL, "created_at", "created_at"
FROM "media_asset"
ON CONFLICT ("asset_id", "user_id") DO NOTHING;
