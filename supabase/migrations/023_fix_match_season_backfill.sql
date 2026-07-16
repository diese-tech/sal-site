-- 023: Fix 021's single-season backfill (#140) + idempotency guard for 021's SET NOT NULL (#144).

-- Part 1 (#140): re-derive season_id from seasons date ranges for any match whose
-- assigned season's range doesn't contain scheduled_date (i.e. misassigned by 021's
-- most-recent-season fallback). No-op on uncorrupted data.
UPDATE matches m
SET season_id = correct.id
FROM seasons assigned, LATERAL (
  SELECT s.id
  FROM seasons s
  WHERE m.scheduled_date >= s.start_date
    AND m.scheduled_date <= s.end_date
  ORDER BY s.start_date DESC
  LIMIT 1
) AS correct
WHERE m.season_id = assigned.id
  AND (m.scheduled_date < assigned.start_date OR m.scheduled_date > assigned.end_date)
  AND correct.id IS NOT NULL;

-- Part 2 (#144): rerunnable version of 021's SET NOT NULL — no-op when already constrained.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='matches'
      AND column_name='season_id'
      AND is_nullable='YES'
  ) THEN
    ALTER TABLE matches ALTER COLUMN season_id SET NOT NULL;
  END IF;
END $$;
