-- Add support for question_type: mcq | true_false
-- Run in Supabase SQL Editor for existing databases.

ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS question_type TEXT;

ALTER TABLE public.questions
ALTER COLUMN question_type SET DEFAULT 'mcq';

UPDATE public.questions
SET question_type = 'mcq'
WHERE question_type IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'questions_question_type_check'
  ) THEN
    ALTER TABLE public.questions
    ADD CONSTRAINT questions_question_type_check
    CHECK (question_type IN ('mcq', 'true_false'));
  END IF;
END $$;

ALTER TABLE public.questions
ALTER COLUMN question_type SET NOT NULL;
