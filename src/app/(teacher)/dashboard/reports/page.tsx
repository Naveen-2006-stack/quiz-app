"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import { BarChart3, Trophy, Users, ShieldAlert, Award } from "lucide-react";
import Link from "next/link";

export default function ReportsDashboard() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFinishedSessions();
  }, []);

  const fetchFinishedSessions = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fetch live + completed sessions and inner join quizzes and participants
    const { data } = await supabase
      .from("live_sessions")
      .select(`
        *,
        quizzes(title),
        participants(id, display_name, score, cheat_flags)
      `)
      .eq("teacher_id", user.id)
      .in("status", ["active", "finished", "completed"])
      .order("started_at", { ascending: false });

    if (data) setSessions(data);
    setLoading(false);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Reports & Analytics</h1>
        <p className="text-slate-500 dark:text-slate-400">Review historical data and student performance from your live sessions.</p>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-32 bg-white dark:bg-slate-800 rounded-3xl border border-gray-100 dark:border-white/5" />)}
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-24 bg-white dark:bg-slate-800 rounded-[2rem] border border-dashed border-gray-200 dark:border-white/10">
          <BarChart3 className="mx-auto w-16 h-16 text-indigo-200 dark:text-indigo-900 mb-4" />
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">No Reports Yet</h3>
          <p className="text-slate-500">Host your first live game to start generating analytics!</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sessions.map((sess, idx) => {
            const sortedPlayers = [...(sess.participants || [])].sort((a,b) => b.score - a.score);
            const totalPlayers = sortedPlayers.length;
            const topScore = sortedPlayers[0]?.score || 0;
            const totalCheats = sortedPlayers.reduce((sum, p) => sum + (p.cheat_flags || 0), 0);

            return (
              <motion.div 
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}
                key={sess.id}
                className="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/40 dark:shadow-none border border-gray-100 dark:border-white/10"
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-gray-100 dark:border-white/10 pb-6">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{sess.quizzes?.title || "Unknown Quiz"}</h3>
                    <p className="text-sm font-medium text-slate-500">
                      {sess.status === "active" ? "Live now" : "Played on"} {new Date(sess.finished_at || sess.started_at || Date.now()).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <div className="font-mono text-sm tracking-widest text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-4 py-2 rounded-xl font-bold inline-block">
                      PIN: {sess.join_code}
                    </div>
                    <Link
                      href={`/dashboard/reports/${sess.id}`}
                      className="inline-flex items-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                    >
                      View Full Analytics
                    </Link>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
                  <div className="flex flex-col gap-2 p-4 rounded-2xl bg-gray-50 dark:bg-slate-900 border border-gray-100 dark:border-white/5">
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 font-semibold"><Users size={18}/> Players</div>
                    <div className="text-3xl font-black text-slate-900 dark:text-white">{totalPlayers}</div>
                  </div>
                  <div className="flex flex-col gap-2 p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20">
                    <div className="flex items-center gap-2 text-amber-600 font-semibold"><Trophy size={18}/> Top Score</div>
                    <div className="text-3xl font-black text-amber-500">{topScore}</div>
                  </div>
                  <div className="flex flex-col gap-2 p-4 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20">
                    <div className="flex items-center gap-2 text-rose-600 font-semibold"><ShieldAlert size={18}/> Cheat Flags</div>
                    <div className="text-3xl font-black text-rose-500">{totalCheats}</div>
                  </div>
                </div>

                <div>
                  <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <Award className="text-indigo-500" /> Leaderboard Map
                  </h4>
                  <div className="space-y-3">
                    {sortedPlayers.slice(0, 5).map((p, i) => (
                      <div key={p.id} className="flex justify-between items-center bg-gray-50 dark:bg-slate-900 p-4 rounded-xl border border-gray-100 dark:border-white/5">
                        <div className="flex items-center gap-4">
                          <span className={`font-black text-xl w-6 ${i === 0 ? "text-amber-500" : i === 1 ? "text-slate-400" : i === 2 ? "text-amber-700" : "text-slate-300 dark:text-slate-600"}`}>
                            #{i + 1}
                          </span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">{p.display_name}</span>
                          {p.cheat_flags > 0 && <span className="text-xs bg-rose-100 text-rose-600 px-2 py-0.5 rounded-md font-bold text-center">FLAGGED ×{p.cheat_flags}</span>}
                        </div>
                        <span className="font-black text-indigo-600 dark:text-indigo-400">{p.score}</span>
                      </div>
                    ))}
                    {totalPlayers > 5 && (
                      <div className="text-center text-sm font-medium text-slate-500 pt-2">
                        + {totalPlayers - 5} more player(s) not shown
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
