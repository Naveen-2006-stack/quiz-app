-- =============================================================================
--  Ghost Mode: Secure RPC for participant-based lookup (UPDATED)
--  Run this in Supabase SQL Editor
-- =============================================================================

CREATE OR REPLACE FUNCTION get_ghost_mode_for_participant(
  p_session_id UUID,
  p_device_uuid UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ghost_mode BOOLEAN;
  v_role TEXT;
BEGIN
  -- Primary path: the calling user IS authenticated
  -- Any user with 'teacher' or 'admin' role automatically gets ghost mode (they are hosting/testing)
  -- Or explicit ghost_mode = true for students
  SELECT ghost_mode, role::text
  INTO v_ghost_mode, v_role
  FROM profiles
  WHERE id = auth.uid()
  LIMIT 1;

  IF FOUND THEN
    IF v_role = 'teacher' OR v_role = 'admin' OR v_ghost_mode = TRUE THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- Fallback: unauthenticated guest → no ghost mode
  RETURN FALSE;
END;
$$;

-- Grant execute to authenticated and anonymous users
GRANT EXECUTE ON FUNCTION get_ghost_mode_for_participant(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ghost_mode_for_participant(UUID, UUID) TO anon;
