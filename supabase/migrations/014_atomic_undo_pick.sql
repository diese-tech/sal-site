-- Issue #61: make draft undo atomic.
-- undoLastPick() previously deleted the last pick and decremented
-- current_pick_index in separate round-trips; a pick submitted between the
-- two saw an inconsistent room state. This function locks the room row and
-- performs the whole undo in one transaction.

CREATE OR REPLACE FUNCTION public.undo_last_pick(p_draft_room_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room draft_rooms%ROWTYPE;
  v_deleted integer;
BEGIN
  SELECT * INTO v_room
  FROM draft_rooms
  WHERE id = p_draft_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft room not found.';
  END IF;
  IF v_room.status <> 'active' THEN
    RAISE EXCEPTION 'Draft is not active.';
  END IF;
  IF v_room.current_pick_index <= 0 THEN
    RAISE EXCEPTION 'No picks to undo.';
  END IF;

  DELETE FROM draft_picks
  WHERE id = (
    SELECT id FROM draft_picks
    WHERE draft_room_id = p_draft_room_id
    ORDER BY pick_number DESC
    LIMIT 1
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'No picks found to undo.';
  END IF;

  UPDATE draft_rooms
  SET current_pick_index = v_room.current_pick_index - 1,
      pick_started_at = now()
  WHERE id = p_draft_room_id;
END;
$$;

-- Server-side only: callable via the service-role key, not by anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.undo_last_pick(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.undo_last_pick(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.undo_last_pick(text) FROM authenticated;
