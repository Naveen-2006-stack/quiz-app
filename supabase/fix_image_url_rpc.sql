DROP FUNCTION IF EXISTS public.get_questions_for_student(UUID);

CREATE OR REPLACE FUNCTION public.get_questions_for_student(p_session_id UUID)
RETURNS TABLE (
  id UUID,
  question_text TEXT,
  question_type TEXT,
  options JSONB,
  time_limit INTEGER,
  image_url TEXT,
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
    q.image_url,
    q.order_index
  FROM questions q
  JOIN live_sessions s ON s.quiz_id = q.quiz_id
  WHERE s.id = p_session_id
  ORDER BY q.order_index;
END;
$$;
