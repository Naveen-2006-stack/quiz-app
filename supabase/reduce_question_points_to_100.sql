-- Reduce default quiz question points from 1000 to 100
-- Run this in Supabase SQL Editor for existing databases.

ALTER TABLE public.questions
ALTER COLUMN base_points SET DEFAULT 100;

-- Optional backfill: normalize existing high-point questions to 100
UPDATE public.questions
SET base_points = 100
WHERE base_points = 1000;
