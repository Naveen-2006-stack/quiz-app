"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useLiveSession } from "@/hooks/useLiveSession";
import { useGameStore } from "@/store/useGameStore";
import { ActiveQuestionCard } from "@/components/game/ActiveQuestionCard";
import { motion } from "framer-motion";

export default function StudentPlayRoom() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.session_id as string;
  
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealedQuestionIndex, setRevealedQuestionIndex] = useState<number | null>(null);
  
  // Realtime hooks
  const sessionStatus = useGameStore(s => s.sessionStatus);
  const currentQuestionIndex = useGameStore(s => s.currentQuestionIndex);
  const setSessionStatus = useGameStore(s => s.setSessionStatus);
  const setCurrentQuestionIndex = useGameStore(s => s.setCurrentQuestionIndex);
  
  // Local Participant State
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);

  useLiveSession(sessionId, 'student');

  useEffect(() => {
    initPlayRoom();
    setupAntiCheat();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    const controlChannel = supabase
      .channel(`session_control:${sessionId}`)
      .on('broadcast', { event: 'reveal_answer' }, (payload) => {
        const revealedIdx = payload?.payload?.questionIndex;
        if (typeof revealedIdx === 'number') {
          setRevealedQuestionIndex(revealedIdx);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(controlChannel);
    };
  }, [sessionId]);

  useEffect(() => {
    setRevealedQuestionIndex(null);
  }, [currentQuestionIndex]);

  const initPlayRoom = async () => {
    const uuid = localStorage.getItem("kahoot_device_uuid");
    if (!uuid) {
      router.push("/join");
      return;
    }

    // 1. Get Session & Quiz Data
    const { data: sData } = await supabase
      .from("live_sessions")
      .select("*, quizzes(title)")
      .eq("id", sessionId)
      .single();
    
    if (sData) {
      setSessionInfo(sData);
      setSessionStatus(sData.status);
      setCurrentQuestionIndex(sData.current_question_index);
    }

    // 2. Hydrate Questions
    if (sData?.quiz_id) {
      const { data: qData } = await supabase
        .from("questions")
        .select("*")
        .eq("quiz_id", sData.quiz_id)
        .order("order_index");
      if (qData) setQuestions(qData);
    }

    // 3. Authenticate local UUID as participant
    const { data: pData } = await supabase
      .from("participants")
      .select("id, streak")
      .eq("session_id", sessionId)
      .eq("device_uuid", uuid)
      .single();

    if (pData) {
      setParticipantId(pData.id);
      setStreak(pData.streak || 0);
    } else {
      router.push("/join"); // Fallback if unregistered
    }
    
    setLoading(false);
  };

  const handleVisibilityChange = async () => {
    if (document.hidden && participantId) {
      // 🚨 ANTI-CHEAT TRIGGERED 🚨
      // Realtime hook broadcasts this back to the Teacher's podium
      await supabase.rpc('increment_cheat_flags', { p_id: participantId });
      
      // Note: We need a custom PostgreSQL RPC for atomic increment, OR we do an unsafe update:
      // await supabase.from('participants').update({ cheat_flags: cheat_flags + 1 }).eq('id', participantId)
      // For simplicity/safety, let's just use raw updating or create the RPC later.
      const { data } = await supabase.from("participants").select("cheat_flags").eq("id", participantId).single();
      if (data) {
        await supabase.from("participants").update({ cheat_flags: data.cheat_flags + 1 }).eq("id", participantId);
      }
    }
  };

  const setupAntiCheat = () => {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  };

  const handleAnswerSubmit = async (optionIdx: number, reactionMs: number) => {
    if (!participantId || questions.length === 0) return;

    const q = questions[currentQuestionIndex];
    if (!q) return;

    const selectedOpt = q.options[optionIdx];
    const isCorrect = selectedOpt ? selectedOpt.is_correct : false;

    // Time decay calculation: 
    // max points if answered at 0 ms. 
    // linearly drops to 50% points if answered at very last millisecond
    const maxTime = q.time_limit * 1000;
    const timeRatio = Math.max(0, maxTime - reactionMs) / maxTime;
    let pointsAwarded = Math.round((q.base_points * 0.5) + (q.base_points * 0.5 * timeRatio));

    if (!isCorrect) {
      pointsAwarded = 0;
      setStreak(0); // reset streak visually immediately
    } else {
      setStreak(prev => prev + 1); // update streak visually
    }

    const currentStreak = isCorrect ? streak + 1 : 0;
    const streakBonus = currentStreak >= 3 ? Math.min(300, currentStreak * 50) : 0;
    pointsAwarded += streakBonus;

    // Record response
    await supabase.from("student_responses").insert({
      session_id: sessionId,
      participant_id: participantId,
      question_id: q.id,
      reaction_time_ms: reactionMs,
      is_correct: isCorrect,
      points_awarded: pointsAwarded,
      streak_bonus: streakBonus
    });

    // We must RPC to atomically increment total score, but for now we'll do read-modify-write
    const { data: pRead } = await supabase.from("participants").select("score").eq("id", participantId).single();
    if (pRead) {
      await supabase.from("participants").update({
        score: pRead.score + pointsAwarded,
        streak: currentStreak
      }).eq("id", participantId);
    }
  };

  if (loading) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col p-4 md:p-8">
      {/* Top Header */}
      <header className="flex justify-between items-center mb-12">
        <h1 className="text-xl font-bold text-slate-800 dark:text-white truncate">
          {sessionInfo?.quizzes?.title}
        </h1>
        <div className="px-4 py-2 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-white/10 text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
          {sessionStatus}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center">
        {sessionStatus === 'waiting' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <h2 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-4 tracking-tight">You're In!</h2>
            <p className="text-xl text-slate-500 dark:text-slate-400">See your nickname on the screen.</p>
            <div className="mt-12 flex justify-center gap-2">
              {[0, 1, 2].map(i => (
                <motion.div key={i} animate={{ y: [0, -10, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.2 }}
                  className="w-4 h-4 bg-indigo-500 rounded-full"
                />
              ))}
            </div>
          </motion.div>
        )}

        {sessionStatus === 'active' && questions[currentQuestionIndex] && (
          <ActiveQuestionCard
            key={questions[currentQuestionIndex].id}
            question={questions[currentQuestionIndex].question_text}
            options={questions[currentQuestionIndex].options}
            timeLimit={questions[currentQuestionIndex].time_limit}
            streak={streak}
            isRevealed={revealedQuestionIndex === currentQuestionIndex}
            onAnswer={handleAnswerSubmit}
          />
        )}

        {sessionStatus === 'finished' && (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
            <div className="text-6xl mb-6">🏆</div>
            <h2 className="text-5xl font-extrabold text-slate-900 dark:text-white mb-4 tracking-tight">Game Over!</h2>
            <p className="text-xl text-slate-500 dark:text-slate-400">Check the main screen for your final rank and score.</p>
          </motion.div>
        )}
      </main>
    </div>
  );
}
