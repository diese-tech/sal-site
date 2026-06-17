-- Issue #129: make the timer-expiry auto-skip atomic.
-- Multiple polling clients can simultaneously observe an expired timer and each
-- call updateDraftRoom(); without a lock the index advances twice, silently
-- skipping the next captain's turn.
-- This function locks the room row, re-validates that current_pick_index is
-- still the expected value AND that the timer is genuinely still expired under
-- the lock, then advances in one transaction. Losing racers receive advance=false
-- and no-op.

CREATE OR REPLACE FUNCTION public.advance_pick_on_timeout(
  p_draft_room_id      text,
  p_expected_pick_index integer,
  p_total_picks        integer
)
RETURNS boolean   -- true = this caller advanced the index; false = already advanced
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room   draft_rooms%ROWTYPE;
  v_elapsed float8;
  v_next   integer;
  v_complete boolean;
BEGIN
  SELECT * INTO v_room
  FROM draft_rooms
  WHERE id = p_draft_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft room not found.';
  END IF;

  -- If another racer already advanced the index, this caller is a no-op.
  IF v_room.current_pick_index <> p_expected_pick_index THEN
    RETURN false;
  END IF;

  IF v_room.status <> 'active' THEN
    RETURN false;
  END IF;

  -- Re-validate timer expiry under the lock.
  IF v_room.pick_started_at IS NULL OR v_room.pick_timer_seconds <= 0 THEN
    RETURN false;
  END IF;

  v_elapsed := EXTRACT(EPOCH FROM (now() - v_room.pick_started_at));
  IF v_elapsed < v_room.pick_timer_seconds THEN
    RETURN false;
  END IF;

  v_next     := p_expected_pick_index + 1;
  v_complete := v_next >= p_total_picks;

  UPDATE draft_rooms
  SET current_pick_index = v_next,
      status             = CASE WHEN v_complete THEN 'complete' ELSE 'active' END,
      pick_started_at    = CASE WHEN v_complete THEN NULL ELSE now() END,
      completed_at       = CASE WHEN v_complete THEN now() ELSE NULL END
  WHERE id = p_draft_room_id;

  RETURN true;
END;
$$;

-- Server-side only.
REVOKE EXECUTE ON FUNCTION public.advance_pick_on_timeout(text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.advance_pick_on_timeout(text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.advance_pick_on_timeout(text, integer, integer) FROM authenticated;
