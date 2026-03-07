-- Create a secure RPC to allow teachers to start their own live sessions
-- This bypasses complex RLS Update locks that may be silently failing on the client due to caching or edge cases.

CREATE OR REPLACE FUNCTION start_live_session(session_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  is_owner BOOLEAN;
BEGIN
  -- Verify the caller is the teacher who created this session
  SELECT teacher_id = auth.uid() INTO is_owner
  FROM live_sessions
  WHERE id = session_uuid;

  IF is_owner THEN
    UPDATE live_sessions
    SET status = 'active', started_at = NOW()
    WHERE id = session_uuid;
    RETURN true;
  ELSE
    RETURN false;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
