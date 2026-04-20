-- Allow explicit multi_select question type in questions.question_type
-- Existing values remain compatible.

ALTER TABLE public.questions
DROP CONSTRAINT IF EXISTS questions_question_type_check;

ALTER TABLE public.questions
ADD CONSTRAINT questions_question_type_check
CHECK (question_type IN ('mcq', 'true_false', 'multi_select'));
