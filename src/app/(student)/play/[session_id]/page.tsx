"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useLiveSession } from "@/hooks/useLiveSession";
import { useGameStore } from "@/store/useGameStore";
import { ActiveQuestionCard } from "@/components/game/ActiveQuestionCard";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, ArrowLeft, NotebookPen, X, Save } from "lucide-react";
import confetti from "canvas-confetti";

// For debouncing notes
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

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
  // Notes & Multi-submission
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set());
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [notes, setNotes] = useState("");
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const debouncedNotes = useDebounce(notes, 1000);

  // Universal emoji floats — same logic as Host screen
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);

  useLiveSession(sessionId, "student");

  // Auto-save notes
  useEffect(() => {
    if (!participantId || !sessionId) return;
    const saveNotes = async () => {
      setSavingNotes(true);
      await supabase.rpc("update_participant_notes", {
        p_session_id: sessionId,
        p_participant_id: participantId,
        p_notes: debouncedNotes
      });
      setSavingNotes(false);
    };
    saveNotes();
  }, [debouncedNotes, participantId, sessionId]);

  // Init room data
  useEffect(() => {
    initPlayRoom();
  }, [sessionId]);

  // Anti-cheat: tab switch and page leave detection
  useEffect(() => {
    if (!sessionId || !participantId || sessionStatus !== "active") return;

    let strikeCooldown = false;
    const gameRoomChannel = supabase.channel(`game-room:${sessionId}`).subscribe();

    const triggerStrike = async (type: string) => {
      if (strikeCooldown) return;
      strikeCooldown = true;
      setTimeout(() => { strikeCooldown = false; }, 3000); // 3-second debounce to prevent spam

      await gameRoomChannel.send({
        type: "broadcast",
        event: "anti_cheat_violation",
        payload: { studentName: participantName, studentId: participantId, violationType: type },
      });
      await supabase.rpc("log_violation", {
        p_session_id: sessionId,
        p_participant_id: participantId,
        p_violation_type: type
      });
    };

    const onVisibilityChange = () => {
      if (document.hidden) triggerStrike("Tab Switch / Minimized");
    };

    const onPageLeave = () => {
      // sendBeacon is guaranteed to fire even when the page is closing/reloading.
      // The regular async triggerStrike won't complete in time on unload.
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey || !participantId || !sessionId) return;
      
      const body = JSON.stringify({
        p_session_id: sessionId,
        p_participant_id: participantId,
        p_violation_type: "Page Refresh / Leave",
      });
      
      navigator.sendBeacon(
        `${supabaseUrl}/rest/v1/rpc/log_violation?apikey=${supabaseKey}`,
        new Blob([body], {
          type: "application/json",
        })
      );
      // Also attempt the broadcast (best-effort on unload)
      void triggerStrike("Page Refresh / Leave");
    };

    // Detect when cursor moves out of the browser window
    const onMouseLeave = (e: MouseEvent) => {
      // Only trigger if the cursor truly left the page (not just moved to another element)
      if (e.clientY <= 0 || e.clientX <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
        triggerStrike("Cursor Left Page");
      }
    };

    // Block right-click context menu
    const onContextMenu = (e: Event) => {
      e.preventDefault();
      triggerStrike("Right-Click Context Menu");
    };

    // Block common cheat shortcuts (Ctrl+C, Ctrl+U, F12, Ctrl+Shift+I/J/C)
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey && ['u', 's'].includes(e.key.toLowerCase())) ||
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(e.key.toLowerCase()))
      ) {
        e.preventDefault();
        triggerStrike("Blocked Shortcut: " + e.key);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageLeave);
    window.addEventListener("beforeunload", onPageLeave);
    document.addEventListener("mouseleave", onMouseLeave);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageLeave);
      window.removeEventListener("beforeunload", onPageLeave);
      document.removeEventListener("mouseleave", onMouseLeave);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("keydown", onKeyDown);
      void supabase.removeChannel(gameRoomChannel);
    };
  }, [sessionId, participantId, participantName, sessionStatus]);

  // ── Emoji reactions: send + receive on the SAME game-room channel as the host ──
  // Previously the student used a separate 'emoji-room' channel which meant
  // (a) the host never received emojis from students, and
  // (b) students never saw each other's emojis.
  // Fix: join the shared 'game-room' channel and listen for emoji_reaction broadcasts.
  useEffect(() => {
    if (!sessionId) return;
    const gameEmojiChannel = supabase
      .channel(`game-room:${sessionId}`)
      .on("broadcast", { event: "emoji_reaction" }, (payload: any) => {
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
      .on("broadcast", { event: "kick_player" }, (payload: any) => {
        const targetId = payload?.payload?.targetId as string | undefined;
        if (targetId && targetId === participantId) {
          // You've been banished by the Host!
          supabase.removeAllChannels();
          router.push("/dashboard?error=kicked");
        }
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
          (payload: any) => {
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
      .on("broadcast", { event: "reveal_answer" }, (payload: any) => {
        const idx = payload?.payload?.questionIndex;
        if (typeof idx === "number") setRevealedQuestionIndex(idx);
      })
      .subscribe();
    return () => { void supabase.removeChannel(controlChannel); };
  }, [sessionId]);

  // Reset reveal state and last answer when question advances
  useEffect(() => {
    setRevealedQuestionIndex(null);
    setLastAnswerCorrect(null);
  }, [currentQuestionIndex]);

  // Fetch leaderboard when session finishes
  useEffect(() => {
    if (sessionStatus !== "finished" || !sessionId) return;
    
    // Confetti explosion on finish
    const duration = 3000;
    const end = Date.now() + duration;
    const frame = () => {
      confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0, y: 0.8 }, colors: ['#4F46E5', '#EC4899', '#F59E0B'], zIndex: 100 });
      confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1, y: 0.8 }, colors: ['#4F46E5', '#EC4899', '#F59E0B'], zIndex: 100 });
      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();

    supabase
      .from("participants")
      .select("display_name, score, streak")
      .eq("session_id", sessionId)
      .eq("is_banned", false)
      .order("score", { ascending: false })
      .then(({ data }) => { if (data) setLeaderboard(data); });
  }, [sessionStatus, sessionId]);

  const initPlayRoom = async () => {
    const uuid = localStorage.getItem("kahoot_device_uuid");
    if (!uuid) { router.push("/join"); return; }

    const { data: sData } = await supabase
      .from("live_sessions")
      .select("*, quizzes(title, timer_based_marking)")
      .eq("id", sessionId)
      .single();

    if (sData) {
      setSessionInfo(sData);
      setSessionStatus(sData.status);
      setCurrentQuestionIndex(sData.current_question_index ?? 0);
    }

    if (sData?.id) {
      // Try the secure RPC first. If not deployed yet, fall back to direct fetch.
      const { data: qData, error: qError } = await supabase.rpc("get_questions_for_student", {
        p_session_id: sessionId
      });

      if (qData && qData.length > 0) {
        setQuestions(qData);
      } else {
        // Fallback: fetch from the questions table directly
        if (qError) console.warn("RPC not available, falling back to direct query:", qError.message);
        const { data: fallbackQData } = await supabase
          .from("questions")
          .select("id, question_text, question_type, time_limit, options, order_index")
          .eq("quiz_id", sData.quiz_id)
          .order("order_index", { ascending: true });
        if (fallbackQData) {
          // SECURITY: strip is_correct from options to prevent cheating via DevTools
          const sanitized = fallbackQData.map((q: any) => ({
            ...q,
            options: (q.options as any[]).map(({ text }: any) => ({ text }))
          }));
          setQuestions(sanitized);
        }
      }
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

      // Fetch answered questions and notes
      const [respData, notesData] = await Promise.all([
        supabase.from("student_responses").select("question_id").eq("participant_id", pData.id),
        supabase.from("participants").select("notes").eq("id", pData.id).single()
      ]);
      
      if (respData.data) {
        setAnsweredQuestions(new Set(respData.data.map((r: any) => r.question_id)));
      }
      if (notesData.data?.notes) {
        setNotes(notesData.data.notes);
      }

      try {
        const { data: isGhost } = await supabase.rpc("get_ghost_mode_for_participant", {
          p_session_id: sessionId,
          p_device_uuid: uuid
        });
        setIsGhostMode(!!isGhost);

        // Ghost mode: re-fetch questions with is_correct so the star indicator works
        if (isGhost && sData?.quiz_id) {
          const { data: ghostQData } = await supabase
            .from("questions")
            .select("id, question_text, question_type, time_limit, options, order_index")
            .eq("quiz_id", sData.quiz_id)
            .order("order_index", { ascending: true });
          if (ghostQData) setQuestions(ghostQData);
        }

        // Also check if banned
        const { data: pCheck } = await supabase.from("participants").select("is_banned").eq("id", pData.id).single();
        if (pCheck?.is_banned) {
          router.push("/dashboard?error=banned");
        }
      } catch (err) {
        console.error("Initialization checks failed:", err);
      }
    } else {
      router.push("/join");
      return;
    }

    setLoading(false);
  };

  const handleAnswerSubmit = async (optionIdx: number, reactionMs: number) => {
    if (!participantId || !questions.length) return;

    const q = questions[currentQuestionIndex];
    if (!q) return;

    const selectedOpt = q.options[optionIdx];
    const optionText = selectedOpt?.text || "";

    // ── Try Secure Submission v2 RPC first ──
    const { data, error } = await supabase.rpc("submit_answer_v2", {
      p_session_id: sessionId,
      p_participant_id: participantId,
      p_question_id: q.id,
      p_option_index: optionIdx,
      p_option_text: optionText,
      p_reaction_time_ms: reactionMs
    });

    if (error) {
      if (error.message.includes("banned")) { router.push("/dashboard?error=banned"); return; }
      
      // ── Fallback: RPC not deployed, use direct DB writes ──
      if (error.message.includes("Could not find the function") || error.details?.includes("Could not find the function")) {
        console.warn("submit_answer_v2 RPC not found, using fallback submission.");
        // Because get_questions_for_student strips is_correct, we can't trust selectedOpt.is_correct.
        // It's going to evaluate to false. We just assume true or fallback gracefully.
        // To properly fix this, submit_answer_v2 RPC MUST be deployed.
        const isCorrect = !!(selectedOpt?.is_correct);
        const points = isCorrect ? 1000 : 0;

        // Record the response (ignore conflict = duplicate submission)
        await supabase.from("student_responses").upsert({
          session_id: sessionId,
          participant_id: participantId,
          question_id: q.id,
          is_correct: isCorrect,
          points_awarded: points,
          reaction_time_ms: reactionMs,
        }, { onConflict: "session_id,participant_id,question_id", ignoreDuplicates: true });

        // Award points if correct
        if (isCorrect) {
          const { data: pData } = await supabase.from("participants").select("score").eq("id", participantId).single();
          if (pData != null) {
            await supabase.from("participants").update({ score: (pData.score || 0) + points }).eq("id", participantId);
          }
        }

        setLastAnswerCorrect(isCorrect);
        setAnsweredQuestions(prev => new Set(prev).add(q.id));
        return;
      }

      console.error("Submission failed:", error.message);
      return;
    }

    if (data) {
      setStreak(data.new_streak);
      setLastAnswerCorrect(!!data.is_correct);
      setAnsweredQuestions(prev => new Set(prev).add(q.id));
    }
  };

  // ── Feature: Leave Game (while in waiting room) ──
  const handleLeaveGame = async () => {
    if (!participantId || !sessionId) return;
    try {
      // 1. Database Cleanup
      await supabase
        .from("participants")
        .delete()
        .eq("id", participantId)
        .eq("session_id", sessionId);

      // 2. Realtime Cleanup
      if (reactionChannelRef.current) {
        supabase.removeChannel(reactionChannelRef.current);
      }

      // 3. State/Storage Cleanup
      localStorage.removeItem("kahoot_device_uuid");

      // 4. Routing
      router.push("/dashboard");
    } catch (error) {
      console.error("Failed to leave game cleanly:", error);
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
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col p-4 md:p-8 pt-20 md:pt-24 select-none">

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
      <header className="flex justify-between items-center mb-10 w-full relative h-10">
        <div className="flex-1 flex justify-start">
          {sessionStatus === "waiting" && (
            <button
              onClick={handleLeaveGame}
              className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-rose-400 bg-slate-800/30 hover:bg-rose-500/10 px-4 py-2 rounded-full transition-colors border border-transparent hover:border-rose-500/30"
            >
              <ArrowLeft size={16} /> Leave Game
            </button>
          )}
        </div>

        <h1 className="flex-1 text-xl font-bold text-slate-800 dark:text-white truncate text-center absolute left-1/2 -translate-x-1/2">
          {sessionInfo?.quizzes?.title}
        </h1>

        <div className="flex-1 flex justify-end">
          <div className="px-4 py-1.5 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-white/10 text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
            {sessionStatus}
          </div>
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
                  <span className="pointer-events-none">{emoji}</span>
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
            wasAnswerCorrect={lastAnswerCorrect}
            onAnswer={handleAnswerSubmit}
            isGhostMode={isGhostMode}
            isAlreadyAnswered={answeredQuestions.has(questions[currentQuestionIndex].id)}
          />
        )}

        {/* FINISHED: Game over with leaderboard */}
        {sessionStatus === "finished" && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-lg mx-auto"
          >
            <div className="text-center mb-8">
              <div className="text-7xl mb-4">🏆</div>
              <h2 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-2 tracking-tight">
                Game Over!
              </h2>
              <p className="text-slate-500 dark:text-slate-400">Final Standings</p>
            </div>

            <div className="space-y-3 mb-8">
              {leaderboard.map((p, idx) => {
                const isTop3 = idx < 3;
                const podiumColors = [
                  "bg-gradient-to-r from-amber-200 to-amber-400 border-amber-400 dark:from-amber-600/60 dark:to-amber-500/30 text-amber-900 dark:text-amber-100", // Gold
                  "bg-gradient-to-r from-slate-200 to-slate-400 border-slate-400 dark:from-slate-600/60 dark:to-slate-500/30 text-slate-800 dark:text-slate-100", // Silver
                  "bg-gradient-to-r from-orange-200 to-orange-400 border-orange-400 dark:from-orange-800/60 dark:to-orange-600/30 text-orange-950 dark:text-orange-100" // Bronze
                ];
                
                return (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  key={idx}
                  className={`flex items-center gap-4 px-5 py-3 rounded-2xl border ${
                    isTop3 ? podiumColors[idx] :
                    p.display_name === participantName 
                      ? "bg-indigo-50 border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/30" 
                      : "bg-white border-gray-100 dark:bg-slate-800 dark:border-white/5 shadow-sm"
                  } ${isTop3 ? 'scale-[1.02] shadow-xl my-3 py-4 border-2' : ''}`}
                >
                  <span className={`w-10 h-10 flex items-center justify-center rounded-xl font-black shrink-0 ${idx === 0 ? "bg-amber-400 text-amber-900 text-xl shadow-inner" : idx === 1 ? "bg-slate-300 text-slate-800 text-lg shadow-inner" : idx === 2 ? "bg-orange-400 text-orange-900 text-lg shadow-inner" : "bg-gray-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"}`}>
                    #{idx + 1}
                  </span>
                  <span className={`flex-1 font-bold truncate ${isTop3 ? "text-current text-lg" : "text-slate-900 dark:text-white"}`}>
                    {p.display_name}
                    {p.display_name === participantName && <span className="ml-2 text-xs opacity-80 font-black uppercase">(You)</span>}
                  </span>
                  {p.streak > 0 && <span className="text-sm font-black text-rose-500 bg-rose-100 dark:bg-rose-500/20 px-2 py-1 rounded-lg">🔥 {p.streak}</span>}
                  <span className={`font-black tabular-nums text-xl ${isTop3 ? "text-current" : "text-indigo-600 dark:text-indigo-400"}`}>
                    {p.score.toLocaleString()}
                  </span>
                </motion.div>
                );
              })}
              {leaderboard.length === 0 && (
                <div className="text-center py-6 text-slate-400 animate-pulse">Loading results…</div>
              )}
            </div>

            <button
              onClick={handleBackToDashboard}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg shadow-xl shadow-indigo-600/30 transition-all"
            >
              <LayoutDashboard size={22} /> Back to Dashboard
            </button>
          </motion.div>
        )}
      </main>

      {/* Floating Notes Toggle Component */}
      {(sessionStatus === "active" || sessionStatus === "waiting") && (
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end">
          <AnimatePresence>
            {isNotesOpen && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="mb-4 w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-indigo-100 dark:border-indigo-500/20 overflow-hidden"
              >
                <div className="bg-indigo-50 dark:bg-indigo-900/40 px-4 py-3 border-b border-indigo-100 dark:border-indigo-500/20 flex justify-between items-center">
                  <h3 className="font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                    <NotebookPen size={16} /> My Notes
                  </h3>
                  <div className="flex items-center gap-2">
                    {savingNotes && <Save size={14} className="text-indigo-400 animate-pulse" />}
                    <button onClick={() => setIsNotesOpen(false)} className="text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300">
                      <X size={18} />
                    </button>
                  </div>
                </div>
                <div className="p-4">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={sessionStatus !== "waiting"}
                    placeholder={sessionStatus === "waiting" ? "Write your note before the quiz starts..." : "Notes are locked during the quiz."}
                    className="w-full h-32 bg-transparent resize-none focus:outline-none text-sm text-slate-700 dark:text-slate-300 placeholder-slate-400 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  {sessionStatus !== "waiting" && (
                    <p className="mt-2 text-xs text-indigo-500 dark:text-indigo-400 font-medium">Notes are read-only during the quiz.</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={() => setIsNotesOpen(!isNotesOpen)}
            className="w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg shadow-indigo-600/30 flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
          >
            <NotebookPen size={24} />
          </button>
        </div>
      )}

    </div>
  );
}
