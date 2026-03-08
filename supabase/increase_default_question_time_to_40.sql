-- Increase default question time limit from 20s to 40s
-- Run this in Supabase SQL Editor.

ALTER TABLE public.questions
ALTER COLUMN time_limit SET DEFAULT 40;

-- Optional backfill: convert existing 20s questions to 40s
UPDATE public.questions
SET time_limit = 40
WHERE time_limit = 20;
