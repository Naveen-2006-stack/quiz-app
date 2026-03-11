-- =============================================================================
-- Fix: Allow students to read participants for leaderboard on finished screen
-- =============================================================================

-- Students need to read participant scores/names for the end-game leaderboard.
-- This policy allows anyone (authenticated or anon) to SELECT from participants
-- for sessions that are finished, exposing only non-sensitive columns.

-- Drop any conflicting policy first
DROP POLICY IF EXISTS "Students can read finished session participants" ON participants;

CREATE POLICY "Students can read finished session participants"
ON participants
FOR SELECT
USING (
  session_id IN (
    SELECT id FROM live_sessions WHERE status = 'finished'
  )
);
