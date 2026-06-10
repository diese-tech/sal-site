-- Issue #67: make pick submission atomic.
-- The pick route previously validated the turn, inserted the pick, and
-- incremented current_pick_index in separate round-trips, so two
-- simultaneous requests could both pass validation. This function locks
-- the room row and re-validates the pick index under the lock; the loser
-- of the race fails with a conflict instead of corrupting the index.
--
-- The route computes the snake pick sequence in JS and validates turn
-- ownership against p_expected_pick_index before calling; base_order and
-- rounds are immutable while a draft is active, so re-checking the index
-- under the lock is sufficient.

CREATE OR REPLACE FUNCTION public.submit_draft_pick(
  p_draft_room_id        text,
  p_org_id               text,
  p_player_id            text,
  p_expected_pick_index  integer,
  p_total_picks          integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room draft_rooms%ROWTYPE;
  v_next_index integer;
  v_is_complete boolean;
BEGIN
  SELECT * INTO v_room
  FROM draft_rooms
  WHERE id = p_draft_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft not found.';
  END IF;
  IF v_room.status <> 'active' THEN
    RAISE EXCEPTION 'Draft is %, picks are not allowed.', v_room.status;
  END IF;
  IF v_room.current_pick_index <> p_expected_pick_index THEN
    RAISE EXCEPTION 'PICK_CONFLICT: the pick index advanced before this pick was recorded.';
  END IF;

  -- Unique (draft_room_id, player_id) raises if the player is already drafted.
  INSERT INTO draft_picks (draft_room_id, pick_number, org_id, player_id)
  VALUES (p_draft_room_id, p_expected_pick_index + 1, p_org_id, p_player_id);

  v_next_index := p_expected_pick_index + 1;
  v_is_complete := v_next_index >= p_total_picks;

  UPDATE draft_rooms
  SET current_pick_index = v_next_index,
      status = CASE WHEN v_is_complete THEN 'complete' ELSE 'active' END,
      pick_started_at = CASE WHEN v_is_complete THEN NULL ELSE now() END,
      completed_at = CASE WHEN v_is_complete THEN now() ELSE NULL END
  WHERE id = p_draft_room_id;
END;
$$;

-- Server-side only: callable via the service-role key, not by anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.submit_draft_pick(text, text, text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_draft_pick(text, text, text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_draft_pick(text, text, text, integer, integer) FROM authenticated;
