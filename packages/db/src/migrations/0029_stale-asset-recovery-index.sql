-- Partial index for the startup stale-asset recovery query.
-- Covers: WHERE status IN ('queued','fetching','transcribing','embedding') AND updated_at < cutoff
CREATE INDEX CONCURRENTLY IF NOT EXISTS "media_asset_stale_recovery_idx"
  ON "media_asset" ("status", "updated_at")
  WHERE "status" IN ('queued', 'fetching', 'transcribing', 'embedding');
