-- Enforce participant leave lockout and secure leave logging.

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS participants_session_user_idx
  ON public.participants (session_id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS participants_session_user_unique
  ON public.participants (session_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.mark_participant_left(
  p_session_id UUID,
  p_participant_id UUID,
  p_reason TEXT DEFAULT 'Left session during active quiz'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.participants p
    LEFT JOIN public.live_sessions s ON s.id = p.session_id
    WHERE p.id = p_participant_id
      AND p.session_id = p_session_id
      AND (p.user_id = auth.uid() OR s.teacher_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized to mark this participant as left';
  END IF;

  UPDATE public.participants
  SET
    is_banned = TRUE,
    cheat_flags = COALESCE(cheat_flags, 0) + 1,
    last_active = NOW()
  WHERE id = p_participant_id
    AND session_id = p_session_id
    AND is_banned = FALSE;

  IF FOUND THEN
    INSERT INTO public.participant_violations (session_id, participant_id, violation_type)
    VALUES (p_session_id, p_participant_id, COALESCE(NULLIF(TRIM(p_reason), ''), 'Left session during active quiz'));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_participant_left(UUID, UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_participant_left(UUID, UUID, TEXT) FROM anon;