-- =============================================================================
-- LevelNLearn Pre-Deploy Bundle (2026-04-23)
-- Canonical bundle for image questions + detailed anti-cheat logging.
-- Safe to run multiple times (idempotent where possible).
-- =============================================================================

-- 0) Ensure violations table exists (needed by RPCs/reporting).
CREATE TABLE IF NOT EXISTS public.participant_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES public.participants(id) ON DELETE CASCADE,
  violation_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.participant_violations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'participant_violations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.participant_violations;
  END IF;
END
$$;

-- 1) Participant violations RLS policies.
DROP POLICY IF EXISTS "Anyone can insert violations" ON public.participant_violations;
DROP POLICY IF EXISTS "Session participants can insert violations" ON public.participant_violations;
DROP POLICY IF EXISTS "Hosts can read violations" ON public.participant_violations;

CREATE POLICY "Session participants can insert violations"
ON public.participant_violations
FOR INSERT
WITH CHECK (
  participant_id IN (
    SELECT p.id
    FROM public.participants p
    WHERE p.session_id = participant_violations.session_id
  )
);

CREATE POLICY "Hosts can read violations"
ON public.participant_violations
FOR SELECT
USING (
  session_id IN (
    SELECT ls.id
    FROM public.live_sessions ls
    WHERE ls.teacher_id = auth.uid()
  )
);

-- 2) Schema additions for new features.
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE public.participants
ADD COLUMN IF NOT EXISTS violation_logs JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 3) Storage bucket + policies for question images.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'quiz-images',
  'quiz-images',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public can view quiz images'
  ) THEN
    CREATE POLICY "Public can view quiz images"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'quiz-images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can upload quiz images'
  ) THEN
    CREATE POLICY "Authenticated users can upload quiz images"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'quiz-images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can update quiz images'
  ) THEN
    CREATE POLICY "Authenticated users can update quiz images"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (bucket_id = 'quiz-images')
    WITH CHECK (bucket_id = 'quiz-images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can delete quiz images'
  ) THEN
    CREATE POLICY "Authenticated users can delete quiz images"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (bucket_id = 'quiz-images');
  END IF;
END
$$;

-- 4) Host-secure kick RPC.
CREATE OR REPLACE FUNCTION public.ban_participant(p_session_id UUID, p_participant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT teacher_id FROM public.live_sessions WHERE id = p_session_id) != auth.uid() THEN
    RAISE EXCEPTION 'Only the host can ban participants';
  END IF;

  UPDATE public.participants
  SET is_banned = TRUE
  WHERE id = p_participant_id AND session_id = p_session_id;
END;
$$;

-- 5) Canonical anti-cheat logging RPC.
-- IMPORTANT: This is the final definition and must be applied after older migrations.
CREATE OR REPLACE FUNCTION public.log_violation(
  p_session_id UUID,
  p_participant_id UUID,
  p_violation_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.participants
    WHERE id = p_participant_id
      AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'Invalid participant for this session';
  END IF;

  IF (SELECT status FROM public.live_sessions WHERE id = p_session_id) != 'active' THEN
    RAISE EXCEPTION 'Session is not active';
  END IF;

  INSERT INTO public.participant_violations (session_id, participant_id, violation_type)
  VALUES (p_session_id, p_participant_id, p_violation_type);

  UPDATE public.participants
  SET
    cheat_flags = COALESCE(cheat_flags, 0) + 1,
    violation_logs = COALESCE(violation_logs, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'type', p_violation_type,
        'timestamp', NOW()::timestamptz
      )
    )
  WHERE id = p_participant_id;
END;
$$;

-- 6) Host-only fetch violations RPC.
CREATE OR REPLACE FUNCTION public.fetch_violations_for_host(
  p_session_id UUID,
  p_participant_id UUID
)
RETURNS TABLE (
  id UUID,
  session_id UUID,
  participant_id UUID,
  violation_type TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT teacher_id FROM public.live_sessions WHERE id = p_session_id) != auth.uid() THEN
    RAISE EXCEPTION 'Only the session host can view violation logs';
  END IF;

  RETURN QUERY
  SELECT
    pv.id,
    pv.session_id,
    pv.participant_id,
    pv.violation_type,
    pv.created_at
  FROM public.participant_violations pv
  WHERE pv.session_id = p_session_id
    AND pv.participant_id = p_participant_id
  ORDER BY pv.created_at DESC;
END;
$$;

-- 7) Optional backward-compatible view alias.
CREATE OR REPLACE VIEW public.cheat_logs
WITH (security_invoker = true) AS
SELECT
  id,
  session_id,
  participant_id,
  violation_type,
  created_at
FROM public.participant_violations;

-- 8) Grants.
REVOKE EXECUTE ON FUNCTION public.log_violation(UUID, UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ban_participant(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fetch_violations_for_host(UUID, UUID) FROM anon;

GRANT EXECUTE ON FUNCTION public.log_violation(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ban_participant(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_violations_for_host(UUID, UUID) TO authenticated;
