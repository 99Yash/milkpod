-- Bump row_version on every UPDATE so the Replicache CVR diff notices changes.
-- Mark-read mutations use this trigger: setting read_at flips row_version, the
-- next pull diffs it, and every client in the group gets the new state.

DROP TRIGGER IF EXISTS notification_row_version_bump ON "notification";
--> statement-breakpoint
CREATE TRIGGER notification_row_version_bump
BEFORE UPDATE ON "notification"
FOR EACH ROW EXECUTE FUNCTION bump_row_version();
