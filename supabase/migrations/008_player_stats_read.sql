-- RLS read policies: player_stats and gods
-- Both tables are created by the salbot migration with RLS enabled but no SELECT policy.
-- Without these, every anon query returns zero rows with no error — a silent data black hole.

CREATE POLICY IF NOT EXISTS "player_stats_public_read" ON player_stats
  FOR SELECT USING (true);

CREATE POLICY IF NOT EXISTS "gods_public_read" ON gods
  FOR SELECT USING (true);
