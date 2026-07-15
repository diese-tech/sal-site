-- F-02a: Prevent duplicate pending match results at the database level.
-- Without this, two /report-result submissions for the same match create two
-- independently approvable pending_actions rows, and a second approval can
-- silently overwrite the official result. See issue #152.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_match_result_unique
  ON pending_actions (match_id)
  WHERE status IN ('pending','pending_info') AND type = 'match_result';
