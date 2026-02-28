-- The UNIQUE constraint "daily_usage_user_date_uniq" already creates an implicit
-- btree index on (user_id, usage_date). This explicit index is redundant and adds
-- unnecessary write overhead.
DROP INDEX IF EXISTS "daily_usage_user_date_idx";
