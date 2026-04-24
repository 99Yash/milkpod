-- Harden `bump_row_version()` with a no-op guard so semantic no-op UPDATEs
-- don't bump row_version and cause the next CVR diff to emit redundant
-- `put` patches. We can't use a trigger-level WHEN (OLD.* IS DISTINCT FROM
-- NEW.*) because Drizzle's `$onUpdate` auto-bumps `updated_at` on every
-- UPDATE, so OLD != NEW even for semantic no-ops. Instead, compare the
-- row's jsonb projection minus the metadata columns (row_version, updated_at)
-- that we don't want to count as a "real change".

CREATE OR REPLACE FUNCTION bump_row_version() RETURNS TRIGGER AS $$
BEGIN
  IF (to_jsonb(NEW) - 'row_version' - 'updated_at')
     IS NOT DISTINCT FROM (to_jsonb(OLD) - 'row_version' - 'updated_at')
  THEN
    NEW.row_version = OLD.row_version;
    RETURN NEW;
  END IF;
  NEW.row_version = COALESCE(OLD.row_version, 0) + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
