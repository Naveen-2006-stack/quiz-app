"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useLiveSession } from "@/hooks/useLiveSession";
import { useGameStore } from "@/store/useGameStore";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Play, Copy, Check, ArrowLeft, CheckSquare, LayoutDashboard, ShieldAlert, XCircle, Trash2, Eye, EyeOff } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
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
  violations: number;
}

interface ViolationEntry {
  id: string | number;         // DB UUID or Date.now() for live events
  participant_id: string;
  violation_type: string;
  created_at: string;
  source: "live" | "db";       // track origin for deduplication display
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
  const configuredBaseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  const runtimeOrigin = typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : "";
  const isConfiguredLocalhost = /localhost|127\.0\.0\.1/i.test(configuredBaseUrl);
  const baseUrl = configuredBaseUrl && !isConfiguredLocalhost
    ? configuredBaseUrl
    : (runtimeOrigin || "http://localhost:3000");

  const [sessionInfo, setSessionInfo] = useState<LiveSession | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [startingGame, setStartingGame] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [advancingQuestion, setAdvancingQuestion] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);

  // Answer Visibility Control
  const [isAnswersHidden, setIsAnswersHidden] = useState(true);

  // Live violation feed — accumulates real-time broadcast events so rapid
  // consecutive violations are never dropped (functional update pattern)
  const [liveViolations, setLiveViolations] = useState<ViolationEntry[]>([]);

  // Violations Monitoring Modal
  const [selectedViolationsParticipant, setSelectedViolationsParticipant] = useState<{ id: string, name: string } | null>(null);
  const [violationsHistory, setViolationsHistory] = useState<ViolationEntry[]>([]);
  const [loadingViolations, setLoadingViolations] = useState(false);
  const [violationLogsByParticipant, setViolationLogsByParticipant] = useState<Record<string, ViolationEntry[]>>({});

  // Live submission counter state
  const [submissionCount, setSubmissionCount] = useState(0);

  // Custom Modal States
  const [confirmKickParticipant, setConfirmKickParticipant] = useState<{ id: string, name: string } | null>(null);
  const [confirmTerminate, setConfirmTerminate] = useState(false);

  const controlChannelRef = useRef<any>(null);
  const latestSessionStatusRef = useRef<string>("waiting");
  const hasAutoCompletedRef = useRef(false);
  const inactivityViolationRef = useRef<Record<string, number>>({});
  const hasAutoRedirectedToReportRef = useRef(false);

  // Zustand game store
  const participantsMap = useGameStore((s) => s.participants);
  const sessionStatus = useGameStore((s) => s.sessionStatus);
  const currentQuestionIndex = useGameStore((s) => s.currentQuestionIndex);
  const setParticipants = useGameStore((s) => s.setParticipants);
  const setSessionStatus = useGameStore((s) => s.setSessionStatus);
  const setCurrentQuestionIndex = useGameStore((s) => s.setCurrentQuestionIndex);
  const incrementCheatFlag = useGameStore((s) => s.incrementCheatFlag);
  const removeParticipant = useGameStore((s) => s.removeParticipant);

  useLiveSession(sessionId, "teacher");

  const touchSessionActivity = async () => {
    if (!sessionId) return;
    await supabase
      .from("live_sessions")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", sessionId)
      .in("status", ["waiting", "active"]);
  };

  useEffect(() => {
    latestSessionStatusRef.current = sessionStatus;
  }, [sessionStatus]);

  useEffect(() => {
    if (!sessionId) return;

    const completeSessionIfOpen = () => {
      if (hasAutoCompletedRef.current) return;
      const status = latestSessionStatusRef.current;
      if (status !== "active" && status !== "waiting") return;

      hasAutoCompletedRef.current = true;
      void supabase
        .from("live_sessions")
        .update({ status: "finished", finished_at: new Date().toISOString() })
        .eq("id", sessionId)
        .in("status", ["active", "waiting"]);
    };

    const onBeforeUnload = () => {
      completeSessionIfOpen();
    };

    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      completeSessionIfOpen();
    };
  }, [sessionId]);

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
      // Listen on the dedicated anticheat channel (matches student's broadcast channel)
      .channel(`anticheat-room:${sessionId}`)
      .on("broadcast", { event: "anti_cheat_violation" }, (payload: any) => {
        const studentId = payload?.payload?.studentId as string | undefined;
        const studentName = payload?.payload?.studentName as string | undefined;
        const structured = payload?.payload?.violation as { type?: string; timestamp?: string } | undefined;
        const violationType = structured?.type || (payload?.payload?.violationType as string | undefined);
        const violationTimestamp = structured?.timestamp || new Date().toISOString();
        if (!studentId || !violationType) return;

        // 1. Increment cheat badge in Zustand (for the leaderboard counter)
        incrementCheatFlag(studentId);

        // 2. Append to local live violations feed using functional update
        //    so rapid back-to-back events NEVER overwrite each other.
        setLiveViolations(prev => [
          {
            id: Date.now() + Math.random(),   // unique key for React
            participant_id: studentId,
            violation_type: violationType,
            created_at: violationTimestamp,
            source: "live" as const,
          },
          ...prev,
        ]);

        setViolationLogsByParticipant((prev) => {
          const next: ViolationEntry = {
            id: Date.now() + Math.random(),
            participant_id: studentId,
            violation_type: violationType,
            created_at: violationTimestamp,
            source: "live",
          };
          return {
            ...prev,
            [studentId]: [next, ...(prev[studentId] || [])],
          };
        });
      })
      .subscribe();
    return () => { void supabase.removeChannel(gameRoomChannel); };
  }, [sessionId]);

  // Emoji reaction listener (matches student broadcast channel)
  useEffect(() => {
    if (!sessionId) return;

    const emojiChannel = supabase
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
      .subscribe();

    return () => { void supabase.removeChannel(emojiChannel); };
  }, [sessionId]);

  // ── Feature 3: Live Submission Counter ──
  // Listen to INSERT events on student_responses for the current question.
  // Reset counter when question index changes.
  useEffect(() => {
    setSubmissionCount(0); // reset on every question change
    setIsAnswersHidden(true); // Always hide answers when starting a new question
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
        (payload: any) => {
          // Only count responses for the current question
          if ((payload.new as any).question_id === qId) {
            setSubmissionCount((c) => c + 1);
          }
        }
      )
      .subscribe();

    return () => { void supabase.removeChannel(subChannel); };
  }, [sessionId, questions, currentQuestionIndex]);

  // Fallback submitted-counter sync: if realtime INSERT events are missed,
  // periodically recompute count from DB so host UI stays accurate.
  useEffect(() => {
    if (!sessionId || sessionStatus !== "active" || !questions[currentQuestionIndex]) return;
    const qId = questions[currentQuestionIndex]?.id;
    if (!qId) return;

    const refreshSubmissionCount = async () => {
      const { count, error } = await supabase
        .from("student_responses")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId)
        .eq("question_id", qId);

      if (error) return;
      setSubmissionCount(count ?? 0);
    };

    void refreshSubmissionCount();
    const interval = setInterval(() => {
      void refreshSubmissionCount();
    }, 2000);

    return () => clearInterval(interval);
  }, [sessionId, sessionStatus, questions, currentQuestionIndex]);

  // Keep session alive while host tab is open in waiting/active states.
  useEffect(() => {
    if (!sessionId || (sessionStatus !== "waiting" && sessionStatus !== "active")) return;

    void touchSessionActivity();
    const heartbeat = setInterval(() => {
      void touchSessionActivity();
    }, 5 * 60 * 1000);

    return () => clearInterval(heartbeat);
  }, [sessionId, sessionStatus]);

  // Fallback participant sync: keeps host roster accurate even if realtime
  // postgres change events are delayed/missed in production.
  useEffect(() => {
    if (!sessionId || (sessionStatus !== "waiting" && sessionStatus !== "active")) return;

    const refreshParticipants = async () => {
      const { data, error } = await supabase
        .from("participants")
        .select("id, session_id, device_uuid, display_name, score, streak, cheat_flags, last_active, joined_at, is_banned")
        .eq("session_id", sessionId);

      if (error || !data) return;
      setParticipants(data.filter((p: any) => !p.is_banned));
    };

    void refreshParticipants();
    const interval = setInterval(() => {
      void refreshParticipants();
    }, 2500);

    return () => clearInterval(interval);
  }, [sessionId, sessionStatus, setParticipants]);

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

    // SECURITY: explicit column list ─ ghost_mode is NEVER included here
    const { data: pData } = await supabase
      .from("participants")
      .select("id, session_id, device_uuid, display_name, score, streak, cheat_flags, last_active, joined_at, is_banned")
      .eq("session_id", sessionId);
    if (pData) {
      const activeParticipants = pData.filter(p => !p.is_banned);
      setParticipants(activeParticipants);
    }

    const { data: vData } = await supabase
      .from("participant_violations")
      .select("id, participant_id, violation_type, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false });

    if (vData) {
      const map: Record<string, ViolationEntry[]> = {};
      (vData as any[]).forEach((row) => {
        const pid = row.participant_id as string | undefined;
        if (!pid) return;
        if (!map[pid]) map[pid] = [];
        map[pid].push({
          id: row.id,
          participant_id: pid,
          violation_type: row.violation_type,
          created_at: row.created_at,
          source: "db",
        });
      });
      setViolationLogsByParticipant(map);
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
      const { data: ok, error } = await supabase.rpc("start_live_session", { session_uuid: sessionId });
      if (error || ok !== true) {
        // Fallback direct update
        const { data: { session } } = await supabase.auth.getSession();
        const { error: updateError } = await supabase
          .from("live_sessions")
          .update({ status: "active", started_at: new Date().toISOString(), last_activity_at: new Date().toISOString() })
          .eq("id", sessionId)
          .eq("teacher_id", session?.user?.id);
        if (updateError) throw new Error("Could not start game. Check your permissions.");
      }
      await touchSessionActivity();
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
    const nextQuestionIndex = currentQuestionIndex + 1;

    // Broadcast reveal-answer event to all students
    await controlChannelRef.current?.send({
      type: "broadcast",
      event: "reveal_answer",
      payload: { sessionId, questionIndex: currentQuestionIndex },
    });

    await new Promise((r) => setTimeout(r, 1400));

    const isLast = currentQuestionIndex >= questions.length - 1;
    try {
      const { error: advanceError } = await supabase.rpc("advance_live_session_question", {
        p_session_id: sessionId,
        p_next_question_index: nextQuestionIndex,
        p_finish: isLast,
      });

      if (advanceError) {
        const missingRpc = /Could not find the function|function .* does not exist/i.test(advanceError.message || "");

        if (!missingRpc) {
          throw advanceError;
        }

        const { data: { session } } = await supabase.auth.getSession();
        const fallbackUpdate = isLast
          ? {
              status: "finished" as const,
              finished_at: new Date().toISOString(),
              last_activity_at: new Date().toISOString(),
            }
          : {
              current_question_index: nextQuestionIndex,
              last_activity_at: new Date().toISOString(),
            };

        const { error: updateError } = await supabase
          .from("live_sessions")
          .update(fallbackUpdate)
          .eq("id", sessionId)
          .eq("teacher_id", session?.user?.id);

        if (updateError) {
          throw updateError;
        }
      }

      setCurrentQuestionIndex(nextQuestionIndex);
      await touchSessionActivity();

      if (isLast) {
        setSessionStatus("finished");
        router.replace(`/teacher-dashboard/reports`);
        return;
      }

      setSessionStatus("active");
    } catch (err) {
      console.error("Failed to advance question:", err);
    } finally {
      setAdvancingQuestion(false);
    }
  };

  const terminateQuiz = async () => {
    if (!sessionId || !controlChannelRef.current) return;
    try {
      await supabase
        .from("live_sessions")
        .update({ status: "finished", finished_at: new Date().toISOString() })
        .eq("id", sessionId);

      await controlChannelRef.current.send({
        type: "broadcast",
        event: "terminate_session",
      });

      setSessionStatus("finished");
      setConfirmTerminate(false);
      router.replace(`/teacher-dashboard/reports`);
    } catch (err: any) {
      console.error("Failed to terminate quiz:", err.message);
    }
  };

  const kickParticipant = async (pId: string, pName: string) => {
    if (!sessionId || !controlChannelRef.current) return;

    try {
      // 1. Secure Ban in Database
      const { error } = await supabase.rpc("ban_participant", {
        p_session_id: sessionId,
        p_participant_id: pId
      });
      
      if (error) throw error;

      // 2. Broadcast kick event
      await controlChannelRef.current.send({
        type: "broadcast",
        event: "kick_player",
        payload: { targetId: pId },
      });

      // 3. Local state update — remove from store immediately using the targeted action
      // (useLiveSession will also handle the DB UPDATE event, but this is instant)
      removeParticipant(pId);

      // 4. Close modals if open
      setSelectedViolationsParticipant(null);
      setConfirmKickParticipant(null);
    } catch (err: any) {
      console.error("Failed to kick participant:", err.message);
    }
  };

  // ── Feature 4: Back to Dashboard (clears game state) ──
  const handleBackToDashboard = () => {
    // Clear any game-local state; Zustand resets on next mount
    router.push("/dashboard");
  };

  const handleViewReport = () => {
    router.push(`/dashboard/reports/${sessionId}`);
  };

  const handleOpenViolations = async (pId: string, pName: string) => {
    setSelectedViolationsParticipant({ id: pId, name: pName });
    setLoadingViolations(true);
    setViolationsHistory([]);
    try {
      // 1. Load persisted violations from DB using the secure RPC to bypass RLS selection issues
      const { data: dbData } = await supabase.rpc("fetch_violations_for_host", {
        p_session_id: sessionId,
        p_participant_id: pId
      });

      // 2. Pull live events for this specific student from in-memory feed
      const liveForStudent = liveViolations
        .filter((v: any) => v.participant_id === pId)
        .map((v) => ({ ...v, source: "live" as const }));

      // 3. Merge: live events on top, DB records below.
      //    De-duplicate: if a live event already appears in DB (within 5s window),
      //    prefer the DB record (has a real UUID) and drop the live duplicate.
      const dbIds = new Set((dbData || []).map((d: any) => {
        const t = new Date(d.created_at).getTime();
        return `${d.violation_type}:${Math.floor(t / 5000)}`; // 5s bucket
      }));
      const uniqueLive = liveForStudent.filter((v) => {
        const t = new Date(v.created_at).getTime();
        return !dbIds.has(`${v.violation_type}:${Math.floor(t / 5000)}`);
      });

      const merged: ViolationEntry[] = [
        ...uniqueLive,
        ...(dbData || []).map((d: any) => ({ ...d, source: "db" as const })),
      ];
      setViolationsHistory(merged);
      setViolationLogsByParticipant((prev) => ({ ...prev, [pId]: merged }));
    } catch (err) {
      console.error("Failed to load violations:", err);
    } finally {
      setLoadingViolations(false);
    }
  };

  const participantsList = Object.values(participantsMap);
  const totalPlayers = participantsList.length;
  const joinCode = sessionInfo?.join_code || "------";
  const joinUrl = `${baseUrl}/join?code=${encodeURIComponent(sessionInfo?.join_code || "")}`;
  const isJoinUrlLocalOnly = /localhost|127\.0\.0\.1/i.test(joinUrl);

  // Auto-redirect host once the session is finished (last question or End Game).
  useEffect(() => {
    if (sessionStatus !== "finished" || !sessionId) {
      hasAutoRedirectedToReportRef.current = false;
      return;
    }

    if (hasAutoRedirectedToReportRef.current) return;
    hasAutoRedirectedToReportRef.current = true;

    const timer = setTimeout(() => {
      router.replace(`/teacher-dashboard/reports`);
    }, 700);

    return () => clearTimeout(timer);
  }, [sessionStatus, sessionId, router]);

  // Anti-cheat fallback: detect background/disconnected students from stale heartbeat.
  useEffect(() => {
    if (sessionStatus !== "active" || !sessionId) return;

    const now = Date.now();
    const staleThresholdMs = 15000;
    const duplicateCooldownMs = 30000;

    participantsList.forEach((p: any) => {
      if (!p?.id || !p?.last_active) return;
      const lastActiveMs = new Date(p.last_active).getTime();
      if (!Number.isFinite(lastActiveMs)) return;

      const isStale = now - lastActiveMs > staleThresholdMs;
      if (!isStale) return;

      const lastFlaggedAt = inactivityViolationRef.current[p.id] ?? 0;
      if (now - lastFlaggedAt < duplicateCooldownMs) return;

      inactivityViolationRef.current[p.id] = now;

      const violationType = "App Backgrounded / Inactive";
      incrementCheatFlag(p.id);
      setLiveViolations((prev: any) => [
        {
          id: Date.now() + Math.random(),
          participant_id: p.id,
          violation_type: violationType,
          created_at: new Date().toISOString(),
          source: "live" as const,
        },
        ...prev,
      ]);

      setViolationLogsByParticipant((prev) => ({
        ...prev,
        [p.id]: [
          {
            id: Date.now() + Math.random(),
            participant_id: p.id,
            violation_type: violationType,
            created_at: new Date().toISOString(),
            source: "live",
          },
          ...(prev[p.id] || []),
        ],
      }));

      void supabase.rpc("log_violation", {
        p_session_id: sessionId,
        p_participant_id: p.id,
        p_violation_type: violationType,
      });
    });
  }, [participantsList, sessionStatus, sessionId, incrementCheatFlag]);

  // ───────── ACTIVE / FINISHED screen ─────────
  if (sessionStatus === "active" || sessionStatus === "finished") {
    const sortedParticipants = [...participantsList].sort((a, b) => b.score - a.score);
    const activeQ = questions[currentQuestionIndex];
    const activeQuestionType = (activeQ?.question_type || "mcq") as "mcq" | "true_false" | "multi_select";
    const typeMeta =
      activeQuestionType === "true_false"
        ? {
            label: "True / False",
            className: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30",
            hint: "Single-answer question",
          }
        : activeQuestionType === "multi_select"
          ? {
              label: "Multiple Choice",
              className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30",
              hint: "Participants must choose all correct answers",
            }
          : {
              label: "Normal",
              className: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/30",
              hint: "Single-answer question",
            };

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

        {/* Active Question Panel */}
        {sessionStatus === "active" && activeQ && (
          <div className="mb-10 bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] shadow-xl border border-indigo-50 dark:border-white/5">
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
              <span className="px-4 py-2 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 font-bold rounded-xl text-sm tracking-widest uppercase">
                Question {currentQuestionIndex + 1} of {questions.length}
              </span>

              <span
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-bold border",
                  typeMeta.className
                )}
              >
                {typeMeta.label}
              </span>

              {/* Game PIN Display */}
              <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 font-bold rounded-xl text-sm border border-indigo-200 dark:border-indigo-500/30">
                <span className="text-indigo-500/70 dark:text-indigo-500/50">PIN:</span>
                <span className="tracking-[0.1em]">{sessionInfo?.join_code}</span>
              </div>

              <div className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30">
                <CheckSquare size={18} className="text-emerald-600 dark:text-emerald-400" />
                <span className="font-black text-emerald-700 dark:text-emerald-400 text-lg tabular-nums">
                  {submissionCount}
                  <span className="font-semibold text-emerald-500 dark:text-emerald-500/80"> / {totalPlayers}</span>
                </span>
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-500">submitted</span>
              </div>

              {sessionStatus === "active" && (
                <button
                  onClick={() => setConfirmTerminate(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30 transition-colors font-bold text-sm"
                >
                  <Trash2 size={16} /> Terminate Quiz
                </button>
              )}

              <span className="text-slate-500 font-medium font-mono">{activeQ.time_limit}s</span>
            </div>

            <div className="flex justify-between items-start gap-4 mb-8">
              <div className="flex-1">
                <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white leading-tight">
                  {activeQ.question_text}
                </h2>
                <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                  {typeMeta.hint}
                </p>
              </div>
              <button 
                onClick={() => setIsAnswersHidden(!isAnswersHidden)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all whitespace-nowrap",
                  isAnswersHidden 
                    ? "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600" 
                    : "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30"
                )}
                title={isAnswersHidden ? "Show correct answers on screen" : "Hide answers from screen"}
              >
                {isAnswersHidden ? <EyeOff size={18} /> : <Eye size={18} />}
                {isAnswersHidden ? "Answers Hidden" : "Answers Visible"}
              </button>
            </div>

            {activeQ.image_url && (
              <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                <img
                  src={activeQ.image_url}
                  alt="Question visual"
                  className="w-full max-h-96 object-contain"
                  loading="lazy"
                />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeQ.options.map((opt: any, idx: number) => (
                <div
                  key={idx}
                  className={cn(
                    "p-5 text-lg font-semibold rounded-2xl border-2 transition-all",
                    !isAnswersHidden && opt.is_correct
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
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={handleViewReport}
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-lg shadow-emerald-600/20 transition-all"
              >
                View Full Report
              </button>
              <button
                onClick={handleBackToDashboard}
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-600/20 transition-all"
              >
                <LayoutDashboard size={20} /> Back to Dashboard
              </button>
            </div>
          </div>
        )}

        {/* Leaderboard */}
        <div className="grid grid-cols-1 gap-3 max-w-4xl mx-auto">
          <AnimatePresence>
            {sortedParticipants.map((p, idx) => (
              (() => {
                const violationCount = Math.max(violationLogsByParticipant[p.id]?.length || 0, p.cheat_flags || 0);
                return (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", delay: idx * 0.04 }}
                className="group flex items-center gap-6 bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5"
              >
                <div className={cn(
                  "w-10 h-10 flex items-center justify-center rounded-xl text-lg font-black",
                  idx === 0 ? "bg-amber-400 text-white" : idx === 1 ? "bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-white" : idx === 2 ? "bg-orange-400 text-white" : "bg-gray-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                )}>#{idx + 1}</div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white truncate">{p.display_name}</h3>
                  {p.streak > 0 && <div className="text-xs font-semibold text-amber-500 mt-0.5">🔥 {p.streak} streak</div>}
                </div>
                {/* Violations column — always visible, clickable if any exist */}
                <div className="flex flex-col items-center gap-0.5 min-w-[64px]">
                  <button
                    onClick={() => handleOpenViolations(p.id, p.display_name || "Unknown")}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black transition-colors",
                      violationCount > 0
                        ? (violationCount >= 3 ? "bg-rose-600 text-white hover:bg-rose-700" : violationCount >= 2 ? "bg-orange-500 text-white hover:bg-orange-600" : "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-400")
                        : "bg-slate-100 text-slate-400 dark:bg-slate-700/50 cursor-default"
                    )}
                    title={violationCount > 0 ? "Click to view violation history" : "No violations"}
                    disabled={violationCount === 0}
                  >
                    <ShieldAlert size={12} />
                    {violationCount}
                  </button>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">violations</span>
                </div>
                <div className="text-3xl font-black tabular-nums text-indigo-600 dark:text-indigo-400 min-w-[80px] text-right">
                  {p.score.toLocaleString()}
                </div>
                {sessionStatus === "active" && (
                  <button
                    onClick={() => setConfirmKickParticipant({ id: p.id, name: p.display_name })}
                    className="ml-2 p-2.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                    title="Ban Student"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
              </motion.div>
                );
              })()
            ))}
          </AnimatePresence>
        </div>

        {/* Violations History Modal */}
        <AnimatePresence>
          {selectedViolationsParticipant && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            >
              <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-rose-100 dark:border-rose-500/20 overflow-hidden"
              >
                <div className="bg-rose-50 dark:bg-rose-500/10 px-6 py-4 border-b border-rose-100 dark:border-rose-500/20 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <ShieldAlert className="text-rose-600 dark:text-rose-400" size={24} />
                    <h3 className="font-extrabold text-xl text-rose-900 dark:text-rose-300">
                      Violations History
                    </h3>
                  </div>
                  <button 
                    onClick={() => setSelectedViolationsParticipant(null)} 
                    className="p-2 text-rose-400 hover:text-rose-600 bg-rose-100/50 hover:bg-rose-200/50 dark:bg-rose-500/20 rounded-full transition-colors"
                  >
                    <XCircle size={20} />
                  </button>
                </div>
                
                <div className="p-6">
                  <p className="font-medium text-slate-700 dark:text-slate-300 mb-6">
                    Showing recorded strikes for <strong className="text-slate-900 dark:text-white">{selectedViolationsParticipant.name}</strong>
                  </p>

                  <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                    {loadingViolations ? (
                      <div className="flex justify-center p-8">
                        <div className="w-8 h-8 rounded-full border-4 border-dashed border-rose-300 animate-spin" />
                      </div>
                    ) : violationsHistory.length === 0 ? (
                      <div className="text-center p-8 text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                        No violation records found for this student.
                      </div>
                    ) : (
                      violationsHistory.map((v, i) => (
                        <div key={`${v.id}-${i}`} className="flex items-start gap-4 p-4 rounded-xl border border-rose-100 dark:border-rose-500/20 bg-white dark:bg-slate-800 shadow-sm relative overflow-hidden">
                          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-rose-500" />
                          {v.source === "live" && (
                            <div className="absolute top-2 right-2 px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 uppercase tracking-wider">Live</div>
                          )}
                          <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400 font-black shrink-0">
                            {violationsHistory.length - i}
                          </div>
                          <div className="flex-1">
                            <h4 className="font-bold text-slate-800 dark:text-slate-200">{v.violation_type}</h4>
                            <p className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wider">
                              {new Date(v.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="mt-8 flex justify-end">
                    <button
                      onClick={() => kickParticipant(selectedViolationsParticipant.id, selectedViolationsParticipant.name)}
                      className="flex items-center gap-2 px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-lg shadow-rose-600/30 transition-all"
                    >
                      <Trash2 size={18} /> Ban Player Now
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Confirm Kick Modal */}
        <AnimatePresence>
          {confirmKickParticipant && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden p-6 text-center"
              >
                <div className="mx-auto w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4">
                  <XCircle size={32} />
                </div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Ban Student?</h3>
                <p className="text-slate-500 dark:text-slate-400 mb-6 font-medium">
                  Are you sure you want to ban <strong className="text-slate-800 dark:text-slate-200">{confirmKickParticipant.name}</strong>? They will not be able to rejoin.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setConfirmKickParticipant(null)}
                    className="flex-1 px-4 py-3 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => kickParticipant(confirmKickParticipant.id, confirmKickParticipant.name)}
                    className="flex-1 px-4 py-3 rounded-xl bg-rose-500 text-white font-bold hover:bg-rose-600 transition-colors shadow-lg shadow-rose-500/30"
                  >
                    Yes, Ban
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Confirm Terminate Modal */}
        <AnimatePresence>
          {confirmTerminate && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden p-6 text-center"
              >
                <div className="mx-auto w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4">
                  <Trash2 size={32} />
                </div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Terminate Quiz?</h3>
                <p className="text-slate-500 dark:text-slate-400 mb-6 font-medium">
                  This will instantly end the session for all participants and redirect them to the dashboard.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setConfirmTerminate(false)}
                    className="flex-1 px-4 py-3 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={terminateQuiz}
                    className="flex-1 px-4 py-3 rounded-xl bg-rose-500 text-white font-bold hover:bg-rose-600 transition-colors shadow-lg shadow-rose-500/30"
                  >
                    Terminate
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ───────── WAITING LOBBY screen ─────────
  return (
    <div className="min-h-screen bg-slate-50">
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
      <button onClick={() => router.push("/dashboard")} className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors mb-8 group">
        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" /> Back to Dashboard
      </button>

      {/* Join code display */}
      <div className="mb-12 rounded-3xl bg-white border border-slate-200/80 shadow-sm p-6 md:p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500 mb-3">Game PIN</p>
            <div className="flex items-center gap-4">
              <span className="text-5xl md:text-6xl font-mono tracking-[0.18em] font-extrabold text-indigo-600">
                {joinCode}
              </span>
              <button
                onClick={copyPin}
                className="w-14 h-14 flex items-center justify-center rounded-2xl bg-slate-100 hover:bg-slate-200 text-indigo-600 transition-colors border border-slate-200"
                aria-label="Copy game PIN"
              >
                {copied ? <Check size={24} /> : <Copy size={24} />}
              </button>
            </div>
            <p className="mt-4 text-sm text-slate-500">Students can join instantly by scanning the QR code.</p>
            <p className="mt-2 text-xs text-slate-400 break-all">{joinUrl}</p>
            {isJoinUrlLocalOnly && (
              <p className="mt-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                This QR uses localhost and will not open on phones. Set NEXT_PUBLIC_APP_URL to your LAN IP or deployed URL.
              </p>
            )}
          </div>

          <div className="justify-self-center md:justify-self-end">
            <motion.div
              initial={{ scale: 0.98, opacity: 0.95 }}
              animate={{ scale: [1, 1.02, 1], opacity: [0.95, 1, 0.95] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-inner"
            >
              <QRCodeSVG
                value={joinUrl}
                size={180}
                fgColor="#0f172a"
                bgColor="#ffffff"
                level="H"
                includeMargin
              />
            </motion.div>
            <p className="mt-3 text-center text-xs font-medium text-slate-500">Scan to join</p>
          </div>
        </div>
      </div>

      {/* Player count + Start button */}
      <div className="flex justify-between items-end mb-6">
        <div className="flex items-center gap-3 bg-white px-6 py-3 rounded-2xl shadow-sm border border-slate-200/60">
          <Users className="text-indigo-500" size={24} />
          <span className="text-2xl font-bold text-slate-900">{participantsList.length}</span>
          <span className="text-slate-500 font-medium">Players Connected</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setConfirmTerminate(true)}
            className="flex items-center gap-2 px-6 py-4 rounded-2xl bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors font-bold text-lg border border-rose-200"
          >
            <Trash2 size={24} /> End Game
          </button>
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
      </div>

      {startError && (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {startError}
        </div>
      )}

      {/* Player grid */}
      <div className="bg-white rounded-3xl p-8 min-h-[380px] border border-slate-200/60 shadow-sm">
        <AnimatePresence>
          {participantsList.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full pt-16 text-slate-400"
            >
              <div className="w-16 h-16 rounded-full border-4 border-dashed border-slate-300 animate-[spin_3s_linear_infinite] mb-6" />
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
                  className="group relative"
                >
                  <div className="bg-white px-5 py-2.5 rounded-xl shadow-md border border-gray-100 font-bold text-lg text-slate-800">
                    {p.display_name}
                  </div>
                  <button
                    onClick={() => kickParticipant(p.id, p.display_name)}
                    className="absolute -top-2 -right-2 p-1 bg-rose-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity transform hover:scale-110 shadow-lg"
                    title="Remove Player"
                  >
                    <XCircle size={16} />
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
    </div>
  );
}
