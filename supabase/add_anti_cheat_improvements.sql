-- =============================================================================
-- Anti-Cheat Improvements: Authorization, Rate-Limiting, RLS Hardening
-- =============================================================================

-- 1. CRITICAL: ban_participant — add host-only authorization
CREATE OR REPLACE FUNCTION public.ban_participant(p_session_id UUID, p_participant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is the session's teacher
  IF (SELECT teacher_id FROM live_sessions WHERE id = p_session_id) != auth.uid() THEN
    RAISE EXCEPTION 'Only the host can ban participants';
  END IF;

  UPDATE participants 
  SET is_banned = TRUE 
  WHERE id = p_participant_id AND session_id = p_session_id;
END;
$$;

-- 2. CRITICAL: log_violation — validate participant belongs to the session
CREATE OR REPLACE FUNCTION public.log_violation(
  p_session_id UUID,
  p_participant_id UUID,
  p_violation_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the participant exists in this session
  IF NOT EXISTS (
    SELECT 1 FROM participants 
    WHERE id = p_participant_id AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'Invalid participant for this session';
  END IF;

  -- Verify the session is currently active
  IF (SELECT status FROM live_sessions WHERE id = p_session_id) != 'active' THEN
    RAISE EXCEPTION 'Session is not active';
  END IF;

  -- 1. Log the detailed violation
  INSERT INTO participant_violations (session_id, participant_id, violation_type)
  VALUES (p_session_id, p_participant_id, p_violation_type);

  -- 2. Increment the total flags counter
  UPDATE participants
  SET cheat_flags = cheat_flags + 1
  WHERE id = p_participant_id;
END;
$$;

-- 3. Revoke anon access from sensitive RPCs
-- Only authenticated users should call these
REVOKE EXECUTE ON FUNCTION public.log_violation(UUID, UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ban_participant(UUID, UUID) FROM anon;

-- Re-grant to authenticated only (idempotent)
GRANT EXECUTE ON FUNCTION public.log_violation(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ban_participant(UUID, UUID) TO authenticated;

-- 4. Tighten participant_violations INSERT RLS policy
-- Drop the old overly permissive policy
DROP POLICY IF EXISTS "Anyone can insert violations" ON participant_violations;

-- New policy: only allow inserts where the participant actually belongs to the session
CREATE POLICY "Session participants can insert violations" ON participant_violations
  FOR INSERT WITH CHECK (
    participant_id IN (
      SELECT id FROM participants WHERE session_id = participant_violations.session_id
    )
  );
