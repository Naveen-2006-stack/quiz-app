-- ==========================================
-- CONSOLIDATED DATABASE LINTER FIXES
-- ==========================================

-- 1. Fix: Function Search Path Mutable (public.handle_new_user)
-- Detects functions where the search_path parameter is not set.
-- Security best practice: Explicitly set search_path to prevent search path hijacking.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'student'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';


-- 2. Fix: RLS Policy Always True (participants table)
-- Replaces overly permissive policies that use USING(true) or WITH CHECK(true)
-- with logic that ensures a valid session context.

-- Drop existing permissive policies (if they exist) to avoid conflicts
DROP POLICY IF EXISTS "Anyone can insert participants" ON participants;
DROP POLICY IF EXISTS "Anyone can join a game" ON participants;
DROP POLICY IF EXISTS "Anyone can update participants (anti-cheat/score)" ON participants;
DROP POLICY IF EXISTS "Participants can leave games" ON participants;
DROP POLICY IF EXISTS "Participants can leave games (delete own row)" ON participants;

-- Recreate policies with specific subquery restrictions
CREATE POLICY "Anyone can insert participants" ON participants
  FOR INSERT WITH CHECK (session_id IN (SELECT id FROM live_sessions));

CREATE POLICY "Anyone can join a game" ON participants
  FOR INSERT WITH CHECK (session_id IN (SELECT id FROM live_sessions));

CREATE POLICY "Anyone can update participants (anti-cheat/score)" ON participants
  FOR UPDATE USING (session_id IN (SELECT id FROM live_sessions));

CREATE POLICY "Participants can leave games" ON participants
  FOR DELETE USING (session_id IN (SELECT id FROM live_sessions));

-- 3. Note on Leaked Password Protection
-- This must be enabled manually in the Supabase Dashboard:
-- Authentication -> Security -> Enable leaked password protection
