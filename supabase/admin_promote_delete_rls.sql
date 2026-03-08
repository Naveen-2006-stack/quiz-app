-- Allow admins to update the role column on any non-admin profile
-- Run this in Supabase SQL Editor if promote/demote returns a permission error

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles'
      AND policyname = 'profiles_role_admin_update'
  ) THEN
    CREATE POLICY profiles_role_admin_update ON profiles
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

-- Allow admins to delete any live_session (for the "Delete Session" button)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'live_sessions'
      AND policyname = 'live_sessions_admin_delete'
  ) THEN
    CREATE POLICY live_sessions_admin_delete ON live_sessions
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM profiles AS me
          WHERE me.id = auth.uid()
            AND me.role::text = 'admin'
        )
      );
  END IF;
END;
$$;
