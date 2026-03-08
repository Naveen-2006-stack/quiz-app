"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useLiveSession } from "@/hooks/useLiveSession";
import { useGameStore } from "@/store/useGameStore";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Play, Copy, Check, ArrowLeft, CheckSquare, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

interface LiveSession {
  id: string;
  join_code: string;
  quiz_id: string;
  status: string;
  quizzes?: { title: string; questions: { id: string }[] };
}

interface FlaggedStudent {
  studentId: string;
  studentName: string;
  flaggedAt: string;
}

interface FloatingEmoji {
  id: string;
  emoji: string;
  studentName?: string;
  xOffset: number;
}

export default function HostRoom() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.session_id as string;

  const [sessionInfo, setSessionInfo] = useState<LiveSession | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [startingGame, setStartingGame] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [advancingQuestion, setAdvancingQuestion] = useState(false);
  const [flaggedStudents, setFlaggedStudents] = useState<FlaggedStudent[]>([]);
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);

  // Live submission counter state
  const [submissionCount, setSubmissionCount] = useState(0);

  const controlChannelRef = useRef<any>(null);

  // Zustand game store
  const participantsMap = useGameStore((s) => s.participants);
  const sessionStatus = useGameStore((s) => s.sessionStatus);
  const currentQuestionIndex = useGameStore((s) => s.currentQuestionIndex);
  const setParticipants = useGameStore((s) => s.setParticipants);
  const setSessionStatus = useGameStore((s) => s.setSessionStatus);
  const setCurrentQuestionIndex = useGameStore((s) => s.setCurrentQuestionIndex);

  useLiveSession(sessionId, "teacher");

  // Initial data fetch
  useEffect(() => {
    fetchSession();
  }, [sessionId]);

  // Control channel (for reveal broadcasts)
  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase.channel(`session_control:${sessionId}`).subscribe();
    controlChannelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      controlChannelRef.current = null;
    };
  }, [sessionId]);

  // Anti-cheat broadcast listener
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
          { studentId, studentName: studentName || "Unknown", flaggedAt: new Date().toISOString() },
        ]);
      })
      .on("broadcast", { event: "emoji_reaction" }, (payload) => {
        const emoji = payload?.payload?.emoji as string | undefined;
        const studentName = payload?.payload?.studentName as string | undefined;
        if (!emoji) return;

        const id = `${Date.now()}-${Math.random()}`;
        const xOffset = Math.floor(Math.random() * 260) - 130;
        setFloatingEmojis((prev) => [...prev, { id, emoji, studentName, xOffset }]);

        setTimeout(() => {
          setFloatingEmojis((prev) => prev.filter((item) => item.id !== id));
        }, 2000);
      })
      .subscribe();
    return () => { void supabase.removeChannel(gameRoomChannel); };
  }, [sessionId]);

  // ── Feature 3: Live Submission Counter ──
  // Listen to INSERT events on student_responses for the current question.
  // Reset counter when question index changes.
  useEffect(() => {
    setSubmissionCount(0); // reset on every question change
  }, [currentQuestionIndex]);

  useEffect(() => {
    if (!sessionId || !questions[currentQuestionIndex]) return;
    const qId = questions[currentQuestionIndex]?.id;
    if (!qId) return;

    const subChannel = supabase
      .channel(`submissions:${sessionId}:${qId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "student_responses",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          // Only count responses for the current question
          if ((payload.new as any).question_id === qId) {
            setSubmissionCount((c) => c + 1);
          }
        }
      )
      .subscribe();

    return () => { void supabase.removeChannel(subChannel); };
  }, [sessionId, questions, currentQuestionIndex]);

  const fetchSession = async () => {
    const { data: sData } = await supabase
      .from("live_sessions")
      .select("*, quizzes(title, questions(*))")
      .eq("id", sessionId)
      .single();

    if (sData) {
      setSessionInfo(sData as any);
      const sorted = sData.quizzes?.questions?.sort((a: any, b: any) => a.order_index - b.order_index) || [];
      setQuestions(sorted);
      setSessionStatus(sData.status);
      setCurrentQuestionIndex(sData.current_question_index ?? 0);
    }

    const { data: pData } = await supabase.from("participants").select("*").eq("session_id", sessionId);
    if (pData) setParticipants(pData);
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
      const { data: ok, error } = await supabase.rpc("start_live_session", { session_uuid: sessionId });
      if (error || ok !== true) {
        // Fallback direct update
        const { data: { session } } = await supabase.auth.getSession();
        const { error: updateError } = await supabase
          .from("live_sessions")
          .update({ status: "active", started_at: new Date().toISOString() })
          .eq("id", sessionId)
          .eq("teacher_id", session?.user?.id);
        if (updateError) throw new Error("Could not start game. Check your permissions.");
      }
      setSessionStatus("active");
    } catch (err: any) {
      setStartError(err?.message || "Failed to start. Please try again.");
    } finally {
      setStartingGame(false);
    }
  };

  const nextQuestion = async () => {
    if (!questions.length || advancingQuestion) return;
    setAdvancingQuestion(true);

    // Broadcast reveal-answer event to all students
    await controlChannelRef.current?.send({
      type: "broadcast",
      event: "reveal_answer",
      payload: { sessionId, questionIndex: currentQuestionIndex },
    });

    await new Promise((r) => setTimeout(r, 1400));

    const isLast = currentQuestionIndex >= questions.length - 1;
    if (isLast) {
      await supabase
        .from("live_sessions")
        .update({ status: "finished", finished_at: new Date().toISOString() })
        .eq("id", sessionId);
    } else {
      await supabase
        .from("live_sessions")
        .update({ current_question_index: currentQuestionIndex + 1 })
        .eq("id", sessionId);
    }
    setAdvancingQuestion(false);
  };

  // ── Feature 4: Back to Dashboard (clears game state) ──
  const handleBackToDashboard = () => {
    // Clear any game-local state; Zustand resets on next mount
    router.push("/dashboard");
  };

  const participantsList = Object.values(participantsMap);
  const totalPlayers = participantsList.length;

  // ───────── ACTIVE / FINISHED screen ─────────
  if (sessionStatus === "active" || sessionStatus === "finished") {
    const sortedParticipants = [...participantsList].sort((a, b) => b.score - a.score);
    const activeQ = questions[currentQuestionIndex];

    return (
      <div className="max-w-7xl mx-auto py-8 px-4">
        <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
          <AnimatePresence>
            {floatingEmojis.map((item) => (
              <motion.div
                key={item.id}
                initial={{ y: 50, opacity: 0, scale: 0.8 }}
                animate={{ y: -200, opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ duration: 1.8, ease: "easeOut" }}
                className="absolute bottom-10 left-1/2 text-4xl drop-shadow-2xl"
                style={{ transform: `translateX(${item.xOffset}px)` }}
                title={item.studentName || "Student"}
              >
                {item.emoji}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Security Flags */}
        {flaggedStudents.length > 0 && (
          <div className="mb-6 rounded-2xl border border-rose-300 bg-rose-50 p-4 dark:border-rose-500/40 dark:bg-rose-500/10">
            <h3 className="text-sm font-extrabold uppercase tracking-wide text-rose-700 dark:text-rose-300 mb-2">Security Flags</h3>
            {flaggedStudents.map((f) => (
              <div key={`${f.studentId}-${f.flaggedAt}`} className="text-sm font-semibold text-rose-600 dark:text-rose-400 py-1">
                ⚠️ {f.studentName} switched tabs
              </div>
            ))}
          </div>
        )}

        {/* Active Question Panel */}
        {sessionStatus === "active" && activeQ && (
          <div className="mb-10 bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] shadow-xl border border-indigo-50 dark:border-white/5">
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
              <span className="px-4 py-2 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 font-bold rounded-xl text-sm tracking-widest uppercase">
                Question {currentQuestionIndex + 1} of {questions.length}
              </span>

              {/* ── Feature 3: Submission Counter Badge ── */}
              <div className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30">
                <CheckSquare size={18} className="text-emerald-600 dark:text-emerald-400" />
                <span className="font-black text-emerald-700 dark:text-emerald-400 text-lg tabular-nums">
                  {submissionCount}
                  <span className="font-semibold text-emerald-500 dark:text-emerald-500/80"> / {totalPlayers}</span>
                </span>
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-500">submitted</span>
              </div>

              <span className="text-slate-500 font-medium font-mono">{activeQ.time_limit}s</span>
            </div>

            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-8 leading-tight">
              {activeQ.question_text}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeQ.options.map((opt: any, idx: number) => (
                <div
                  key={idx}
                  className={cn(
                    "p-5 text-lg font-semibold rounded-2xl border-2",
                    opt.is_correct
                      ? "bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                      : "bg-gray-50 border-transparent dark:bg-slate-900 dark:text-slate-300"
                  )}
                >
                  {opt.text}
                </div>
              ))}
            </div>

            <div className="mt-8 flex justify-end gap-3 items-center">
              {/* Progress hint text */}
              {submissionCount > 0 && submissionCount < totalPlayers && (
                <span className="text-sm text-slate-400 dark:text-slate-500">
                  Waiting for {totalPlayers - submissionCount} more…
                </span>
              )}
              {submissionCount >= totalPlayers && totalPlayers > 0 && (
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Everyone's in! ✅</span>
              )}
              <motion.button
                onClick={nextQuestion}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                disabled={advancingQuestion}
                className="bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 disabled:opacity-60 text-white px-8 py-4 rounded-xl font-bold transition-all shadow-xl"
              >
                {advancingQuestion
                  ? "Revealing…"
                  : currentQuestionIndex >= questions.length - 1
                  ? "End Game"
                  : "Next Question →"}
              </motion.button>
            </div>
          </div>
        )}

        {/* ── Feature 4: Game Over screen with "Back to Dashboard" ── */}
        {sessionStatus === "finished" && (
          <div className="text-center mb-12">
            <div className="text-6xl mb-4">🏆</div>
            <h2 className="text-5xl font-black text-slate-900 dark:text-white mb-3">Final Standings</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-8">The game has concluded. Great job everyone!</p>
            <button
              onClick={handleBackToDashboard}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-600/20 transition-all"
            >
              <LayoutDashboard size={20} /> Back to Dashboard
            </button>
          </div>
        )}

        {/* Leaderboard */}
        <div className="grid grid-cols-1 gap-3 max-w-4xl mx-auto">
          <AnimatePresence>
            {sortedParticipants.map((p, idx) => (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", delay: idx * 0.04 }}
                className="flex items-center gap-6 bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5"
              >
                <div className={cn(
                  "w-10 h-10 flex items-center justify-center rounded-xl text-lg font-black",
                  idx === 0 ? "bg-amber-400 text-white" : idx === 1 ? "bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-white" : idx === 2 ? "bg-orange-400 text-white" : "bg-gray-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                )}>#{idx + 1}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">{p.display_name}</h3>
                    {p.cheat_flags > 0 && (
                      <span className="bg-rose-100 text-rose-600 text-xs font-bold px-2 py-0.5 rounded-md">⚠️ {p.cheat_flags} flag{p.cheat_flags > 1 ? "s" : ""}</span>
                    )}
                  </div>
                  {p.streak > 0 && <div className="text-xs font-semibold text-amber-500 mt-0.5">🔥 {p.streak} streak</div>}
                </div>
                <div className="text-3xl font-black tabular-nums text-indigo-600 dark:text-indigo-400">
                  {p.score.toLocaleString()}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // ───────── WAITING LOBBY screen ─────────
  return (
    <div className="max-w-5xl mx-auto py-12 px-4">
      <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
        <AnimatePresence>
          {floatingEmojis.map((item) => (
            <motion.div
              key={item.id}
              initial={{ y: 50, opacity: 0, scale: 0.8 }}
              animate={{ y: -200, opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 1.8, ease: "easeOut" }}
              className="absolute bottom-10 left-1/2 text-4xl drop-shadow-2xl"
              style={{ transform: `translateX(${item.xOffset}px)` }}
              title={item.studentName || "Student"}
            >
              {item.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Back link */}
      <button onClick={() => router.push("/dashboard")} className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-8 group">
        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" /> Back to Dashboard
      </button>

      {/* Join code display */}
      <div className="text-center mb-12">
        <p className="text-slate-500 dark:text-slate-400 font-medium mb-3">Students join at <strong className="text-slate-900 dark:text-white">levelnlearn.vercel.app</strong></p>
        <div className="inline-flex items-center gap-4 bg-white dark:bg-slate-800 p-4 pl-8 rounded-full shadow-2xl shadow-indigo-500/10 border border-gray-100 dark:border-white/10">
          <span className="text-6xl font-mono tracking-[0.2em] font-bold text-slate-800 dark:text-white">
            {sessionInfo?.join_code || "------"}
          </span>
          <button
            onClick={copyPin}
            className="w-16 h-16 flex items-center justify-center rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 transition-colors"
          >
            {copied ? <Check size={28} /> : <Copy size={28} />}
          </button>
        </div>
      </div>

      {/* Player count + Start button */}
      <div className="flex justify-between items-end mb-6">
        <div className="flex items-center gap-3 bg-white dark:bg-slate-800 px-6 py-3 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10">
          <Users className="text-indigo-500" size={24} />
          <span className="text-2xl font-bold text-slate-900 dark:text-white">{participantsList.length}</span>
          <span className="text-slate-500 dark:text-slate-400 font-medium">Players Connected</span>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={startGame}
          disabled={participantsList.length === 0 || startingGame}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-8 py-4 rounded-2xl font-bold text-xl shadow-xl shadow-emerald-500/30 transition-all"
        >
          <Play size={24} /> {startingGame ? "Starting…" : "Start Game"}
        </motion.button>
      </div>

      {startError && (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          {startError}
        </div>
      )}

      {/* Player grid */}
      <div className="bg-white/50 dark:bg-slate-800/50 rounded-3xl p-8 min-h-[380px] border border-gray-200 dark:border-white/5">
        <AnimatePresence>
          {participantsList.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full pt-16 text-slate-400 dark:text-slate-500"
            >
              <div className="w-16 h-16 rounded-full border-4 border-dashed border-slate-300 dark:border-slate-600 animate-[spin_3s_linear_infinite] mb-6" />
              <p className="text-2xl font-medium tracking-tight">Waiting for players…</p>
            </motion.div>
          ) : (
            <div className="flex flex-wrap gap-3 justify-center">
              {participantsList.map((p) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, scale: 0.5, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: "spring", bounce: 0.6 }}
                  className="bg-white dark:bg-slate-700 px-5 py-2.5 rounded-xl shadow-md border border-gray-100 dark:border-white/10 font-bold text-lg text-slate-800 dark:text-white"
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
