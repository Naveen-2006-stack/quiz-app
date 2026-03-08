-- 1. Ensure Realtime is enabled for the participants table
-- This allows the Supabase Realtime server to broadcast INSERT/UPDATE/DELETE events
DO $$
BEGIN
  -- Enable Realtime for participants if not already enabled
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE participants;
  END IF;
END $$;

-- 2. Ensure everyone can READ the participants table
-- The host needs to be able to fetch the initial list of participants on load.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'participants' AND policyname = 'Anyone can view participants'
  ) THEN
    CREATE POLICY "Anyone can view participants" 
    ON participants 
    FOR SELECT 
    USING (true);
  END IF;
END $$;

-- 3. Ensure students can INSERT into the participants table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'participants' AND policyname = 'Anyone can join a game'
  ) THEN
    CREATE POLICY "Anyone can join a game" 
    ON participants 
    FOR INSERT 
    WITH CHECK (true);
  END IF;
END $$;
