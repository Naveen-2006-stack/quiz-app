-- Allow authenticated users to read report data in student_responses.
-- Needed for Games Played -> View Report to work for students with current schema.

ALTER TABLE public.student_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read student_responses" ON public.student_responses;

CREATE POLICY "Authenticated users can read student_responses"
ON public.student_responses
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- NOTE:
-- For stricter participant-scoped access, add participants.user_id and
-- use auth.uid() = participants.user_id in the SELECT policy.
