-- Issue #60: enforce at the database level that at most one season is active.
-- The API routes already guard against this, but a constraint closes the race
-- between two concurrent activations and protects against direct writes.

-- If existing data violates the constraint, keep the most recently started
-- active season and demote the rest to offseason.
UPDATE seasons
SET status = 'offseason'
WHERE status = 'active'
  AND id NOT IN (
    SELECT id FROM seasons
    WHERE status = 'active'
    ORDER BY start_date DESC, id DESC
    LIMIT 1
  );

CREATE UNIQUE INDEX IF NOT EXISTS seasons_single_active
  ON seasons (status)
  WHERE status = 'active';
