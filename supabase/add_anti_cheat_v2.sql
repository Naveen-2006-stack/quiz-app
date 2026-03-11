-- =============================================================================
-- Anti-Cheat Engine v2: Secure Shuffling, Validation, and Point Calculation
-- =============================================================================

-- 1. Add is_banned column to participants
ALTER TABLE public.participants 
ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;

-- 2. Implement increment_cheat_flags RPC (Secure version)
CREATE OR REPLACE FUNCTION public.increment_cheat_flags(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE participants
  SET cheat_flags = cheat_flags + 1
  WHERE id = p_id;
END;
$$;

-- 3. Implement get_questions_for_student (Stripped and Shuffled)
CREATE OR REPLACE FUNCTION public.get_questions_for_student(p_session_id UUID)
RETURNS TABLE (
  id UUID,
  question_text TEXT,
  question_type TEXT,
  options JSONB,
  time_limit INTEGER,
  order_index INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    q.id,
    q.question_text,
    q.question_type,
    (
      SELECT jsonb_agg(opt)
      FROM (
        SELECT jsonb_build_object('text', elem->>'text') as opt
        FROM jsonb_array_elements(q.options) AS elem
        ORDER BY random() -- Shuffled server-side
      ) s
    ) as options,
    q.time_limit,
    q.order_index
  FROM questions q
  JOIN live_sessions s ON s.quiz_id = q.quiz_id
  WHERE s.id = p_session_id
  ORDER BY q.order_index;
END;
$$;

-- 4. Secure submit_answer RPC
-- This handles point calculation, streak management, and verification server-side.
CREATE OR REPLACE FUNCTION public.submit_answer_v2(
  p_session_id UUID,
  p_participant_id UUID,
  p_question_id UUID,
  p_option_index INTEGER, 
  p_option_text TEXT,
  p_reaction_time_ms INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_correct BOOLEAN;
  v_base_points INTEGER;
  v_max_time_ms INTEGER;
  v_points_awarded INTEGER := 0;
  v_current_streak INTEGER;
  v_streak_bonus INTEGER := 0;
  v_is_banned BOOLEAN;
  v_session_status TEXT;
  v_timer_enabled BOOLEAN;
BEGIN
  -- 1. Security Checks
  SELECT is_banned INTO v_is_banned FROM participants WHERE id = p_participant_id;
  IF v_is_banned THEN
    RAISE EXCEPTION 'Player is banned';
  END IF;

  SELECT status INTO v_session_status FROM live_sessions WHERE id = p_session_id;
  IF v_session_status != 'active' THEN
    RAISE EXCEPTION 'Session is not active';
  END IF;

  -- 2. Validate Answer
  -- Get question metadata and check if the selected text matches ANY correct option.
  SELECT 
    base_points, 
    (time_limit * 1000),
    COALESCE(qz.timer_based_marking, true),
    EXISTS (
      SELECT 1 FROM jsonb_array_elements(q.options) AS e 
      WHERE (e->>'is_correct' = 'true' OR e->>'is_correct' = '1')
      AND BTRIM(LOWER(e->>'text')) = BTRIM(LOWER(p_option_text))
    )
  INTO v_base_points, v_max_time_ms, v_timer_enabled, v_is_correct
  FROM questions q
  JOIN quizzes qz ON qz.id = q.quiz_id
  WHERE q.id = p_question_id;

  -- 3. Calculate Points & Streak BEFORE updating rows
  IF v_is_correct THEN
    IF v_timer_enabled THEN
      v_points_awarded := ROUND(v_base_points * 0.5 + v_base_points * 0.5 * (GREATEST(0, v_max_time_ms - p_reaction_time_ms)::float / GREATEST(1, v_max_time_ms)));
    ELSE
      v_points_awarded := v_base_points;
    END IF;

    -- Update Streak
    UPDATE participants 
    SET streak = streak + 1
    WHERE id = p_participant_id
    RETURNING streak INTO v_current_streak;

    -- Calculate Streak Bonus
    IF v_current_streak >= 3 THEN
      v_streak_bonus := LEAST(300, v_current_streak * 50);
      v_points_awarded := v_points_awarded + v_streak_bonus;
    END IF;

    -- Apply total points to participant score
    UPDATE participants SET score = score + v_points_awarded WHERE id = p_participant_id;

  ELSE
    -- Reset Streak
    UPDATE participants SET streak = 0 WHERE id = p_participant_id;
    v_current_streak := 0;
  END IF;

  -- 4. Record Response
  BEGIN
    INSERT INTO student_responses (
      session_id, participant_id, question_id, reaction_time_ms, is_correct, points_awarded, streak_bonus
    ) VALUES (
      p_session_id, p_participant_id, p_question_id, p_reaction_time_ms, v_is_correct, v_points_awarded, v_streak_bonus
    );
  EXCEPTION WHEN unique_violation THEN
    -- If they already answered, ignore the attempt and return early
    RETURN jsonb_build_object(
      'is_correct', false,
      'points_awarded', 0,
      'new_streak', 0,
      'error', 'Already answered'
    );
  END;

  RETURN jsonb_build_object(
    'is_correct', v_is_correct,
    'points_awarded', v_points_awarded,
    'new_streak', v_current_streak
  );
END;
$$;

-- 5. Ban Hammer RPC
CREATE OR REPLACE FUNCTION public.ban_participant(p_session_id UUID, p_participant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE participants 
  SET is_banned = TRUE 
  WHERE id = p_participant_id AND session_id = p_session_id;
END;
$$;

-- Permissions
GRANT EXECUTE ON FUNCTION public.increment_cheat_flags(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_questions_for_student(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.submit_answer_v2(UUID, UUID, UUID, INTEGER, TEXT, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.ban_participant(UUID, UUID) TO authenticated;
