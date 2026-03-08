-- Create the feedback table for users to submit ratings & comments

CREATE TABLE IF NOT EXISTS public.feedback (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rating      SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  message     TEXT NOT NULL CHECK (char_length(message) >= 5),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can submit feedback
CREATE POLICY "Users can insert own feedback" ON public.feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Only admins can read all feedback
CREATE POLICY "Admins can read feedback" ON public.feedback
  FOR SELECT USING (is_admin());
