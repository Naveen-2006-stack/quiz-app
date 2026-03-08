"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { generateRoomCode } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Play, Edit3, Trash2, Clock, Hash, Award, MonitorPlay, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Quiz {
  id: string;
  title: string;
  description: string;
  created_at: string;
  _count?: { questions: number };
}

interface ParticipantHistory {
  id: string;
  score: number;
  session_id: string;
  joined_at: string;
  live_sessions: { quizzes: { title: string } };
}

export default function UnifiedDashboard() {
  const router = useRouter();
  const [supabase] = useState(() => createSupabaseBrowserClient());

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<{ display_name: string; role: string } | null>(null);

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [history, setHistory] = useState<ParticipantHistory[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [activeTab, setActiveTab] = useState<'history' | 'hosted'>('history');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) { router.push("/login"); return; }
      setUser(session.user);
      fetchProfile(session.user.id);
      fetchHistory(session.user.id);
      fetchQuizzes(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') router.push('/login');
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from("profiles").select("display_name, role").eq("id", userId).maybeSingle();
    setProfile({ display_name: data?.display_name || "User", role: data?.role || "student" });
  };

  const fetchHistory = async (userId: string) => {
    setLoadingHistory(true);
    const { data } = await supabase
      .from("participants")
      .select("id, score, session_id, joined_at, live_sessions(quizzes(title))")
      .eq("user_id", userId)
      .order("joined_at", { ascending: false })
      .limit(20);
    if (data) setHistory(data as any);
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

  const createNewQuiz = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("quizzes")
      .insert([{ title: "Untitled Quiz", description: "", teacher_id: user.id }])
      .select()
      .single();
    if (data) router.push(`/quiz/${data.id}/edit`);
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
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">
      {/* Hero greeting */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">{greeting}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Everything in one place.</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/join"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all"
          >
            <MonitorPlay size={18} /> Join Game
          </Link>
          <button
            onClick={createNewQuiz}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-lg shadow-indigo-600/20 transition-all"
          >
            <Plus size={18} /> Create Quiz
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 dark:bg-slate-800/60 p-1 rounded-2xl w-fit">
        {(['history', 'hosted'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === tab
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            {tab === 'history' ? '🎮 Games Played' : '📋 My Quizzes'}
          </button>
        ))}
      </div>

      {/* Games Played Tab */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {loadingHistory ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-gray-200 dark:border-white/10">
              <div className="text-5xl mb-4">🎯</div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No games yet</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-6">Join a quiz to see your history here.</p>
              <Link href="/join" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold transition-all">
                <MonitorPlay size={18} /> Join a Game
              </Link>
            </div>
          ) : (
            <AnimatePresence>
              {history.map((entry, idx) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className="flex items-center gap-5 bg-white dark:bg-slate-800 rounded-2xl px-6 py-4 shadow-sm border border-gray-100 dark:border-white/5"
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
                  <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 shrink-0">
                    {entry.score.toLocaleString()} pts
                  </div>
                </motion.div>
              ))}
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
                  <div key={i} className="h-24 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                ))
              : quizzes.length === 0 ? (
                  <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-gray-200 dark:border-white/10">
                    <div className="text-5xl mb-4">📝</div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No quizzes yet</h3>
                    <p className="text-slate-500 dark:text-slate-400 mb-6">Create your first quiz and start hosting!</p>
                    <button
                      onClick={createNewQuiz}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all shadow-lg shadow-indigo-600/20"
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
                    className="group flex items-center gap-5 bg-white dark:bg-slate-800 rounded-2xl px-6 py-5 shadow-sm border border-gray-100 dark:border-white/5 hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-all"
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-slate-900 dark:text-white text-lg truncate">{quiz.title}</h3>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Hash size={11} /> {quiz._count?.questions ?? 0} questions</span>
                        <span className="flex items-center gap-1"><Clock size={11} /> {new Date(quiz.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link href={`/quiz/${quiz.id}/edit`} className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors">
                        <Edit3 size={18} />
                      </Link>
                      <button onClick={() => deleteQuiz(quiz.id)} className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors">
                        <Trash2 size={18} />
                      </button>
                    </div>
                    <button
                      onClick={() => startSession(quiz.id)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm shadow-md shadow-emerald-500/30 transition-all"
                    >
                      <Play size={16} /> Host Live
                    </button>
                  </motion.div>
                ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
