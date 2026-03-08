-- Admin global report read access
-- Grants SELECT access to admins on report-critical tables.
-- Keeps existing host/participant restrictions for non-admin users.

ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_responses ENABLE ROW LEVEL SECURITY;

-- Helper for admin check (safe to re-run)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin_flag BOOLEAN;
BEGIN
  SELECT role = 'admin'
  INTO is_admin_flag
  FROM public.profiles
  WHERE id = auth.uid();

  RETURN COALESCE(is_admin_flag, false);
END;
$$;

-- Avoid duplicate policy creation on reruns
DROP POLICY IF EXISTS "Admins can read all live_sessions" ON public.live_sessions;
DROP POLICY IF EXISTS "Admins can read all participants" ON public.participants;
DROP POLICY IF EXISTS "Admins can read all student_responses" ON public.student_responses;

CREATE POLICY "Admins can read all live_sessions"
ON public.live_sessions
FOR SELECT
USING (public.is_admin());

CREATE POLICY "Admins can read all participants"
ON public.participants
FOR SELECT
USING (public.is_admin());

CREATE POLICY "Admins can read all student_responses"
ON public.student_responses
FOR SELECT
USING (public.is_admin());
