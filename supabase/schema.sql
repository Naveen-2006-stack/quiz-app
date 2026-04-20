-- 1. Custom Types
CREATE TYPE user_role AS ENUM ('teacher', 'student');
CREATE TYPE session_status AS ENUM ('waiting', 'active', 'finished');

-- 2. Profiles (Extends Supabase Auth)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role user_role DEFAULT 'student',
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Quizzes (Question Bank)
CREATE TABLE quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Questions
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'mcq' CHECK (question_type IN ('mcq', 'true_false', 'multi_select')),
  options JSONB NOT NULL, -- Array of {text: string, is_correct: boolean}
  time_limit INTEGER DEFAULT 40, -- Seconds
  base_points INTEGER DEFAULT 100,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Live Sessions (Game Lobbies)
CREATE TABLE live_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  join_code VARCHAR(6) UNIQUE NOT NULL,
  quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES profiles(id),
  status session_status DEFAULT 'waiting',
  current_question_index INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

-- 6. Participants (Students in a session)
CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES live_sessions(id) ON DELETE CASCADE,
  device_uuid UUID NOT NULL, -- Stored in localStorage for reconnection
  display_name TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0,
  cheat_flags INTEGER DEFAULT 0, -- Increments on visibilitychange event
  last_active TIMESTAMPTZ DEFAULT NOW(),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, device_uuid) -- Prevent duplicate entries for same user
);

-- 7. Student Responses
CREATE TABLE student_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES live_sessions(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES participants(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  reaction_time_ms INTEGER NOT NULL,
  is_correct BOOLEAN NOT NULL,
  points_awarded INTEGER DEFAULT 0,
  streak_bonus INTEGER DEFAULT 0,
  answered_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Enable Supabase Realtime for necessary tables
alter publication supabase_realtime add table live_sessions;
alter publication supabase_realtime add table participants;
alter publication supabase_realtime add table student_responses;

-- 9. Basic RLS (for open local dev or easy start, in production properly lock this down)
-- Allow read to participants, write to teacher. For now, enable broad access for scaffolding.
