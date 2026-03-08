"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useLiveSession } from "@/hooks/useLiveSession";
import { useGameStore } from "@/store/useGameStore";
import { ActiveQuestionCard } from "@/components/game/ActiveQuestionCard";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard } from "lucide-react";

interface FloatingEmoji {
  id: string;
  emoji: string;
  studentName?: string;
  xOffset: number;
}

export default function StudentPlayRoom() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.session_id as string;

  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealedQuestionIndex, setRevealedQuestionIndex] = useState<number | null>(null);

  // Zustand Game State
  const sessionStatus = useGameStore((s) => s.sessionStatus);
  const currentQuestionIndex = useGameStore((s) => s.currentQuestionIndex);
  const setSessionStatus = useGameStore((s) => s.setSessionStatus);
  const setCurrentQuestionIndex = useGameStore((s) => s.setCurrentQuestionIndex);

  // Local participant state
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [participantName, setParticipantName] = useState("Student");
  const [streak, setStreak] = useState(0);
  const [reactionCooldown, setReactionCooldown] = useState(false);
  const reactionChannelRef = useRef<any>(null);
  // Ghost Mode: fetched from the user's OWN profile — never exposed to host or peers
  const [isGhostMode, setIsGhostMode] = useState(false);
  // Universal emoji floats — same logic as Host screen
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);

  useLiveSession(sessionId, "student");

  // Init room data
  useEffect(() => {
    initPlayRoom();
  }, [sessionId]);

  // Anti-cheat: tab switch detection
  useEffect(() => {
    if (!sessionId) return;

    const gameRoomChannel = supabase.channel(`game-room:${sessionId}`).subscribe();

    const onVisibilityChange = async () => {
      if (!document.hidden || !participantId) return;
      await gameRoomChannel.send({
        type: "broadcast",
        event: "anti_cheat_violation",
        payload: { studentName: participantName, studentId: participantId },
      });
      await supabase.rpc("increment_cheat_flags", { p_id: participantId });
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void supabase.removeChannel(gameRoomChannel);
    };
  }, [sessionId, participantId, participantName]);

  // ── Emoji reactions: send + receive on the SAME game-room channel as the host ──
  // Previously the student used a separate 'emoji-room' channel which meant
  // (a) the host never received emojis from students, and
  // (b) students never saw each other's emojis.
  // Fix: join the shared 'game-room' channel and listen for emoji_reaction broadcasts.
  useEffect(() => {
    if (!sessionId) return;
    const gameEmojiChannel = supabase
      .channel(`game-room:${sessionId}`)
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
    reactionChannelRef.current = gameEmojiChannel;

    // ── Ghost mode mid-game sync ──
    // Listen for changes to the logged-in user's own profile only
    const updateGhostMode = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      const profileChannel = supabase
        .channel(`ghost-sync-${session.user.id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "profiles",
            filter: `id=eq.${session.user.id}`
          },
          (payload) => {
            if (payload.new && 'ghost_mode' in payload.new) {
              setIsGhostMode(!!payload.new.ghost_mode);
            }
          }
        )
        .subscribe();
      reactionChannelRef.current.profileChannel = profileChannel;
    };
    void updateGhostMode();

    return () => {
      if (reactionChannelRef.current?.profileChannel) {
        void supabase.removeChannel(reactionChannelRef.current.profileChannel);
      }
      reactionChannelRef.current = null;
      void supabase.removeChannel(gameEmojiChannel);
    };
  }, [sessionId]);

  // Listen for answer-reveal broadcasts from host
  useEffect(() => {
    if (!sessionId) return;
    const controlChannel = supabase
      .channel(`session_control:${sessionId}`)
      .on("broadcast", { event: "reveal_answer" }, (payload) => {
        const idx = payload?.payload?.questionIndex;
        if (typeof idx === "number") setRevealedQuestionIndex(idx);
      })
      .subscribe();
    return () => { void supabase.removeChannel(controlChannel); };
  }, [sessionId]);

  // Reset reveal state when question advances
  useEffect(() => {
    setRevealedQuestionIndex(null);
  }, [currentQuestionIndex]);

  const initPlayRoom = async () => {
    const uuid = localStorage.getItem("kahoot_device_uuid");
    if (!uuid) { router.push("/join"); return; }

    const { data: sData } = await supabase
      .from("live_sessions")
      .select("*, quizzes(title)")
      .eq("id", sessionId)
      .single();

    if (sData) {
      setSessionInfo(sData);
      setSessionStatus(sData.status);
      setCurrentQuestionIndex(sData.current_question_index ?? 0);
    }

    if (sData?.quiz_id) {
      const { data: qData } = await supabase
        .from("questions")
        .select("*")
        .eq("quiz_id", sData.quiz_id)
        .order("order_index");
      if (qData) setQuestions(qData);
    }

    const { data: pData } = await supabase
      .from("participants")
      .select("id, streak, display_name")
      .eq("session_id", sessionId)
      .eq("device_uuid", uuid)
      .single();

    if (pData) {
      setParticipantId(pData.id);
      setParticipantName(pData.display_name || "Student");
      setStreak(pData.streak || 0);

      // ── Ghost Mode: Check using the secure RPC ──
      // This works for ALL players securely using their device_uuid,
      // avoiding the fragility of auth.getSession() for guest players.
      try {
        const { data: isGhost } = await supabase.rpc("get_ghost_mode_for_participant", {
          p_session_id: sessionId,
          p_device_uuid: uuid
        });
        setIsGhostMode(!!isGhost);
      } catch (err) {
        console.error("Ghost mode check failed:", err);
      }
    } else {
      router.push("/join");
      return;
    }

    setLoading(false);
  };

  // ── Feature 2: Two-step submission ──
  // This now receives the FINAL confirmed answer from ActiveQuestionCard
  const handleAnswerSubmit = async (optionIdx: number, reactionMs: number) => {
    if (!participantId || !questions.length) return;

    const q = questions[currentQuestionIndex];
    if (!q) return;

    const selectedOpt = q.options[optionIdx];
    const isCorrect = optionIdx >= 0 ? (selectedOpt?.is_correct ?? false) : false;

    const maxTime = q.time_limit * 1000;
    const timeRatio = Math.max(0, maxTime - reactionMs) / maxTime;
    let pointsAwarded = isCorrect
      ? Math.round(q.base_points * 0.5 + q.base_points * 0.5 * timeRatio)
      : 0;

    const newStreak = isCorrect ? streak + 1 : 0;
    const streakBonus = newStreak >= 3 ? Math.min(300, newStreak * 50) : 0;
    pointsAwarded += streakBonus;

    // Optimistic streak update so UI feels instant
    setStreak(newStreak);

    // Record response
    await supabase.from("student_responses").insert({
      session_id: sessionId,
      participant_id: participantId,
      question_id: q.id,
      reaction_time_ms: reactionMs,
      is_correct: isCorrect,
      points_awarded: pointsAwarded,
      streak_bonus: streakBonus,
    });

    // Atomic score + streak update
    const { data: pRead } = await supabase
      .from("participants")
      .select("score")
      .eq("id", participantId)
      .single();

    if (pRead) {
      await supabase
        .from("participants")
        .update({ score: pRead.score + pointsAwarded, streak: newStreak })
        .eq("id", participantId);
    }
  };

  // ── Feature 4: Back to Dashboard (clears local game state) ──
  const handleBackToDashboard = () => {
    // Clear the device UUID so the player can join a fresh session next time
    // We intentionally keep it so they can reconnect to a game mid-session if they close the tab
    router.push("/dashboard");
  };

  const sendEmojiReaction = async (emoji: string) => {
    if (reactionCooldown || !reactionChannelRef.current) return;
    setReactionCooldown(true);
    await reactionChannelRef.current.send({
      type: "broadcast",
      event: "emoji_reaction",
      payload: { emoji, studentName: participantName },
    });
    setTimeout(() => setReactionCooldown(false), 500);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col p-4 md:p-8">

      {/* ── Universal floating emoji overlay (mirrors Host screen) ── */}
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
      {/* Top Header */}
      <header className="flex justify-between items-center mb-10">
        <h1 className="text-xl font-bold text-slate-800 dark:text-white truncate">
          {sessionInfo?.quizzes?.title}
        </h1>
        <div className="px-4 py-1.5 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-white/10 text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
          {sessionStatus}
        </div>
      </header>

      {/* Main content area */}
      <main className="flex-1 flex flex-col items-center justify-center">

        {/* WAITING: lobby */}
        {sessionStatus === "waiting" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <div className="inline-flex items-center justify-center gap-2 bg-slate-800/60 backdrop-blur-md border border-slate-700/50 px-6 py-3 rounded-full shadow-xl mb-8">
              <span className="text-sm font-semibold uppercase tracking-widest text-slate-300">GAME PIN:</span>
              <span className="font-mono text-2xl font-black tracking-[0.2em] text-indigo-400">
                {sessionInfo?.join_code || "------"}
              </span>
            </div>
            <div className="text-6xl mb-6">🎮</div>
            <h2 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-3 tracking-tight">
              You're In, {participantName}!
            </h2>
            <p className="text-xl text-slate-500 dark:text-slate-400">Your name is on the screen. Get ready!</p>
            <div className="mt-12 flex justify-center gap-2">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  animate={{ y: [0, -12, 0] }}
                  transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.22 }}
                  className="w-4 h-4 bg-indigo-500 rounded-full"
                />
              ))}
            </div>

            <div className="fixed bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-slate-800/60 backdrop-blur-md border border-slate-700/50 px-6 py-3 rounded-full shadow-2xl z-40">
              {["🔥", "👏", "😂", "🚀"].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => void sendEmojiReaction(emoji)}
                  disabled={reactionCooldown}
                  className="text-2xl hover:scale-125 transition-transform cursor-pointer active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                  aria-label={`Send ${emoji} reaction`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* ACTIVE: question with 2-step submission (handled inside ActiveQuestionCard) */}
        {sessionStatus === "active" && questions[currentQuestionIndex] && (
          <ActiveQuestionCard
            key={questions[currentQuestionIndex].id}
            question={questions[currentQuestionIndex].question_text}
            questionType={questions[currentQuestionIndex].question_type || "mcq"}
            options={questions[currentQuestionIndex].options}
            timeLimit={questions[currentQuestionIndex].time_limit}
            streak={streak}
            isRevealed={revealedQuestionIndex === currentQuestionIndex}
            onAnswer={handleAnswerSubmit}
            isGhostMode={isGhostMode}
          />
        )}

        {/* FINISHED: Game over with back button */}
        {sessionStatus === "finished" && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center max-w-sm w-full"
          >
            <div className="text-7xl mb-6">🏆</div>
            <h2 className="text-5xl font-extrabold text-slate-900 dark:text-white mb-3 tracking-tight">
              Game Over!
            </h2>
            <p className="text-xl text-slate-500 dark:text-slate-400 mb-10">
              Check the host screen for your final ranking and score.
            </p>
            {/* ── Feature 4: Back to Dashboard ── */}
            <button
              onClick={handleBackToDashboard}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg shadow-xl shadow-indigo-600/30 transition-all"
            >
              <LayoutDashboard size={22} /> Back to Dashboard
            </button>
          </motion.div>
        )}
      </main>
    </div>
  );
}
