-- Fix missing RLS policies for questions table

-- Teachers can read questions for any quiz
CREATE POLICY "Anyone can read questions" ON questions
  FOR SELECT USING (true);

-- Teachers can insert questions for their own quizzes
CREATE POLICY "Teachers can insert questions" ON questions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM quizzes WHERE quizzes.id = quiz_id AND quizzes.teacher_id = auth.uid()
    )
  );

-- Teachers can update questions for their own quizzes
CREATE POLICY "Teachers can update questions" ON questions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM quizzes WHERE quizzes.id = quiz_id AND quizzes.teacher_id = auth.uid()
    )
  );

-- Teachers can delete questions for their own quizzes
CREATE POLICY "Teachers can delete questions" ON questions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM quizzes WHERE quizzes.id = quiz_id AND quizzes.teacher_id = auth.uid()
    )
  );
