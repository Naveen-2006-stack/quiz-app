-- =============================================================================
-- Anti-Cheat: Host-Only Violations Fetch RPC (Persistence Layer v2)
-- =============================================================================
-- Context: participant_violations already stores all cheat events (written by
-- log_violation RPC). This migration adds:
--   1. A host-secured RPC to query violations for any participant in their session.
--   2. A cheat_logs VIEW alias so existing tooling keeps working (optional).
-- =============================================================================

-- 1. Secure RPC: host can fetch violations for any participant in their own session.
--    Security model: SECURITY DEFINER + explicit teacher_id check.
CREATE OR REPLACE FUNCTION public.fetch_violations_for_host(
  p_session_id   UUID,
  p_participant_id UUID
)
RETURNS TABLE (
  id             UUID,
  session_id     UUID,
  participant_id UUID,
  violation_type TEXT,
  created_at     TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only the session's teacher may call this RPC
  IF (SELECT teacher_id FROM live_sessions WHERE id = p_session_id) != auth.uid() THEN
    RAISE EXCEPTION 'Only the session host can view violation logs';
  END IF;

  RETURN QUERY
    SELECT
      pv.id,
      pv.session_id,
      pv.participant_id,
      pv.violation_type,
      pv.created_at
    FROM participant_violations pv
    WHERE pv.session_id     = p_session_id
      AND pv.participant_id = p_participant_id
    ORDER BY pv.created_at DESC;
END;
$$;

-- Grant to authenticated users only (the teacher must be signed in)
GRANT EXECUTE ON FUNCTION public.fetch_violations_for_host(UUID, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fetch_violations_for_host(UUID, UUID) FROM anon;


-- 2. cheat_logs VIEW — convenience alias over participant_violations.
--    Allows the admin dashboard or future tooling to query "cheat_logs" directly
--    without a schema migration if the underlying table name ever changes.
CREATE OR REPLACE VIEW public.cheat_logs AS
  SELECT
    id,
    session_id,
    participant_id,
    violation_type,
    created_at
  FROM public.participant_violations;

-- RLS note: the VIEW inherits the RLS policies of participant_violations.
-- No additional policies needed.
COMMENT ON VIEW public.cheat_logs IS
  'Alias view over participant_violations for backward-compatible tooling access.';
