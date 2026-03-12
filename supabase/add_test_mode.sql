-- =============================================================================
-- Test Mode: Add test_mode column to quizzes
-- When enabled, students cannot see marks/scores or the final leaderboard.
-- The host still has full visibility.
-- =============================================================================

ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS test_mode BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN quizzes.test_mode IS
  'When TRUE, score feedback and the final leaderboard are hidden from students.';
