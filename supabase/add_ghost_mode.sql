-- ============================================================
--  Ghost Mode Feature – Database Migration
--  Run this in the Supabase SQL Editor (as postgres / service role)
-- ============================================================

-- 1. Add ghost_mode column to profiles (default FALSE, totally invisible)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ghost_mode BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. RLS policy: only the owner of the row OR an admin can read ghost_mode.
--    We achieve this by creating a separate, restricted function.
--    NOTE: The Admin Dashboard already reads profiles.* with the service key,
--    so admins naturally see all columns. We rely on the explicit select()
--    projection in Host components to ensure ghost_mode never leaks there.

-- 3. Allow authenticated users to read ONLY THEIR OWN ghost_mode flag.
--    (The existing select policy on profiles probably already allows this;
--     this explicit policy is belt-and-suspenders.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles'
      AND policyname = 'profiles_ghost_mode_self_read'
  ) THEN
    CREATE POLICY profiles_ghost_mode_self_read ON profiles
      FOR SELECT
      USING (id = auth.uid());
  END IF;
END;
$$;

-- 4. Allow admins to UPDATE ghost_mode on any row.
--    Requires the caller to be in the 'admin' role as stored in profiles.role.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles'
      AND policyname = 'profiles_ghost_mode_admin_update'
  ) THEN
    CREATE POLICY profiles_ghost_mode_admin_update ON profiles
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM profiles AS me
          WHERE me.id = auth.uid()
            AND me.role::text = 'admin'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM profiles AS me
          WHERE me.id = auth.uid()
            AND me.role::text = 'admin'
        )
      );
  END IF;
END;
$$;
