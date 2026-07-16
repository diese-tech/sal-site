-- 025: Shared schema alignment (schema parity audit follow-up).
-- Part 1: matches status CHECK lacks 'forfeit' in production, but the admin
--   match API accepts it and standings consume it — forfeit saves 500 today.
-- Part 2: capture match_reports / player_match_stats DDL, which exists live
--   (created via SQL editor) but in no repo — F-04 unowned-DDL class; folds
--   it into the authoritative sequence per Decision D-1. Idempotent: the
--   live tables already exist, so these are IF NOT EXISTS no-ops in prod.

-- Part 1: allow 'forfeit' match status.
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_status_check;
ALTER TABLE matches ADD CONSTRAINT matches_status_check
  CHECK (status = ANY (ARRAY['scheduled', 'live', 'completed', 'postponed', 'forfeit']));

-- Part 2: capture unowned report-table DDL (matches verified live shape).
CREATE TABLE IF NOT EXISTS match_reports (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  match_id text NOT NULL,
  season_id text NOT NULL,
  division_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  submitted_by text NOT NULL,
  home_score integer,
  away_score integer,
  total_games integer,
  screenshot_urls text[] NOT NULL DEFAULT '{}',
  extracted_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text
);

CREATE TABLE IF NOT EXISTS player_match_stats (
  id uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  match_report_id uuid NOT NULL REFERENCES match_reports(id),
  match_id text NOT NULL,
  player_id text,
  player_ign text NOT NULL,
  game_number integer NOT NULL,
  org_id text,
  won boolean NOT NULL,
  kills integer NOT NULL DEFAULT 0,
  deaths integer NOT NULL DEFAULT 0,
  assists integer NOT NULL DEFAULT 0,
  god_played text,
  role text,
  damage_dealt integer,
  damage_mitigated integer,
  season_id text NOT NULL,
  division_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 016's replace_match_report_stats deletes by match_report_id per submit.
CREATE INDEX IF NOT EXISTS idx_player_match_stats_report ON player_match_stats(match_report_id);
-- The report-create route checks for an existing report by match_id.
CREATE INDEX IF NOT EXISTS idx_match_reports_match ON match_reports(match_id);

-- Deny-by-default (verified matching live state): no public policies, so
-- enabling RLS restricts access to the service role only (003_rls.sql pattern).
ALTER TABLE match_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_match_stats ENABLE ROW LEVEL SECURITY;
