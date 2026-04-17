"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { generateRoomCode } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Play, Edit3, Trash2, Clock, Hash, Award, MonitorPlay, ChevronRight, FileText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Quiz {
  id: string;
  title: string;
  description: string;
  created_at: string;
  _count?: { questions: number };
}

interface ReportSession {
  id: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  join_code: string;
  quizzes: { title: string } | null;
  participants?: Array<{ id: string; display_name: string; score: number; cheat_flags?: number; is_banned?: boolean }>;
}

interface ParticipantHistory {
  id: string;
  score: number;
  session_id: string;
  device_uuid?: string;
  display_name?: string;
  joined_at: string;
  live_sessions: { quizzes: { title: string } } | null;
  rank?: number;
}

const formatOrdinal = (n: number) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n}st`;
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
  return `${n}th`;
};

const getRankPresentation = (rank?: number) => {
  if (!rank) {
    return { label: "Unranked", colorClass: "text-slate-400 dark:text-slate-500" };
  }
  if (rank === 1) {
    return { label: "🥇 1st Place", colorClass: "text-amber-400" };
  }
  if (rank === 2) {
    return { label: "🥈 2nd Place", colorClass: "text-slate-300" };
  }
  if (rank === 3) {
    return { label: "🥉 3rd Place", colorClass: "text-amber-700 dark:text-amber-600" };
  }
  return { label: `${formatOrdinal(rank)} Place`, colorClass: "text-slate-400" };
};

export default function UnifiedDashboard() {
  const router = useRouter();
  const [supabase] = useState(() => createSupabaseBrowserClient());

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<{ display_name: string; role: string } | null>(null);

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [history, setHistory] = useState<ParticipantHistory[]>([]);
  const [reportSessions, setReportSessions] = useState<ReportSession[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingReports, setLoadingReports] = useState(true);
  const [activeTab, setActiveTab] = useState<'history' | 'hosted' | 'reports'>('history');

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { router.push("/login"); return; }
      setUser(session.user);
      await fetchProfile(session.user.id, session.user.email ?? "");
      fetchHistory(session.user.id);
      fetchQuizzes(session.user.id);
      fetchReports(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') router.push('/login');
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string, email: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("display_name, role, avatar_url")
      .eq("id", userId)
      .maybeSingle();

    if (!data) {
      setProfile({ display_name: email.split("@")[0] || "User", role: "student" });
      return;
    }

    setProfile({ display_name: data.display_name || "User", role: data.role || "student" });
  };

  const fetchHistory = async (userId: string) => {
    setLoadingHistory(true);

    const deviceUuid = typeof window !== "undefined" ? localStorage.getItem("kahoot_device_uuid") : null;

    // participants does not include user_id in current schema; identify history by device UUID.
    // For legacy data without a UUID match, fallback to display_name from profile.
    let rows: any[] = [];

    if (deviceUuid) {
      const { data, error } = await supabase
        .from("participants")
        .select("id, score, session_id, joined_at, device_uuid, display_name, live_sessions(quizzes(title))")
        .eq("device_uuid", deviceUuid)
        .order("joined_at", { ascending: false })
        .limit(20);

      if (!error && data) {
        rows = data;
      }
    }

    if (rows.length === 0) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle();

      if (profile?.display_name) {
        const { data, error } = await supabase
          .from("participants")
          .select("id, score, session_id, joined_at, device_uuid, display_name, live_sessions(quizzes(title))")
          .eq("display_name", profile.display_name)
          .order("joined_at", { ascending: false })
          .limit(20);

        if (!error && data) {
          rows = data;
        }
      }
    }

    const baseRows = rows as ParticipantHistory[];

    if (baseRows.length > 0) {
      const sessionIds = Array.from(new Set(baseRows.map((row) => row.session_id)));

      const { data: sessionParticipants } = await supabase
        .from("participants")
        .select("id, session_id, score")
        .in("session_id", sessionIds);

      const participantsBySession = new Map<string, Array<{ id: string; score: number }>>();
      (sessionParticipants || []).forEach((p: any) => {
        const list = participantsBySession.get(p.session_id) || [];
        list.push({ id: p.id, score: p.score || 0 });
        participantsBySession.set(p.session_id, list);
      });

      participantsBySession.forEach((list, sessionId) => {
        list.sort((a, b) => b.score - a.score);
        participantsBySession.set(sessionId, list);
      });

      const withRank = baseRows.map((row) => {
        const leaderboard = participantsBySession.get(row.session_id) || [];
        const index = leaderboard.findIndex((p) => p.id === row.id);
        return {
          ...row,
          rank: index >= 0 ? index + 1 : undefined,
        };
      });

      setHistory(withRank);
    } else {
      setHistory(baseRows);
    }
    setLoadingHistory(false);
  };

  const fetchQuizzes = async (userId: string) => {
    setLoadingQuizzes(true);
    const { data } = await supabase
      .from("quizzes")
      .select("*, questions(count)")
      .eq("teacher_id", userId)
      .order("created_at", { ascending: false });
    if (data) {
      setQuizzes(data.map((q: any) => ({ ...q, _count: { questions: q.questions[0]?.count ?? 0 } })));
    }
    setLoadingQuizzes(false);
  };

  const fetchReports = async (userId: string) => {
    setLoadingReports(true);

    const { data } = await supabase
      .from("live_sessions")
      .select(`
        *,
        quizzes(title),
        participants(id, display_name, score, cheat_flags, is_banned)
      `)
      .eq("teacher_id", userId)
      .in("status", ["waiting", "active", "finished", "completed"])
      .order("started_at", { ascending: false });

    if (data) {
      const cleaned = data.map((session: any) => ({
        ...session,
        participants: (session.participants || []).filter((participant: any) => !participant.is_banned),
      }));
      setReportSessions(cleaned);
    }

    setLoadingReports(false);
  };

  const createNewQuiz = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("quizzes")
      .insert([{ title: "Untitled Quiz", description: "", teacher_id: user.id }])
      .select("id")
      .single();

    if (error) {
      return;
    }

    // Fallback in case insert succeeds but returned row is empty due policy constraints.
    let newQuizId = data?.id;
    if (!newQuizId) {
      const { data: fallbackQuiz } = await supabase
        .from("quizzes")
        .select("id")
        .eq("teacher_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      newQuizId = fallbackQuiz?.id;
    }

    if (newQuizId) router.push(`/quiz/${newQuizId}/edit`);
  };

  const deleteQuiz = async (id: string) => {
    if (!confirm("Delete this quiz and all its questions?")) return;
    await supabase.from("quizzes").delete().eq("id", id);
    setQuizzes((prev) => prev.filter((q) => q.id !== id));
  };

  const startSession = async (quizId: string) => {
    if (!user) return;
    const { data } = await supabase
      .from("live_sessions")
      .insert([{ quiz_id: quizId, teacher_id: user.id, join_code: generateRoomCode(), status: "waiting" }])
      .select()
      .single();
    if (data) router.push(`/host/${data.id}`);
  };

  const greeting = profile?.display_name ? `Hi, ${profile.display_name.split(" ")[0]} 👋` : "Your Dashboard";

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-10 space-y-8 sm:space-y-10">
      {/* Hero greeting */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">{greeting}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Everything in one place.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/join"
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/30 transition-all"
          >
            <MonitorPlay size={18} /> Join Game
          </Link>
          <button
            onClick={createNewQuiz}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-lg shadow-indigo-500/30 transition-all"
          >
            <Plus size={18} /> Create Quiz
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-2xl w-fit border border-slate-200/70 dark:border-slate-700/70">
        {(['history', 'hosted', 'reports'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === tab
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            {tab === 'history' ? '🎮 Games Played' : tab === 'hosted' ? '📋 My Quizzes' : '📊 Reports'}
          </button>
        ))}
      </div>

      {/* Games Played Tab */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {loadingHistory ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-white/5 shadow-sm animate-pulse" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-200 dark:border-white/10 shadow-sm">
              <div className="text-5xl mb-4">🎯</div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No games yet</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-6">Join a quiz to see your history here.</p>
              <Link href="/join" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-lg shadow-emerald-500/30 transition-all">
                <MonitorPlay size={18} /> Join a Game
              </Link>
            </div>
          ) : (
            <AnimatePresence>
              {history.map((entry, idx) => {
                const rankView = getRankPresentation(entry.rank);
                return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className="flex items-center gap-5 bg-white dark:bg-slate-800 rounded-2xl px-6 py-4 shadow-sm border border-slate-200/60 dark:border-white/5"
                >
                  <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center shrink-0">
                    <Award className="text-indigo-600 dark:text-indigo-400" size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white truncate">
                      {(entry.live_sessions as any)?.quizzes?.title ?? "Unknown Quiz"}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                      <Clock size={12} /> {new Date(entry.joined_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 leading-none">
                      {entry.score.toLocaleString()} pts
                    </div>
                    <div className={`mt-1 text-sm font-semibold ${rankView.colorClass}`}>
                      {rankView.label}
                    </div>
                  </div>
                </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      )}

      {/* My Quizzes Tab */}
      {activeTab === 'hosted' && (
        <div className="space-y-4">
          <AnimatePresence>
            {loadingQuizzes
              ? [1, 2, 3].map((i) => (
                  <div key={i} className="h-24 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-white/5 shadow-sm animate-pulse" />
                ))
              : quizzes.length === 0 ? (
                  <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-200 dark:border-white/10 shadow-sm">
                    <div className="text-5xl mb-4">📝</div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No quizzes yet</h3>
                    <p className="text-slate-500 dark:text-slate-400 mb-6">Create your first quiz and start hosting!</p>
                    <button
                      onClick={createNewQuiz}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all shadow-lg shadow-indigo-500/30"
                    >
                      <Plus size={18} /> Create Quiz
                    </button>
                  </div>
                )
              : quizzes.map((quiz, idx) => (
                  <motion.div
                    key={quiz.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ delay: idx * 0.04 }}
                    className="group flex items-center gap-5 bg-white dark:bg-slate-800 rounded-2xl px-6 py-5 shadow-sm border border-slate-200/60 dark:border-white/5 hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-all"
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-slate-900 dark:text-white text-lg truncate">{quiz.title}</h3>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Hash size={11} /> {quiz._count?.questions ?? 0} questions</span>
                        <span className="flex items-center gap-1"><Clock size={11} /> {new Date(quiz.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link href={`/quiz/${quiz.id}/edit`} className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors">
                        <Edit3 size={18} />
                      </Link>
                      <button onClick={() => deleteQuiz(quiz.id)} className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors">
                        <Trash2 size={18} />
                      </button>
                    </div>
                    <button
                      onClick={() => startSession(quiz.id)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-lg shadow-indigo-500/30 transition-all"
                    >
                      <Play size={16} /> Host Live
                    </button>
                  </motion.div>
                ))}
          </AnimatePresence>
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          {loadingReports ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-white/5 shadow-sm animate-pulse" />
              ))}
            </div>
          ) : reportSessions.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-200 dark:border-white/10 shadow-sm">
              <div className="text-5xl mb-4">📊</div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No reports yet</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-6">Run a live quiz to generate analytics and session reports.</p>
              <button
                onClick={() => setActiveTab('hosted')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-500/30 transition-all"
              >
                Back to My Quizzes
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {reportSessions.map((session, idx) => {
                const sortedPlayers = [...(session.participants || [])].sort((a, b) => b.score - a.score);
                const totalPlayers = sortedPlayers.length;
                const totalCheats = sortedPlayers.reduce((sum, participant) => sum + (participant.cheat_flags || 0), 0);
                const topScore = sortedPlayers[0]?.score || 0;

                return (
                  <motion.div
                    key={session.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    className="bg-white dark:bg-slate-800 rounded-2xl px-4 sm:px-6 py-4 sm:py-5 shadow-sm border border-slate-200/60 dark:border-white/5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-slate-900 dark:text-white text-base sm:text-lg truncate">{session.quizzes?.title || "Unknown Quiz"}</h3>
                        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                          {session.status === "active" ? "Live now" : "Played on"} {new Date(session.finished_at || session.started_at || Date.now()).toLocaleDateString()}
                        </p>
                      </div>
                      <Link
                        href={`/dashboard/reports/${session.id}`}
                        className="w-full sm:w-auto inline-flex items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 sm:py-1.5 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20 whitespace-nowrap"
                      >
                        View Analytics
                      </Link>
                    </div>

                    <div className="mt-4 sm:mt-5 grid grid-cols-3 gap-2 sm:gap-3">
                      <div className="rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-white/5 p-3 sm:p-4">
                        <div className="text-xs font-semibold text-slate-500 truncate">Players</div>
                        <div className="mt-1 text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{totalPlayers}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-white/5 p-3 sm:p-4">
                        <div className="text-xs font-semibold text-slate-500 truncate">Top Score</div>
                        <div className="mt-1 text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{topScore}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-white/5 p-3 sm:p-4">
                        <div className="text-xs font-semibold text-slate-500 truncate">Cheats</div>
                        <div className="mt-1 text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{totalCheats}</div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
