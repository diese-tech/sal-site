-- Mirror: season_id column on matches
-- Mirrors the salbot migration's season_id addition on the shared Supabase database.
-- IF NOT EXISTS guards make this idempotent regardless of which migration runs first.

ALTER TABLE matches ADD COLUMN IF NOT EXISTS season_id TEXT REFERENCES seasons(id);
CREATE INDEX IF NOT EXISTS idx_matches_season ON matches(season_id);
