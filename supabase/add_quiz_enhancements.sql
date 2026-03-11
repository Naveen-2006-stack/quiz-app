-- =============================================================================
-- Quiz Enhancements: Multi-sub prevention, Notes, Violation History
-- =============================================================================

-- 1. Prevent Multiple Submissions
-- Add a unique constraint to ensure a participant can only answer a question once per session
ALTER TABLE public.student_responses 
ADD CONSTRAINT unique_submission_per_question UNIQUE (session_id, participant_id, question_id);

-- 2. Participant Notes
ALTER TABLE public.participants
ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

-- RPC to update notes securely
CREATE OR REPLACE FUNCTION public.update_participant_notes(
  p_session_id UUID,
  p_participant_id UUID,
  p_notes TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Security check: only allow updating notes if the session is still in 'waiting' status
  IF (SELECT status FROM live_sessions WHERE id = p_session_id) != 'waiting' THEN
    RETURN;
  END IF;

  -- Ensure they are updating their own notes
  UPDATE participants 
  SET notes = p_notes 
  WHERE id = p_participant_id AND session_id = p_session_id;
END;
$$;

-- 3. Violations History
CREATE TABLE IF NOT EXISTS public.participant_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES live_sessions(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES participants(id) ON DELETE CASCADE,
  violation_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Realtime for host monitoring
ALTER PUBLICATION supabase_realtime ADD TABLE participant_violations;

-- RLS for participant_violations (Basic scaffolding)
ALTER TABLE participant_violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert violations" ON participant_violations
  FOR INSERT WITH CHECK (session_id IN (SELECT id FROM live_sessions));

CREATE POLICY "Hosts can read violations" ON participant_violations
  FOR SELECT USING (
    session_id IN (
      SELECT id FROM live_sessions WHERE teacher_id = auth.uid()
    )
  );

-- Replace the old increment_cheat_flags RPC
DROP FUNCTION IF EXISTS public.increment_cheat_flags(UUID);

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
  -- 1. Log the detailed violation
  INSERT INTO participant_violations (session_id, participant_id, violation_type)
  VALUES (p_session_id, p_participant_id, p_violation_type);

  -- 2. Increment the total flags counter
  UPDATE participants
  SET cheat_flags = cheat_flags + 1
  WHERE id = p_participant_id;
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.update_participant_notes(UUID, UUID, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.log_violation(UUID, UUID, TEXT) TO authenticated, anon;
