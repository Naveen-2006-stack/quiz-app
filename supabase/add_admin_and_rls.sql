-- Add 'admin' to the existing user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';

-- Enable RLS on all main tables if not already enabled (they probably are from before or the user didn't lock them down)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_responses ENABLE ROW LEVEL SECURITY;

-- 1. Profiles Policies
CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );
  
CREATE POLICY "Admins can update all profiles" ON profiles
  FOR UPDATE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Admins can delete all profiles" ON profiles
  FOR DELETE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Replace/Add existing policies to not block others (Assuming basic scaffolding rules were in place):
-- Give everyone read access to their own profile:
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT USING (id = auth.uid());

-- 2. Quizzes Policies
CREATE POLICY "Admins can do everything on quizzes" ON quizzes
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Teachers can read all quizzes" ON quizzes
  FOR SELECT USING (true); -- Usually teachers want to see quizzes to play

CREATE POLICY "Teachers can manage own quizzes" ON quizzes
  FOR ALL USING (teacher_id = auth.uid());

CREATE POLICY "Teachers can insert quizzes" ON quizzes
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Live Sessions Policies
CREATE POLICY "Admins can do everything on sessions" ON live_sessions
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Anyone can read live_sessions" ON live_sessions
  FOR SELECT USING (true);

CREATE POLICY "Teachers can manage own live_sessions" ON live_sessions
  FOR ALL USING (teacher_id = auth.uid());

-- 4. Participants
CREATE POLICY "Admins can do everything on participants" ON participants
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Anyone can read participants" ON participants
  FOR SELECT USING (true);

CREATE POLICY "Anyone can insert participants" ON participants
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update participants (anti-cheat/score)" ON participants
  FOR UPDATE USING (true);

-- 5. Student Responses
CREATE POLICY "Admins can do everything on student_responses" ON student_responses
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Anyone can insert student_responses" ON student_responses
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can read student_responses" ON student_responses
  FOR SELECT USING (true);

-- ==============================================================================
-- 6. Elevate Specific User to Admin
-- ==============================================================================
-- This will update the profile for quizsrm@gmail.com to 'admin' if they exist.
-- If they do not exist yet (i.e., haven't signed in), you must sign in first, THEN run this snippet again.
UPDATE public.profiles 
SET role = 'admin' 
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'quizsrm@gmail.com'
);
