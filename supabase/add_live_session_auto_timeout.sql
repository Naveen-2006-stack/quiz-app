-- Auto-timeout support for stale live sessions
-- Marks waiting/active sessions as finished after 2 hours of inactivity.

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ended_reason TEXT;

-- Backfill old rows, then enforce default + not-null for future rows.
UPDATE public.live_sessions
SET last_activity_at = COALESCE(last_activity_at, started_at, finished_at, NOW())
WHERE last_activity_at IS NULL;

ALTER TABLE public.live_sessions
  ALTER COLUMN last_activity_at SET DEFAULT NOW();

ALTER TABLE public.live_sessions
  ALTER COLUMN last_activity_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.auto_complete_stale_live_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.live_sessions
  SET
    status = 'finished',
    finished_at = NOW(),
    ended_reason = 'auto_timeout_2h'
  WHERE status IN ('waiting', 'active')
    AND last_activity_at < NOW() - INTERVAL '2 hours';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Optional scheduler setup: register a 10-minute cron if pg_cron is available.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'pg_cron extension not installed due to insufficient privileges';
  END;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule(jobid)
      FROM cron.job
      WHERE jobname = 'auto-complete-stale-live-sessions';

      PERFORM cron.schedule(
        'auto-complete-stale-live-sessions',
        '*/10 * * * *',
        'SELECT public.auto_complete_stale_live_sessions();'
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Could not register cron job automatically: %', SQLERRM;
    END;
  END IF;
END;
$$;
