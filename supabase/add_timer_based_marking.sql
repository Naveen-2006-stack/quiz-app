-- Add timer_based_marking column to quizzes table
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS timer_based_marking BOOLEAN DEFAULT TRUE;
