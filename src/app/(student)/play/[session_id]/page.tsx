"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
  clearPersistedLiveQuizSession,
  getPersistedLiveQuizSession,
  setPersistedLiveQuizSession,
} from "@/lib/liveQuizSession";
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
  // Cached auth token for reliable page-close logging (keepalive fetch needs auth headers)
  const authTokenRef = useRef<string>("");
  // Ghost Mode: fetched from the user's OWN profile — never exposed to host or peers
  const [isGhostMode, setIsGhostMode] = useState(false);
  // Test Mode: when true, marks and leaderboard are hidden from students
  const [isTestMode, setIsTestMode] = useState(false);
  // Notes & Multi-submission
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set());
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [notes, setNotes] = useState("");
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const debouncedNotes = useDebounce(notes, 1000);
  // Guard: prevent auto-save from overwriting DB notes before they've been loaded
  const notesInitializedRef = useRef(false);

  // Universal emoji floats — same logic as Host screen
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const hasMarkedLeftRef = useRef(false);

  // Restore critical in-memory participant state after refresh so quiz flow survives reloads.
  useEffect(() => {
    if (!sessionId || participantId) return;

    const persisted = getPersistedLiveQuizSession(sessionId);
    if (!persisted?.participantId) return;

    setParticipantId(persisted.participantId);
    if (persisted.nickname?.trim()) {
      setParticipantName(persisted.nickname.trim());
    }
  }, [participantId, sessionId]);

  // Student realtime sync: follow host-driven session updates from live_sessions.
  useEffect(() => {
    if (!sessionId) return;

    const sessionChannel = supabase
      .channel(`student-session:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "live_sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const next = payload.new as {
            current_question_index?: number | null;
            status?: string | null;
            [key: string]: any;
          };

          // Keep local session payload in sync with the source of truth.
          setSessionInfo((prev: any) => (prev ? { ...prev, ...next } : prev));

          if (typeof next.status === "string") {
            setSessionStatus(next.status as any);
          }

          if (typeof next.current_question_index === "number") {
            const nextIndex = next.current_question_index;
            setCurrentQuestionIndex(nextIndex);

            // Reset per-question student UI state when host advances question.
            setRevealedQuestionIndex(null);
            setLastAnswerCorrect(null);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(sessionChannel);
    };
  }, [sessionId, setCurrentQuestionIndex, setSessionStatus]);

  // Fallback sync for session status/index in case realtime events are missed.
  // This keeps student screens in lockstep with host actions without manual refresh.
  useEffect(() => {
    if (!sessionId || loading) return;

    const refreshSessionState = async () => {
      const { data, error } = await supabase
        .from("live_sessions")
        .select("status, current_question_index")
        .eq("id", sessionId)
        .single();

      if (error || !data) return;

      setSessionInfo((prev: any) => (prev ? { ...prev, ...data } : prev));

      if (data.status) {
        setSessionStatus(data.status as any);
      }

      if (typeof data.current_question_index === "number") {
        setCurrentQuestionIndex(data.current_question_index);
      }
    };

    void refreshSessionState();
    const interval = setInterval(() => {
      void refreshSessionState();
    }, 2000);

    return () => clearInterval(interval);
  }, [sessionId, loading, setCurrentQuestionIndex, setSessionStatus]);

  // Auto-save notes (only after initial notes have been loaded from DB to avoid overwriting)
  useEffect(() => {
    if (!participantId || !sessionId || !notesInitializedRef.current) return;
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
  }, [sessionId]);  // Anti-cheat: hardened detection — tab switch, window blur, mouse leave, context menu, key shortcuts
  useEffect(() => {
    if (!sessionId || !participantId || sessionStatus !== "active") return;

    // Global multi-event cooldown: prevents a single physical action that fires
    // multiple events (e.g. app switch triggers blur + visibilitychange) from
    // generating duplicate violations.
    let strikeCooldown = false;
    let blurDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    let mouseLeaveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastKeepaliveStrikeAt = 0;

    // Create the anti-cheat broadcast channel once for this effect's lifecycle.
    // We use a distinct channel reference here (not reactionChannelRef) so that
    // cleanup of this effect doesn't destroy the emoji channel and vice-versa.
    const gameRoomChannel = supabase.channel(`anticheat-room:${sessionId}`).subscribe();

    const markParticipantLeft = async (reason: string, useKeepalive = false) => {
      if (!participantId || hasMarkedLeftRef.current) return;
      hasMarkedLeftRef.current = true;

      if (useKeepalive) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (supabaseUrl && supabaseKey && authTokenRef.current) {
          fetch(`${supabaseUrl}/rest/v1/rpc/mark_participant_left`, {
            method: "POST",
            keepalive: true,
            headers: {
              "apikey": supabaseKey,
              "Authorization": `Bearer ${authTokenRef.current}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              p_session_id: sessionId,
              p_participant_id: participantId,
              p_reason: reason,
            }),
          }).catch(() => {});
          return;
        }
      }

      await supabase.rpc("mark_participant_left", {
        p_session_id: sessionId,
        p_participant_id: participantId,
        p_reason: reason,
      });
    };

    const triggerStrike = async (type: string, useKeepalive = false) => {
      if (strikeCooldown) return;
      strikeCooldown = true;
      setTimeout(() => { strikeCooldown = false; }, 3000);

      if (useKeepalive) {
        const now = Date.now();
        if (now - lastKeepaliveStrikeAt < 3000) return;
        lastKeepaliveStrikeAt = now;

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (supabaseUrl && supabaseKey && participantId && sessionId && authTokenRef.current) {
          fetch(`${supabaseUrl}/rest/v1/rpc/log_violation`, {
            method: "POST",
            keepalive: true,
            headers: {
              "apikey": supabaseKey,
              "Authorization": `Bearer ${authTokenRef.current}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              p_session_id: sessionId,
              p_participant_id: participantId,
              p_violation_type: type,
            }),
          }).catch(() => {});
        }
      }

      const violationEvent = {
        type,
        timestamp: new Date().toISOString(),
      };

      // Best-effort broadcast — host sees it in real-time
      void gameRoomChannel.send({
        type: "broadcast",
        event: "anti_cheat_violation",
        payload: {
          studentName: participantName,
          studentId: participantId,
          violation: violationEvent,
          violationType: type,
        },
      });
      // Persist to DB via RPC (increments cheat_flags + inserts to participant_violations)
      void supabase.rpc("log_violation", {
        p_session_id: sessionId,
        p_participant_id: participantId,
        p_violation_type: type,
      });
    };

    // ── 1. APP BACKGROUND / TAB HIDDEN ──
    // Fire immediately on hidden so mobile app-switching is captured before WebView suspension.
    const onVisibilityChange = () => {
      if (document.hidden) {
        void triggerStrike("App Backgrounded / Tab Hidden", true);
      }
    };

    const onPageLeave = () => {
      void markParticipantLeft("Left session during active quiz", true);
      void triggerStrike("Page Refresh / Leave", true);
    };

    // ── 3. WINDOW BLUR (alt-tab, mobile notification, switching to another app) ──
    // 500ms debounce prevents OS focus-flicker (e.g. a system dialog that immediately
    // closes) from generating a false positive. If the user refocuses within 500ms
    // (onWindowFocus), the pending timer is cancelled — no strike logged.
    const onWindowBlur = () => {
      if (blurDebounceTimer !== null) return; // Already pending
      blurDebounceTimer = setTimeout(() => {
        blurDebounceTimer = null;
        // Only trigger if the tab is still visible — visibilitychange handles the rest
        if (!document.hidden) void triggerStrike("Window Lost Focus");
      }, 500);
    };
    const onWindowFocus = () => {
      if (blurDebounceTimer !== null) { clearTimeout(blurDebounceTimer); blurDebounceTimer = null; }
    };

    // ── 4. CURSOR LEFT PAGE (mouseleave on document) ──
    // 500ms debounce suppresses rapid edge-jitter without masking genuine exits.
    // Cancels if the cursor re-enters the viewport within the debounce window.
    const onMouseLeave = () => {
      if (mouseLeaveDebounceTimer !== null) return;
      mouseLeaveDebounceTimer = setTimeout(() => {
        mouseLeaveDebounceTimer = null;
        void triggerStrike("App Backgrounded / Tab Hidden", true);
      }, 500);
    };
    const onMouseEnter = () => {
      if (mouseLeaveDebounceTimer !== null) { clearTimeout(mouseLeaveDebounceTimer); mouseLeaveDebounceTimer = null; }
    };

    // ── 5. RIGHT-CLICK (contextmenu) ──
    const onContextMenu = (e: Event) => {
      e.preventDefault();
      void triggerStrike("Right-Click Context Menu");
    };

    // ── 6. CHEAT KEYBOARD SHORTCUTS (F12, Ctrl+U, Ctrl+Shift+I/J/C) ──
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') {
        void triggerStrike("Screenshot Attempt (PrintScreen)");
        return;
      }

      if (
        (e.ctrlKey && ['u', 's'].includes(e.key.toLowerCase())) ||
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(e.key.toLowerCase()))
      ) {
        e.preventDefault();
        void triggerStrike("Blocked Shortcut: " + e.key);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageLeave);
    window.addEventListener("beforeunload", onPageLeave);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("mouseleave", onMouseLeave);
    document.addEventListener("mouseenter", onMouseEnter);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("keydown", onKeyDown);
    const onFreeze = () => {
      void triggerStrike("App Frozen / Backgrounded", true);
    };
    document.addEventListener("freeze" as any, onFreeze as any);

    return () => {
      // Clear all pending debounce timers before removing listeners
      if (blurDebounceTimer !== null) clearTimeout(blurDebounceTimer);
      if (mouseLeaveDebounceTimer !== null) clearTimeout(mouseLeaveDebounceTimer);

      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageLeave);
      window.removeEventListener("beforeunload", onPageLeave);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("mouseleave", onMouseLeave);
      document.removeEventListener("mouseenter", onMouseEnter);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("freeze" as any, onFreeze as any);
      void supabase.removeChannel(gameRoomChannel);
    };
  }, [sessionId, participantId, participantName, sessionStatus]);

  // Keep participant heartbeat fresh while the student is in-session.
  // Host-side anti-cheat uses this to detect app-background/disconnect gaps.
  useEffect(() => {
    if (!sessionId || !participantId || (sessionStatus !== "waiting" && sessionStatus !== "active")) return;

    const touchParticipant = async () => {
      await supabase
        .from("participants")
        .update({ last_active: new Date().toISOString() })
        .eq("id", participantId)
        .eq("session_id", sessionId);
    };

    const onVisible = () => {
      if (!document.hidden) {
        void touchParticipant();
      }
    };

    void touchParticipant();
    const interval = setInterval(() => {
      if (!document.hidden) {
        void touchParticipant();
      }
    }, 5000);

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sessionId, participantId, sessionStatus]);

  // ── Emoji reactions: send + receive on the SAME game-room channel as the host ──
  // Previously the student used a separate 'emoji-room' channel which meant
  // (a) the host never received emojis from students, and
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
          clearPersistedLiveQuizSession();
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
    const persistedSession = getPersistedLiveQuizSession(sessionId);

    const uuid = localStorage.getItem("kahoot_device_uuid");
    const fallbackParticipantId =
      persistedSession?.sessionId === sessionId ? persistedSession?.participantId : undefined;

    if (!uuid && !fallbackParticipantId) { router.push("/join"); return; }

    // Cache auth token for reliable page-close logging (keepalive fetch needs it)
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (authSession?.access_token) {
      authTokenRef.current = authSession.access_token;
    }

    const { data: sData } = await supabase
      .from("live_sessions")
      .select("*, quizzes(title, timer_based_marking, test_mode)")
      .eq("id", sessionId)
      .single();

    if (sData) {
      setSessionInfo(sData);
      setSessionStatus(sData.status);
      setCurrentQuestionIndex(sData.current_question_index ?? 0);
      setIsTestMode(!!(sData as any).quizzes?.test_mode);
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
          .select("id, question_text, question_type, time_limit, image_url, options, order_index")
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

    let pData: any = null;

    if (uuid) {
      const { data } = await supabase
        .from("participants")
        .select("id, streak, display_name")
        .eq("session_id", sessionId)
        .eq("device_uuid", uuid)
        .single();
      pData = data;
    }

    if (!pData && fallbackParticipantId) {
      const { data } = await supabase
        .from("participants")
        .select("id, streak, display_name")
        .eq("session_id", sessionId)
        .eq("id", fallbackParticipantId)
        .single();
      pData = data;
    }

    if (pData) {
      setParticipantId(pData.id);
      setParticipantName(pData.display_name || "Student");
      setStreak(pData.streak || 0);

      setPersistedLiveQuizSession({
        participantId: pData.id,
        sessionId,
        gamePin: persistedSession?.gamePin || "",
        nickname: pData.display_name || "Student",
      });

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
      // Mark notes as initialized so auto-save won't overwrite with empty string
      notesInitializedRef.current = true;

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
            .select("id, question_text, question_type, time_limit, image_url, options, order_index")
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
      clearPersistedLiveQuizSession();
      router.push("/join");
      return;
    }

    setLoading(false);
  };

  const handleAnswerSubmit = async (optionIndices: number[], reactionMs: number) => {
    if (!participantId || !questions.length) return;

    const q = questions[currentQuestionIndex];
    if (!q) return;

    const normalizedIndices = Array.from(new Set(optionIndices.filter((idx) => idx >= 0)));
    const selectedOptionTexts = normalizedIndices
      .map((idx) => q.options[idx]?.text)
      .filter((text: string | undefined): text is string => !!text && text.trim().length > 0);

    const optionTextPayload =
      selectedOptionTexts.length <= 1
        ? (selectedOptionTexts[0] || "")
        : JSON.stringify(selectedOptionTexts);

    // ── Try Secure Submission v2 RPC first ──
    const { data, error } = await supabase.rpc("submit_answer_v2", {
      p_session_id: sessionId,
      p_participant_id: participantId,
      p_question_id: q.id,
      p_option_index: normalizedIndices[0] ?? -1,
      p_option_text: optionTextPayload,
      p_reaction_time_ms: reactionMs
    });

    if (error) {
      if (error.message.includes("banned")) { router.push("/dashboard?error=banned"); return; }
      
      // ── Fallback: RPC not deployed, use direct DB writes ──
      if (error.message.includes("Could not find the function") || error.details?.includes("Could not find the function")) {
        console.warn("submit_answer_v2 RPC not found, using fallback submission.");
        const selectedSet = new Set(selectedOptionTexts.map((text) => text.trim().toLowerCase()));
        const correctSet = new Set(
          (q.options as any[])
            .filter((opt: any) => !!opt?.is_correct)
            .map((opt: any) => String(opt.text || "").trim().toLowerCase())
            .filter((text: string) => text.length > 0)
        );
        const isCorrect =
          selectedSet.size > 0 &&
          selectedSet.size === correctSet.size &&
          [...selectedSet].every((text) => correctSet.has(text));
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
      if (sessionStatus === "active") {
        await supabase.rpc("mark_participant_left", {
          p_session_id: sessionId,
          p_participant_id: participantId,
          p_reason: "Left session during active quiz",
        });

        if (reactionChannelRef.current) {
          await reactionChannelRef.current.send({
            type: "broadcast",
            event: "anti_cheat_violation",
            payload: {
              studentName: participantName,
              studentId: participantId,
              violationType: "Left session during active quiz",
            },
          });
        }

        clearPersistedLiveQuizSession();
        router.push("/dashboard?error=left-session");
        return;
      }

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
      clearPersistedLiveQuizSession();

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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col p-4 md:p-8 pt-20 md:pt-24 select-none">

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
            <div className="inline-flex items-center justify-center gap-2 bg-white/70 dark:bg-slate-800/60 backdrop-blur-md border border-white dark:border-slate-700/50 px-6 py-3 rounded-full shadow-xl mb-8">
              <span className="text-sm font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300">GAME PIN:</span>
              <span className="font-mono text-2xl font-black tracking-[0.2em] text-indigo-600 dark:text-indigo-400">
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

            <div className="fixed bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-white/70 dark:bg-slate-800/60 backdrop-blur-md border border-white dark:border-slate-700/50 px-6 py-3 rounded-full shadow-xl z-40">
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
            imageUrl={questions[currentQuestionIndex].image_url || null}
            questionType={questions[currentQuestionIndex].question_type || "mcq"}
            options={questions[currentQuestionIndex].options}
            timeLimit={questions[currentQuestionIndex].time_limit}
            streak={streak}
            isRevealed={revealedQuestionIndex === currentQuestionIndex}
            wasAnswerCorrect={lastAnswerCorrect}
            onAnswer={handleAnswerSubmit}
            isGhostMode={isGhostMode}
            isAlreadyAnswered={answeredQuestions.has(questions[currentQuestionIndex].id)}
            isTestMode={isTestMode}
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
                {isTestMode ? "Quiz Completed!" : "Game Over!"}
              </h2>
              <p className="text-slate-500 dark:text-slate-400">
                {isTestMode ? "Your responses have been recorded. Results will be shared by your host." : "Final Standings"}
              </p>
            </div>

            {/* Leaderboard — hidden in test mode */}
            {!isTestMode && (
              <div className="space-y-3 mb-8">
                {leaderboard.map((p, idx) => {
                  const isTop3 = idx < 3;
                  const podiumColors = [
                    "bg-gradient-to-r from-amber-200 to-amber-400 border-amber-400 dark:from-amber-600/60 dark:to-amber-500/30 text-amber-900 dark:text-amber-100",
                    "bg-gradient-to-r from-slate-200 to-slate-400 border-slate-400 dark:from-slate-600/60 dark:to-slate-500/30 text-slate-800 dark:text-slate-100",
                    "bg-gradient-to-r from-orange-200 to-orange-400 border-orange-400 dark:from-orange-800/60 dark:to-orange-600/30 text-orange-950 dark:text-orange-100"
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
            )}

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
