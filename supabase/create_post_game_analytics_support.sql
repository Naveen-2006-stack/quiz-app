-- Post-game analytics support (idempotent)
-- Safe to run even if student_responses already exists.

CREATE TABLE IF NOT EXISTS public.student_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  reaction_time_ms INTEGER NOT NULL,
  is_correct BOOLEAN NOT NULL,
  points_awarded INTEGER DEFAULT 0,
  streak_bonus INTEGER DEFAULT 0,
  answered_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prevent accidental duplicate submits for same participant/question in a session.
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_responses_unique_answer
  ON public.student_responses (session_id, participant_id, question_id);

-- Analytics indexes
CREATE INDEX IF NOT EXISTS idx_student_responses_session
  ON public.student_responses (session_id);

CREATE INDEX IF NOT EXISTS idx_student_responses_question
  ON public.student_responses (question_id);

CREATE INDEX IF NOT EXISTS idx_student_responses_participant
  ON public.student_responses (participant_id);

-- Realtime support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'student_responses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.student_responses;
  END IF;
END $$;

ALTER TABLE public.student_responses ENABLE ROW LEVEL SECURITY;

-- Remove broad legacy policies if present.
DROP POLICY IF EXISTS "Anyone can read student_responses" ON public.student_responses;
DROP POLICY IF EXISTS "Anyone can insert student_responses" ON public.student_responses;
DROP POLICY IF EXISTS "Admins can do everything on student_responses" ON public.student_responses;

-- Read policy: session host can read responses for sessions they own.
CREATE POLICY "Hosts can read session responses"
ON public.student_responses
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.live_sessions ls
    WHERE ls.id = student_responses.session_id
      AND ls.teacher_id = auth.uid()
  )
);

-- Insert policy: authenticated participants can submit answers to sessions they joined.
CREATE POLICY "Participants can submit own answers"
ON public.student_responses
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.participants p
    WHERE p.id = student_responses.participant_id
      AND p.session_id = student_responses.session_id
  )
);
