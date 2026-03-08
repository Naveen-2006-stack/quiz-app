"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useLiveSession } from "@/hooks/useLiveSession";
import { useGameStore } from "@/store/useGameStore";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Play, Copy, Check } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface LiveSession {
  id: string;
  join_code: string;
  quiz_id: string;
  status: string;
  quizzes?: { title: string, questions: { id: string }[] };
}

interface FlaggedStudent {
  studentId: string;
  studentName: string;
  flaggedAt: string;
}

export default function TeacherHostRoom() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.session_id as string;
  
  const [sessionInfo, setSessionInfo] = useState<LiveSession | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [startingGame, setStartingGame] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [advancingQuestion, setAdvancingQuestion] = useState(false);
  const [controlChannel, setControlChannel] = useState<any>(null);
  const [flaggedStudents, setFlaggedStudents] = useState<FlaggedStudent[]>([]);
  
  // Connect to realtime store mapping
  const participantsMap = useGameStore(s => s.participants);
  const sessionStatus = useGameStore(s => s.sessionStatus);
  const setParticipants = useGameStore(s => s.setParticipants);
  const setSessionStatus = useGameStore(s => s.setSessionStatus);
  const setCurrentQuestionIndex = useGameStore(s => s.setCurrentQuestionIndex);
  
  useLiveSession(sessionId, 'teacher');

  useEffect(() => {
    fetchSession();
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase.channel(`session_control:${sessionId}`).subscribe();
    setControlChannel(channel);

    return () => {
      supabase.removeChannel(channel);
      setControlChannel(null);
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    const gameRoomChannel = supabase
      .channel(`game-room:${sessionId}`)
      .on("broadcast", { event: "anti_cheat_violation" }, (payload) => {
        const studentId = payload?.payload?.studentId as string | undefined;
        const studentName = payload?.payload?.studentName as string | undefined;

        if (!studentId) return;

        setFlaggedStudents((prev) => [
          ...prev,
          {
            studentId,
            studentName: studentName || "Unknown Student",
            flaggedAt: new Date().toISOString(),
          },
        ]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(gameRoomChannel);
    };
  }, [sessionId]);

  const fetchSession = async () => {
    // 1. Get Session & Quiz Data
    const { data: sData } = await supabase
      .from("live_sessions")
      .select("*, quizzes(title, questions(*))")
      .eq("id", sessionId)
      .single();
    
    if (sData) {
      setSessionInfo(sData as any);
      const sortedQuestions = sData.quizzes?.questions?.sort((a: any, b: any) => a.order_index - b.order_index) || [];
      setQuestions(sortedQuestions);
      setSessionStatus(sData.status);
      setCurrentQuestionIndex(sData.current_question_index ?? 0);
    }

    // 2. Hydrate any existing participants who might have joined right away
    const { data: pData } = await supabase
      .from("participants")
      .select("*")
      .eq("session_id", sessionId);

    if (pData) {
      setParticipants(pData);
    }
  };

  const copyPin = () => {
    if (!sessionInfo?.join_code) return;
    navigator.clipboard.writeText(sessionInfo.join_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startGame = async () => {
    if (startingGame) return;

    setStartingGame(true);
    setStartError(null);

    try {
      const { data: rpcStarted, error: rpcError } = await supabase.rpc('start_live_session', { session_uuid: sessionId });

      if (rpcError || rpcStarted !== true) {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;

        if (!user) {
          throw new Error("Your login session expired. Please sign in again.");
        }

        const { data: updatedSession, error: updateError } = await supabase
          .from("live_sessions")
          .update({ status: "active", started_at: new Date().toISOString() })
          .eq("id", sessionId)
          .eq("teacher_id", user.id)
          .select("id, status")
          .single();

        if (updateError || !updatedSession) {
          throw new Error("Could not start this game session. Check your teacher permissions and database policies.");
        }
      }

      setSessionStatus("active");
    } catch (error: any) {
      setStartError(error?.message || "Failed to start game. Please try again.");
    } finally {
      setStartingGame(false);
    }
  };

  const participantsList = Object.values(participantsMap);
  const currentQuestionIndex = useGameStore(s => s.currentQuestionIndex);

  const nextQuestion = async () => {
    if (!questions || questions.length === 0 || advancingQuestion) return;

    setAdvancingQuestion(true);
    
    const isLast = currentQuestionIndex >= questions.length - 1;

    await controlChannel?.send({
      type: 'broadcast',
      event: 'reveal_answer',
      payload: {
        sessionId,
        questionIndex: currentQuestionIndex,
      }
    });

    await new Promise(resolve => setTimeout(resolve, 1400));
    
    if (isLast) {
      await supabase.from("live_sessions").update({ status: "finished", finished_at: new Date().toISOString() }).eq("id", sessionId);
    } else {
      await supabase.from("live_sessions").update({ current_question_index: currentQuestionIndex + 1 }).eq("id", sessionId);
    }

    setAdvancingQuestion(false);
  };

  const renderSecurityFlagsPanel = () => {
    if (flaggedStudents.length === 0) return null;

    return (
      <div className="mb-8 rounded-2xl border border-rose-300 bg-rose-50 p-4 dark:border-rose-500/40 dark:bg-rose-500/10">
        <h3 className="text-sm font-extrabold uppercase tracking-wide text-rose-700 dark:text-rose-300 mb-3">Security Flags</h3>
        <div className="space-y-2">
          {flaggedStudents.map((flag) => (
            <div key={`${flag.studentId}-${flag.flaggedAt}`} className="rounded-lg border border-rose-200/80 bg-white px-3 py-2 text-sm font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-slate-900/40 dark:text-rose-300">
              {`⚠️ ${flag.studentName} switched tabs!`}
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (sessionStatus === "active" || sessionStatus === "finished") {
    const sortedParticipants = [...participantsList].sort((a, b) => b.score - a.score);
    const activeQ = questions[currentQuestionIndex];

    return (
      <div className="max-w-7xl mx-auto py-8 px-4">
        {renderSecurityFlagsPanel()}

        {sessionStatus === "active" && activeQ && (
          <div className="mb-12 bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] shadow-xl shadow-indigo-100/50 dark:shadow-none border border-indigo-50 dark:border-white/5">
            <div className="flex justify-between items-center mb-6">
              <span className="px-4 py-2 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 font-bold rounded-xl text-sm tracking-widest uppercase">Question {currentQuestionIndex + 1} of {questions.length}</span>
              <span className="text-slate-500 font-medium font-mono">{activeQ.time_limit}s</span>
            </div>
            <h2 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-8">{activeQ.question_text}</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeQ.options.map((opt: any, idx: number) => (
                <div key={idx} className={cn("p-6 text-xl font-semibold rounded-2xl border-2", opt.is_correct ? "bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-gray-50 border-transparent dark:bg-slate-900 dark:text-slate-300")}>
                  {opt.text}
                </div>
              ))}
            </div>

            <div className="mt-8 flex justify-end">
              <motion.button onClick={nextQuestion} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} disabled={advancingQuestion} className="bg-slate-900 hover:bg-slate-800 disabled:opacity-60 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white px-8 py-4 rounded-xl font-bold transition-all shadow-xl">
                {advancingQuestion ? "Revealing..." : currentQuestionIndex >= questions.length - 1 ? "End Game" : "Next Question"}
              </motion.button>
            </div>
          </div>
        )}

        {sessionStatus === "finished" && (
          <div className="text-center mb-16">
            <span className="text-6xl mb-6 block">🏆</span>
            <h2 className="text-5xl font-black text-slate-900 dark:text-white mb-4">Final Standings</h2>
            <p className="text-xl text-slate-500">The game has concluded.</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 max-w-4xl mx-auto">
          <AnimatePresence>
            {sortedParticipants.map((p, idx) => (
              <motion.div key={p.id} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring" }} className="flex items-center gap-6 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 relative overflow-hidden">
                <div className="w-12 text-center text-3xl font-black text-slate-300 dark:text-slate-600">#{idx + 1}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{p.display_name}</h3>
                    {p.cheat_flags > 0 && <span className="bg-rose-100 text-rose-600 text-xs font-bold px-2 py-1 rounded-md" title="Switched tabs">Flags: {p.cheat_flags}</span>}
                  </div>
                  <div className="text-sm font-medium text-amber-500 tracking-wide mt-1">STREAK: {p.streak}🔥</div>
                </div>
                <div className="text-4xl font-black tracking-tighter text-indigo-600 dark:text-indigo-400">{p.score}</div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-12">
      {renderSecurityFlagsPanel()}

      <div className="text-center mb-12">
        <h1 className="text-5xl font-black text-slate-900 dark:text-white mb-4 tracking-tight">
          Join at <span className="text-indigo-600 dark:text-indigo-400">yourdomain.com</span>
        </h1>
        <div className="inline-flex items-center gap-4 bg-white dark:bg-slate-800 p-4 pl-8 rounded-full shadow-2xl shadow-indigo-500/10 border border-gray-100 dark:border-white/10">
          <span className="text-6xl font-mono tracking-[0.2em] font-bold text-slate-800 dark:text-white">
            {sessionInfo?.join_code || '------'}
          </span>
          <button 
            onClick={copyPin}
            className="w-16 h-16 flex items-center justify-center rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 transition-colors"
          >
            {copied ? <Check size={28} /> : <Copy size={28} />}
          </button>
        </div>
      </div>

      <div className="flex justify-between items-end mb-6 px-4">
        <div className="flex items-center gap-3 bg-white dark:bg-slate-800 px-6 py-3 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10">
          <Users className="text-indigo-500" size={24} />
          <span className="text-2xl font-bold text-slate-900 dark:text-white">{participantsList.length}</span>
          <span className="text-slate-500 dark:text-slate-400 font-medium">Players Connected</span>
        </div>
        
        <motion.button 
          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
          onClick={startGame}
          disabled={participantsList.length === 0 || startingGame}
          className="flex justify-center items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:hover:bg-emerald-500 text-white px-8 py-4 rounded-2xl font-bold text-xl shadow-xl shadow-emerald-500/30 transition-all"
        >
          <Play size={24} /> {startingGame ? "Starting..." : "Start Game"}
        </motion.button>
      </div>

      {startError && (
        <div className="mx-4 mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          {startError}
        </div>
      )}

      <div className="bg-white/50 dark:bg-slate-800/50 rounded-3xl p-8 min-h-[400px] border border-gray-200 dark:border-white/5">
        <AnimatePresence>
          {participantsList.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full pt-20 text-slate-400 dark:text-slate-500"
            >
              <div className="w-16 h-16 rounded-full border-4 border-dashed border-slate-300 dark:border-slate-600 animate-[spin_3s_linear_infinite] mb-6" />
              <p className="text-2xl font-medium tracking-tight">Waiting for players...</p>
            </motion.div>
          ) : (
            <div className="flex flex-wrap gap-4 justify-center">
              {participantsList.map(p => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, scale: 0.5, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: "spring", bounce: 0.6 }}
                  className="bg-white dark:bg-slate-700 px-6 py-3 rounded-xl shadow-md border border-gray-100 dark:border-white/10 font-bold text-lg text-slate-800 dark:text-white"
                >
                  {p.display_name}
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
