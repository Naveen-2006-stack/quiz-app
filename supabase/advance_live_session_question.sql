-- Secure host-only advancement for live quiz progress.
-- This keeps question progression authoritative on the server instead of
-- relying on a direct client update that can fail under RLS or stale state.

CREATE OR REPLACE FUNCTION public.advance_live_session_question(
  p_session_id UUID,
  p_next_question_index INTEGER,
  p_finish BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner BOOLEAN;
  v_rows INTEGER;
BEGIN
  v_is_owner := EXISTS (
    SELECT 1
    FROM public.live_sessions
    WHERE id = p_session_id
      AND teacher_id = auth.uid()
  );

  IF COALESCE(v_is_owner, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Only the session host can advance the quiz';
  END IF;

  UPDATE public.live_sessions
  SET
    current_question_index = p_next_question_index,
    status = CASE
      WHEN p_finish THEN 'finished'::session_status
      ELSE 'active'::session_status
    END,
    finished_at = CASE
      WHEN p_finish THEN NOW()
      ELSE finished_at
    END,
    last_activity_at = NOW()
  WHERE id = p_session_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.advance_live_session_question(UUID, INTEGER, BOOLEAN) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.advance_live_session_question(UUID, INTEGER, BOOLEAN) FROM anon;