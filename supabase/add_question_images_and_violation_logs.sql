-- =============================================================================
-- Question Images + Detailed Violation Logs
-- =============================================================================

-- 1) Questions: support optional image URL.
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2) Participants: persist detailed violation logs as JSON array.
ALTER TABLE public.participants
ADD COLUMN IF NOT EXISTS violation_logs JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 3) Supabase Storage bucket for question images.
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
    SELECT 1
    FROM pg_policies
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
    SELECT 1
    FROM pg_policies
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
    SELECT 1
    FROM pg_policies
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
    SELECT 1
    FROM pg_policies
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

-- 4) Keep detailed anti-cheat logs in participants.violation_logs as array items.
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
    SELECT 1 FROM participants
    WHERE id = p_participant_id AND session_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'Invalid participant for this session';
  END IF;

  IF (SELECT status FROM live_sessions WHERE id = p_session_id) != 'active' THEN
    RAISE EXCEPTION 'Session is not active';
  END IF;

  INSERT INTO participant_violations (session_id, participant_id, violation_type)
  VALUES (p_session_id, p_participant_id, p_violation_type);

  UPDATE participants
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

REVOKE EXECUTE ON FUNCTION public.log_violation(UUID, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_violation(UUID, UUID, TEXT) TO authenticated;
