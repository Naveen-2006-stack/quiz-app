-- Remove role-based restrictions for quiz creation/editing.
-- After running this, any authenticated user can create quizzes,
-- and only the quiz owner (teacher_id) can update/delete their rows.

ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

-- 1) Drop old quizzes policies (role-based and legacy owner policies)
DROP POLICY IF EXISTS "Admins can do everything on quizzes" ON public.quizzes;
DROP POLICY IF EXISTS "Teachers can read all quizzes" ON public.quizzes;
DROP POLICY IF EXISTS "Teachers can manage own quizzes" ON public.quizzes;
DROP POLICY IF EXISTS "Teachers can insert quizzes" ON public.quizzes;
DROP POLICY IF EXISTS "Anyone can read quizzes" ON public.quizzes;
DROP POLICY IF EXISTS "Authenticated users can insert quizzes" ON public.quizzes;
DROP POLICY IF EXISTS "Owners can update quizzes" ON public.quizzes;
DROP POLICY IF EXISTS "Owners can delete quizzes" ON public.quizzes;

-- 2) Drop old questions policies (legacy teacher naming)
DROP POLICY IF EXISTS "Anyone can read questions" ON public.questions;
DROP POLICY IF EXISTS "Teachers can insert questions" ON public.questions;
DROP POLICY IF EXISTS "Teachers can update questions" ON public.questions;
DROP POLICY IF EXISTS "Teachers can delete questions" ON public.questions;
DROP POLICY IF EXISTS "Owners can insert questions" ON public.questions;
DROP POLICY IF EXISTS "Owners can update questions" ON public.questions;
DROP POLICY IF EXISTS "Owners can delete questions" ON public.questions;

-- 3) New quizzes policies
CREATE POLICY "Anyone can read quizzes"
ON public.quizzes
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can insert quizzes"
ON public.quizzes
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND teacher_id = auth.uid()
);

CREATE POLICY "Owners can update quizzes"
ON public.quizzes
FOR UPDATE
USING (teacher_id = auth.uid())
WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Owners can delete quizzes"
ON public.quizzes
FOR DELETE
USING (teacher_id = auth.uid());

-- 4) New questions policies (owner = owner of parent quiz)
CREATE POLICY "Anyone can read questions"
ON public.questions
FOR SELECT
USING (true);

CREATE POLICY "Owners can insert questions"
ON public.questions
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.quizzes q
    WHERE q.id = quiz_id
      AND q.teacher_id = auth.uid()
  )
);

CREATE POLICY "Owners can update questions"
ON public.questions
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.quizzes q
    WHERE q.id = quiz_id
      AND q.teacher_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.quizzes q
    WHERE q.id = quiz_id
      AND q.teacher_id = auth.uid()
  )
);

CREATE POLICY "Owners can delete questions"
ON public.questions
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.quizzes q
    WHERE q.id = quiz_id
      AND q.teacher_id = auth.uid()
  )
);
