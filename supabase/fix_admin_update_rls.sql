-- Fix recursive RLS on UPDATE and DELETE operations for the profiles table.
-- The current policies attempt to SELECT from profiles while UPDATING profiles,
-- causing infinite recursion and a 500 Internal Server Error.

-- 1. Drop the recursive Admin policies
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can delete all profiles" ON profiles;

-- 2. Create safely structured Admin policies using caching or JWT claims if possible, 
-- or a simplified non-recursive check. 
-- Since Supabase currently has no clean way to do non-recursive RBAC on the same table without
-- custom JWT claims or a separate roles table, and we fixed the SELECT recursion earlier,
-- a standard safe approach for a simple app is to trust the `role` field directly during UPDATE.

-- For actual production you use Custom JWT claims inside auth.users, but for this project:

-- Create a secure wrapper function to check admin status bypassing RLS
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  is_admin_flag BOOLEAN;
BEGIN
  SELECT role = 'admin' INTO is_admin_flag
  FROM profiles
  WHERE id = auth.uid()
  LIMIT 1;

  RETURN COALESCE(is_admin_flag, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- SECURITY DEFINER executes with the privileges of the function creator (postgres default),
-- meaning it bypasses RLS and won't trigger the infinite loop when called from inside an RLS policy.

-- Re-create the policies using the secure function
CREATE POLICY "Admins can update all profiles" ON profiles
  FOR UPDATE USING (is_admin());

CREATE POLICY "Admins can delete all profiles" ON profiles
  FOR DELETE USING (is_admin());

-- Reminder: also ensure the users can update their own data if needed (e.g. display_name)
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);
