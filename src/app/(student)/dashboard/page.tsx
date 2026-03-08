"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Hash, Clock, Award, Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface ParticipantHistory {
  id: string;
  score: number;
  session_id: string;
  joined_at: string;
  live_sessions: {
    quiz_id: string;
    quizzes: {
      title: string;
    }
  }
}

export default function StudentDashboard() {
  const router = useRouter();
  
  // Create a memoized, safe instance of the browser client for this component
  const [supabase] = useState(() => createSupabaseBrowserClient());
  
  const [history, setHistory] = useState<ParticipantHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorProfile, setErrorProfile] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkAuthStatus = async () => {
      // 1. Check if Supabase is currently processing an OAuth hash in the URL
      if (typeof window !== 'undefined' && (window.location.hash.includes("access_token") || window.location.hash.includes("error_description"))) {
        // Just wait. The onAuthStateChange listener will pick it up when done.
        return;
      }

      // 2. Fetch current session synchronously as fallback
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        if (mounted) {
          console.warn("Dashboard fallback: session.user is null, redirecting to login");
          router.push("/login?message=Session expired. Please log in again.");
        }
        return;
      }
      
      if (mounted) fetchHistory(session.user);
    };

    checkAuthStatus();

    // 3. Listen for the actual OAuth settlement
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user && mounted) {
        fetchHistory(session.user);
      } else if (event === 'SIGNED_OUT' && mounted) {
        console.warn("Dashboard specific listener: SIGNED_OUT event received, redirecting");
        router.push("/login?message=Logged out.");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const fetchHistory = async (user: any) => {
    try {

      const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      
      if (!profile) {
        setErrorProfile(true);
        return;
      }

      const { data, error } = await supabase
        .from('participants')
        .select('id, score, session_id, joined_at, live_sessions(quiz_id, quizzes(title))')
        .eq('display_name', profile.display_name)
        .order('joined_at', { ascending: false });

      if (data) setHistory(data as any);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 min-h-screen transition-colors pt-8 pb-32 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">My Game History</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Review your past scores and played quizzes</p>
        </div>
        <Link href="/join">
          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-lg shadow-emerald-600/20 transition-all"
          >
            <Play size={20} />
            Join New Game
          </motion.button>
        </Link>
      </div>

      {/* History Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 rounded-3xl bg-white/70 dark:bg-slate-900/50 backdrop-blur-xl border border-white/20 dark:border-slate-800/50 animate-pulse" />
          ))}
        </div>
      ) : errorProfile ? (
        <div className="text-center py-20 bg-rose-50 dark:bg-rose-500/10 rounded-3xl border border-dashed border-rose-200 dark:border-rose-500/20">
          <h3 className="text-lg font-bold text-rose-600 dark:text-rose-400 mb-2">Account Setup Incomplete</h3>
          <p className="text-rose-500 dark:text-rose-400/80 mb-6 max-w-md mx-auto">
            Your Google account logged in, but the database profile trigger is missing. Please tell your administrator to run the `default_student_trigger.sql` script into the database!
          </p>
        </div>
      ) : history.length === 0 ? (
        <div className="text-center py-20 bg-white/70 dark:bg-slate-900/50 backdrop-blur-xl rounded-3xl border border-dashed border-white/20 dark:border-slate-800/50">
          <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Award className="text-emerald-600 dark:text-emerald-400" size={32} />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">No games played yet</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-6">Join your first live quiz to start tracking your scores!</p>
          <Link href="/join" className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline">
            Click here to play
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {history.map((record, idx) => (
              <motion.div key={record.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
                className="group relative bg-white/70 dark:bg-slate-900/50 backdrop-blur-xl rounded-3xl p-6 border border-white/20 dark:border-slate-800/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_20px_rgba(99,102,241,0.15)] dark:hover:shadow-[0_0_20px_rgba(99,102,241,0.2)]"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white truncate pb-1">
                      {record.live_sessions.quizzes.title || 'Unknown Quiz'}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-4 py-4 border-y border-gray-100 dark:border-white/10 mb-2">
                  <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                    <Award size={16} className="text-amber-500" />
                    <span className="font-semibold text-amber-600 dark:text-amber-500">{record.score}</span> pts
                  </div>
                  <div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
                  <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300 truncate">
                    <Clock size={16} className="text-indigo-500" />
                    <span>{new Date(record.joined_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
