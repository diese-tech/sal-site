-- Enforce NOT NULL on matches.season_id — all matches must belong to a season.
-- Backfill any legacy NULL rows to the most recent season before setting the
-- constraint, so the migration is safe on databases that already have matches
-- from before this enforcement was introduced.

UPDATE matches
SET season_id = (
  SELECT id FROM seasons
  ORDER BY start_date DESC
  LIMIT 1
)
WHERE season_id IS NULL;

ALTER TABLE matches
  ALTER COLUMN season_id SET NOT NULL;

-- Add composite index for season-scoped standings queries.
CREATE INDEX IF NOT EXISTS idx_matches_season_division ON matches(season_id, division_id);
