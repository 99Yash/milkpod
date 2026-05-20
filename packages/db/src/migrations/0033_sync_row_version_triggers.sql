-- Bump row_version on every UPDATE to synced tables so the CVR diff notices changes.
-- INSERT uses the column default (0) which is fine: the row isn't in any prior CVR
-- snapshot, so the diff emits 'put' based on presence, not row_version.

CREATE OR REPLACE FUNCTION bump_row_version() RETURNS TRIGGER AS $$
BEGIN
  NEW.row_version = COALESCE(OLD.row_version, 0) + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS asset_moment_row_version_bump ON "asset_moment";
--> statement-breakpoint
CREATE TRIGGER asset_moment_row_version_bump
BEFORE UPDATE ON "asset_moment"
FOR EACH ROW EXECUTE FUNCTION bump_row_version();
--> statement-breakpoint
DROP TRIGGER IF EXISTS asset_comment_row_version_bump ON "asset_comment";
--> statement-breakpoint
CREATE TRIGGER asset_comment_row_version_bump
BEFORE UPDATE ON "asset_comment"
FOR EACH ROW EXECUTE FUNCTION bump_row_version();
