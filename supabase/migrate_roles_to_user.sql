-- =============================================================================
-- Migration: Consolidate 'student' and 'teacher' roles into 'user'
-- =============================================================================

-- 1. Add 'user' to the user_role ENUM
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'user';

-- 2. Update existing 'teacher' and 'student' profiles to 'user'
UPDATE profiles 
SET role = 'user' 
WHERE role IN ('teacher', 'student');

-- 3. Change default role for new signups
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'user'::user_role;

-- 4. Update the Ghost Mode RPC to reflect the new roles
CREATE OR REPLACE FUNCTION get_ghost_mode_for_participant(
  p_session_id UUID,
  p_device_uuid UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ghost_mode BOOLEAN;
  v_role TEXT;
BEGIN
  -- Primary path: check logged in user
  SELECT ghost_mode, role::text
  INTO v_ghost_mode, v_role
  FROM profiles
  WHERE id = auth.uid()
  LIMIT 1;

  IF FOUND THEN
    -- If they have the admin role OR explicit ghost_mode, return true
    IF v_role = 'admin' OR v_ghost_mode = TRUE THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- Fallback: false
  RETURN FALSE;
END;
$$;
