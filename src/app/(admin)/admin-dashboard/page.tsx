"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import { Users, Server, BookOpen, Trash2, Ban, RefreshCw, LayoutDashboard, ShieldCheck, Activity, FileText } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type CompletedSessionRow = {
  id: string;
  status: string;
  finished_at: string | null;
  started_at?: string | null;
  quizzes?: { title?: string } | null;
  profiles?: { display_name?: string } | null;
};

export default function AdminDashboard() {
  const [stats, setStats] = useState({ totalUsers: 0, activeSessions: 0, totalQuizzes: 0 });
  const [usersList, setUsersList] = useState<any[]>([]);
  const [completedSessionsList, setCompletedSessionsList] = useState<CompletedSessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    setLoading(true);
    
    // 1. Fetch Stats
    const { count: usersCount } = await supabase.from("profiles").select("*", { count: "exact", head: true });
    const { count: sessionsCount } = await supabase.from("live_sessions").select("*", { count: "exact", head: true }).eq("status", "active");
    const { count: quizzesCount } = await supabase.from("quizzes").select("*", { count: "exact", head: true });
    
    setStats({
      totalUsers: usersCount || 0,
      activeSessions: sessionsCount || 0,
      totalQuizzes: quizzesCount || 0
    });

    // 2. Fetch Users (for Data Table)
    const { data: users } = await supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(20);
    if (users) setUsersList(users);

    // 3. Fetch Global live + completed sessions for Admin report access
    const { data: sessions } = await supabase
      .from("live_sessions")
      .select("id, status, started_at, finished_at, quizzes(title), profiles(display_name)")
      .in("status", ["active", "completed", "finished"])
      .order("started_at", { ascending: false })
      .limit(50);

    if (sessions) setCompletedSessionsList(sessions as CompletedSessionRow[]);
    
    setLoading(false);
  };

  const deleteUser = async (id: string) => {
    if (!confirm("Are you sure you want to completely delete this user? This will cascade delete their quizzes and data.")) return;
    await supabase.from("profiles").delete().eq("id", id);
    setUsersList(usersList.filter(u => u.id !== id));
  };

  return (
    <div className="min-h-screen transition-colors p-4 md:p-8">
      
      {/* Admin Navbar */}
      <div className="max-w-7xl mx-auto flex items-center justify-between mb-8 bg-white/70 dark:bg-slate-900/50 backdrop-blur-xl p-4 px-6 rounded-2xl border border-white/20 dark:border-slate-800/50 shadow-[0_10px_30px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_40px_rgba(2,6,23,0.45)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
            <ShieldCheck className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Super Admin</h1>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Control Panel</p>
          </div>
        </div>
        <div className="flex gap-4">
          <button onClick={fetchAdminData} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 bg-gray-50 hover:bg-indigo-50 dark:bg-slate-900/50 dark:hover:bg-indigo-500/10 rounded-lg transition-colors border border-gray-200 dark:border-white/5">
            <RefreshCw size={16} /> Refresh
          </button>
          <Link href="/dashboard" className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg transition-all shadow-md">
            <LayoutDashboard size={16} /> Exit to Teacher
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Top-Level Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-6 bg-white/70 dark:bg-slate-900/50 backdrop-blur-xl rounded-3xl border border-white/20 dark:border-slate-800/50 relative overflow-hidden group transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_20px_rgba(99,102,241,0.15)] dark:hover:shadow-[0_0_20px_rgba(99,102,241,0.2)]">
            <div className="absolute top-0 right-0 -mr-4 -mt-4 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all duration-500" />
            <div className="flex items-center justify-between mb-4 relative z-10">
              <span className="text-slate-500 dark:text-slate-400 font-semibold tracking-wide text-sm">TOTAL USERS</span>
              <Users className="text-blue-500" size={24} />
            </div>
            <div className="text-4xl font-black text-slate-900 dark:text-white relative z-10">
              {loading ? <span className="animate-pulse bg-slate-200 dark:bg-slate-700 h-10 w-24 block rounded-lg" /> : stats.totalUsers}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="p-6 bg-white/70 dark:bg-slate-900/50 backdrop-blur-xl rounded-3xl border border-white/20 dark:border-slate-800/50 relative overflow-hidden group transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_20px_rgba(99,102,241,0.15)] dark:hover:shadow-[0_0_20px_rgba(99,102,241,0.2)]">
            <div className="absolute top-0 right-0 -mr-4 -mt-4 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all duration-500" />
            <div className="flex items-center justify-between mb-4 relative z-10">
              <span className="text-slate-500 dark:text-slate-400 font-semibold tracking-wide text-sm">ACTIVE SESSIONS</span>
              <Activity className="text-emerald-500" size={24} />
            </div>
            <div className="text-4xl font-black text-slate-900 dark:text-white relative z-10">
              {loading ? <span className="animate-pulse bg-slate-200 dark:bg-slate-700 h-10 w-24 block rounded-lg" /> : stats.activeSessions}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="p-6 bg-white/70 dark:bg-slate-900/50 backdrop-blur-xl rounded-3xl border border-white/20 dark:border-slate-800/50 relative overflow-hidden group transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_20px_rgba(99,102,241,0.15)] dark:hover:shadow-[0_0_20px_rgba(99,102,241,0.2)]">
            <div className="absolute top-0 right-0 -mr-4 -mt-4 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-all duration-500" />
            <div className="flex items-center justify-between mb-4 relative z-10">
              <span className="text-slate-500 dark:text-slate-400 font-semibold tracking-wide text-sm">TOTAL QUIZZES</span>
              <BookOpen className="text-purple-500" size={24} />
            </div>
            <div className="text-4xl font-black text-slate-900 dark:text-white relative z-10">
               {loading ? <span className="animate-pulse bg-slate-200 dark:bg-slate-700 h-10 w-24 block rounded-lg" /> : stats.totalQuizzes}
            </div>
          </motion.div>
        </div>

        {/* Complex Data Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Recent Users Table */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="bg-white/70 dark:bg-slate-900/50 backdrop-blur-xl rounded-3xl border border-white/20 dark:border-slate-800/50 overflow-hidden flex flex-col h-[500px]">
            <div className="p-6 border-b border-gray-100 dark:border-white/5">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2"><Server size={20} className="text-indigo-500"/> User Management</h2>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-gray-50/95 dark:bg-slate-900/95 backdrop-blur z-10 shadow-sm border-b border-gray-100 dark:border-white/5">
                  <tr>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                  {usersList.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/80 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{user.display_name}</div>
                        <div className="text-xs text-slate-500 font-mono mt-1 w-32 truncate" title={user.id}>{user.id}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn("px-3 py-1 text-xs font-bold rounded-full border", 
                          user.role === 'admin' ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20" : 
                          user.role === 'teacher' ? "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20" : 
                          "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
                        )}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                        <button onClick={() => deleteUser(user.id)} disabled={user.role === 'admin'} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent">
                          {user.role === 'admin' ? <Ban size={18} /> : <Trash2 size={18} />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* Global Completed Sessions Table */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="bg-slate-900/50 backdrop-blur-xl rounded-3xl border border-slate-800/50 overflow-hidden flex flex-col h-[500px]">
            <div className="p-6 border-b border-gray-100 dark:border-white/5">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2"><Activity size={20} className="text-emerald-500"/> Session Management</h2>
              <p className="text-xs mt-1 text-slate-400">Global live and completed sessions across the platform</p>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-slate-900/95 backdrop-blur z-10 shadow-sm border-b border-slate-800/60">
                  <tr>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Quiz Title</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Host Name</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Completed At</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {completedSessionsList.map((sess) => (
                    <tr key={sess.id} className="hover:bg-slate-800/70 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-100 truncate max-w-[220px]">{sess.quizzes?.title || "Unknown Quiz"}</div>
                        <div className="text-[11px] text-slate-500 font-mono mt-1">{sess.id.slice(0, 8)}...</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-slate-200 font-medium">{sess.profiles?.display_name || "Unknown Host"}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-300 text-sm uppercase">{sess.status}</td>
                      <td className="px-6 py-4 text-slate-300 text-sm">{sess.finished_at ? new Date(sess.finished_at).toLocaleString() : sess.started_at ? new Date(sess.started_at).toLocaleString() : "N/A"}</td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/dashboard/reports/${sess.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg transition-colors"
                        >
                          <FileText size={14} /> View Report
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {completedSessionsList.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-10 text-center text-slate-400 text-sm">
                        No live/completed sessions found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>

        </div>
      </div>
    </div>
  );
}
