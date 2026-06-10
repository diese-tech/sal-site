-- Issue #68: persist recalculated standings atomically.
-- recalculateAndPersistStandings() previously upserted new rows and deleted
-- orphans in two round-trips, so a concurrent read between them saw a mix
-- of new and old standings. This function replaces the standings table
-- contents in a single transaction; readers see either the old or the new
-- snapshot, never a blend.

CREATE OR REPLACE FUNCTION public.replace_standings(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM standings
  WHERE org_id NOT IN (
    SELECT item.org_id FROM jsonb_to_recordset(p_rows) AS item(org_id text)
  );

  INSERT INTO standings (
    org_id, division_id, wins, losses, matches_played,
    points_for, points_against, streak, games_back
  )
  SELECT
    item.org_id, item.division_id, item.wins, item.losses,
    item.matches_played, item.points_for, item.points_against,
    item.streak, item.games_back
  FROM jsonb_to_recordset(p_rows) AS item(
    org_id text,
    division_id text,
    wins integer,
    losses integer,
    matches_played integer,
    points_for integer,
    points_against integer,
    streak jsonb,
    games_back numeric
  )
  ON CONFLICT (org_id) DO UPDATE SET
    division_id = EXCLUDED.division_id,
    wins = EXCLUDED.wins,
    losses = EXCLUDED.losses,
    matches_played = EXCLUDED.matches_played,
    points_for = EXCLUDED.points_for,
    points_against = EXCLUDED.points_against,
    streak = EXCLUDED.streak,
    games_back = EXCLUDED.games_back;
END;
$$;

-- Server-side only: callable via the service-role key, not by anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.replace_standings(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.replace_standings(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.replace_standings(jsonb) FROM authenticated;
