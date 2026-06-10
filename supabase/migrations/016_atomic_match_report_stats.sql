-- Issue #69: make match-report stat replacement atomic.
-- The submit route previously deleted all player_match_stats rows for a
-- report and inserted the new ones in separate queries; two admins
-- submitting simultaneously could interleave delete/insert and double the
-- stat rows. This function locks the match_reports row (serializing
-- concurrent submits for the same report) and performs delete + insert in
-- a single transaction.

-- match_reports.id / player_match_stats.match_report_id are uuid columns,
-- so the parameter is uuid (PostgREST coerces the JSON string id).
CREATE OR REPLACE FUNCTION public.replace_match_report_stats(
  p_match_report_id uuid,
  p_rows jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM 1 FROM match_reports WHERE id = p_match_report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found.';
  END IF;

  DELETE FROM player_match_stats WHERE match_report_id = p_match_report_id;

  INSERT INTO player_match_stats (
    match_report_id, match_id, player_id, player_ign, game_number, org_id,
    won, kills, deaths, assists, god_played, role,
    damage_dealt, damage_mitigated, season_id, division_id
  )
  SELECT
    p_match_report_id, item.match_id, item.player_id, item.player_ign,
    item.game_number, item.org_id, item.won, item.kills, item.deaths,
    item.assists, item.god_played, item.role, item.damage_dealt,
    item.damage_mitigated, item.season_id, item.division_id
  FROM jsonb_to_recordset(p_rows) AS item(
    match_id text,
    player_id text,
    player_ign text,
    game_number integer,
    org_id text,
    won boolean,
    kills integer,
    deaths integer,
    assists integer,
    god_played text,
    role text,
    damage_dealt integer,
    damage_mitigated integer,
    season_id text,
    division_id text
  );
END;
$$;

-- Server-side only: callable via the service-role key, not by anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.replace_match_report_stats(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.replace_match_report_stats(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.replace_match_report_stats(uuid, jsonb) FROM authenticated;
