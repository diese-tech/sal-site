-- Enforce NOT NULL on matches.season_id — all matches must belong to a season.
-- The application auto-assigns matches to the active season if not provided,
-- so this constraint should not break existing workflows. Any pre-existing
-- NULL rows must be backfilled before this migration runs.

ALTER TABLE matches
  ALTER COLUMN season_id SET NOT NULL;

-- Add composite index for season-scoped standings queries.
CREATE INDEX IF NOT EXISTS idx_matches_season_division ON matches(season_id, division_id);
