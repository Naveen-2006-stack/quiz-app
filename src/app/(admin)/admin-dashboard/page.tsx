"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import { Users, Server, BookOpen, Trash2, Ban, RefreshCw, LayoutDashboard, ShieldCheck, Activity, FileText, Eye, EyeOff, MessageSquare, Slash } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type CompletedSessionRow = {
  id: string;
  status: string;
  teacher_id?: string | null;
  finished_at: string | null;
  started_at?: string | null;
  quizzes?: { title?: string } | null;
  host_name?: string;
};

export default function AdminDashboard() {
  const [stats, setStats] = useState({ totalUsers: 0, activeSessions: 0, totalQuizzes: 0 });
  const [usersList, setUsersList] = useState<any[]>([]);
  const [completedSessionsList, setCompletedSessionsList] = useState<CompletedSessionRow[]>([]);
  const [feedbackList, setFeedbackList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Ghost Mode: tracks which user ID is currently in the 1-second confirmation flash


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

    // 2. Fetch Users (for Data Table) — ghost_mode is fetched here for admin only
    const { data: users } = await supabase
      .from("profiles")
      .select("id, display_name, role, created_at, ghost_mode")
      .order("created_at", { ascending: false })
      .limit(20);
    if (users) setUsersList(users);

    // 3. Fetch recent sessions globally, then keep conducted/live sessions.
    // This is more resilient across environments where status values may vary.
    const { data: sessions } = await supabase
      .from("live_sessions")
      .select("id, status, teacher_id, started_at, finished_at, quizzes(title)")
      .order("started_at", { ascending: false })
      .limit(200);

    if (sessions) {
      const sessionRows = sessions as CompletedSessionRow[];
      const conducted = sessionRows.filter((s) =>
        s.status === "active" ||
        s.status === "finished" ||
        s.status === "completed" ||
        !!s.started_at ||
        !!s.finished_at
      );

      const hostIds = Array.from(new Set(conducted.map((s) => s.teacher_id).filter(Boolean))) as string[];
      const hostMap = new Map<string, string>();

      if (hostIds.length > 0) {
        const { data: hosts } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", hostIds);

        (hosts || []).forEach((h: any) => {
          hostMap.set(h.id, h.display_name || "Unknown Host");
        });
      }

      const mapped = conducted.map((s) => ({
        ...s,
        host_name: (s.teacher_id && hostMap.get(s.teacher_id)) || "Unknown Host",
      }));

      setCompletedSessionsList(mapped);
    }
    
    // 4. Fetch Feedback
    const { data: feedbacks } = await supabase
      .from("feedback")
      .select("id, user_id, rating, message, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
      
    if (feedbacks) {
      // Fetch names for these users
      const uIds = Array.from(new Set(feedbacks.map(f => f.user_id).filter(Boolean))) as string[];
      const uMap = new Map<string, string>();
      
      if (uIds.length > 0) {
        const { data: fProfiles } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", uIds);
        
        fProfiles?.forEach(p => uMap.set(p.id, p.display_name || "Unknown"));
      }

      const mappedFeedbacks = feedbacks.map(f => ({
        ...f,
        display_name: f.user_id ? (uMap.get(f.user_id) || "Unknown User") : "Anonymous"
      }));
      
      setFeedbackList(mappedFeedbacks);
    }
    
    setLoading(false);
  };

  const deleteUser = async (id: string) => {
    if (!confirm("Are you sure you want to completely delete this user? This will cascade delete their quizzes and data.")) return;
    await supabase.from("profiles").delete().eq("id", id);
    setUsersList(prev => prev.filter(u => u.id !== id));
  };

  /** Deletes a live_session record (cascades to participants + responses via FK). */
  const deleteSession = async (id: string) => {
    if (!confirm("Delete this session? This will permanently remove it and all associated response data.")) return;
    await supabase.from('live_sessions').delete().eq('id', id);
    setCompletedSessionsList(prev => prev.filter(s => s.id !== id));
  };
  
  const deleteFeedback = async (id: string) => {
    if (!confirm("Delete this feedback?")) return;
    await supabase.from("feedback").delete().eq("id", id);
    setFeedbackList(prev => prev.filter(f => f.id !== id));
  };

  const forceEndSession = async (session: CompletedSessionRow) => {
    if (!(session.status === "active" || session.status === "waiting")) return;
    if (!confirm("Force end this session now?")) return;

    const completedAt = new Date().toISOString();
    const { error } = await supabase
      .from("live_sessions")
      .update({ status: "completed", finished_at: completedAt })
      .eq("id", session.id)
      .in("status", ["active", "waiting"]);

    if (error) {
      alert("Failed to force end session.");
      return;
    }

    setCompletedSessionsList((prev) =>
      prev.map((s) =>
        s.id === session.id
          ? { ...s, status: "completed", finished_at: completedAt }
          : s
      )
    );

    if (session.status === "active") {
      setStats((prev) => ({
        ...prev,
        activeSessions: Math.max(0, prev.activeSessions - 1),
      }));
    }
  };

  /**
   * VIP Ghost Mode: explicitly toggle the visibility of correct answers.
   */
  const toggleGhostMode = async (user: any) => {
    const newValue = !user.ghost_mode;
    const { error } = await supabase
      .from("profiles")
      .update({ ghost_mode: newValue })
      .eq("id", user.id);
    if (error) {
      alert("Failed to update ghost mode.");
      return;
    }
    // Update local state
    setUsersList((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, ghost_mode: newValue } : u))
    );
  };

  return (
    <div className="min-h-screen transition-colors p-4 sm:p-6 md:p-8">
      
      {/* Admin Navbar */}
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 bg-white dark:bg-slate-900/50 backdrop-blur-xl p-4 px-5 sm:px-6 rounded-2xl border border-slate-200/60 dark:border-slate-800/50 shadow-sm dark:shadow-[0_10px_40px_rgba(2,6,23,0.45)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20 shrink-0">
            <ShieldCheck className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Super Admin</h1>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Control Panel</p>
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
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
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-6 bg-white dark:bg-slate-900/50 backdrop-blur-xl rounded-3xl border border-slate-200/60 dark:border-slate-800/50 shadow-sm relative overflow-hidden group transition-all duration-300 hover:-translate-y-1 hover:shadow-md dark:hover:shadow-[0_0_20px_rgba(99,102,241,0.2)]">
            <div className="absolute top-0 right-0 -mr-4 -mt-4 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all duration-500" />
            <div className="flex items-center justify-between mb-4 relative z-10">
              <span className="text-slate-500 dark:text-slate-400 font-semibold tracking-wide text-sm">TOTAL USERS</span>
              <Users className="text-blue-500" size={24} />
            </div>
            <div className="text-4xl font-black text-slate-900 dark:text-white relative z-10">
              {loading ? <span className="animate-pulse bg-slate-200 dark:bg-slate-700 h-10 w-24 block rounded-lg" /> : stats.totalUsers}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="p-6 bg-white dark:bg-slate-900/50 backdrop-blur-xl rounded-3xl border border-slate-200/60 dark:border-slate-800/50 shadow-sm relative overflow-hidden group transition-all duration-300 hover:-translate-y-1 hover:shadow-md dark:hover:shadow-[0_0_20px_rgba(99,102,241,0.2)]">
            <div className="absolute top-0 right-0 -mr-4 -mt-4 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all duration-500" />
            <div className="flex items-center justify-between mb-4 relative z-10">
              <span className="text-slate-500 dark:text-slate-400 font-semibold tracking-wide text-sm">ACTIVE SESSIONS</span>
              <Activity className="text-emerald-500" size={24} />
            </div>
            <div className="text-4xl font-black text-slate-900 dark:text-white relative z-10">
              {loading ? <span className="animate-pulse bg-slate-200 dark:bg-slate-700 h-10 w-24 block rounded-lg" /> : stats.activeSessions}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="p-6 bg-white dark:bg-slate-900/50 backdrop-blur-xl rounded-3xl border border-slate-200/60 dark:border-slate-800/50 shadow-sm relative overflow-hidden group transition-all duration-300 hover:-translate-y-1 hover:shadow-md dark:hover:shadow-[0_0_20px_rgba(99,102,241,0.2)]">
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="bg-white dark:bg-slate-900/50 backdrop-blur-xl rounded-3xl border border-slate-200/60 dark:border-slate-800/50 shadow-sm overflow-hidden flex flex-col h-[500px]">
            <div className="p-5 sm:p-6 border-b border-gray-100 dark:border-white/5">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2"><Server size={20} className="text-indigo-500"/> User Management</h2>
            </div>
            <div className="flex-1 overflow-auto">
              <div className="w-full overflow-x-auto whitespace-nowrap">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur z-10 shadow-sm border-b border-slate-200/70 dark:border-white/5">
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
                        <div className="text-xs font-mono mt-1 w-32 truncate select-none text-slate-500" title={user.id}>
                          {user.id}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn("px-3 py-1 text-xs font-bold rounded-full border", 
                          user.role === 'admin' 
                            ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/50" 
                            : "bg-blue-100 text-blue-700 border-blue-200 dark:bg-slate-700/50 dark:text-slate-300 dark:border-slate-600"
                        )}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Ghost mode / VIP button */}
                          <button
                            onClick={() => void toggleGhostMode(user)}
                            disabled={user.role === 'admin'}
                            title={user.role === 'admin' ? 'Admin automatically has VIP' : user.ghost_mode ? 'Revoke VIP / Ghost' : 'Grant VIP / Ghost'}
                            className={cn(
                              "p-2 rounded-lg transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed",
                              user.ghost_mode
                                ? "text-emerald-400 hover:text-rose-400 hover:bg-rose-500/10 shadow-[0_0_10px_rgba(52,211,153,0.3)] bg-emerald-500/10 border border-emerald-500/20"
                                : "text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 border border-transparent"
                            )}
                          >
                            {user.ghost_mode ? <Eye size={18} /> : <EyeOff size={18} />}
                          </button>
                          {/* Delete button */}
                          <button
                            onClick={() => void deleteUser(user.id)}
                            disabled={user.role === 'admin'}
                            title={user.role === 'admin' ? 'Cannot delete admin' : 'Delete user'}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {user.role === 'admin' ? <Ban size={18} /> : <Trash2 size={18} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </motion.div>

          {/* Global Completed Sessions Table */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="bg-white dark:bg-slate-900/50 backdrop-blur-xl rounded-3xl border border-slate-200/60 dark:border-slate-800/50 shadow-sm overflow-hidden flex flex-col h-[500px]">
            <div className="p-5 sm:p-6 border-b border-gray-100 dark:border-white/5">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"><Activity size={20} className="text-emerald-500"/> Session Management</h2>
              <p className="text-xs mt-1 text-slate-500 dark:text-slate-400">Global live and completed sessions across the platform</p>
            </div>
            <div className="flex-1 overflow-auto">
              <div className="w-full overflow-x-auto whitespace-nowrap">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur z-10 shadow-sm border-b border-slate-200/70 dark:border-slate-800/60">
                  <tr>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Quiz Title</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Host Name</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Completed At</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/60">
                  {completedSessionsList.map((sess) => (
                    <tr key={sess.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[220px]">{sess.quizzes?.title || "Unknown Quiz"}</div>
                        <div className="text-[11px] text-slate-500 font-mono mt-1">{sess.id.slice(0, 8)}...</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-slate-700 dark:text-slate-200 font-medium">{sess.host_name || "Unknown Host"}</div>
                      </td>
                      <td className="px-6 py-4 text-sm uppercase">
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold border",
                          sess.status === "active"
                            ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30"
                            : sess.status === "waiting"
                            ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30"
                            : "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30"
                        )}>
                          {sess.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-300 text-sm">{sess.finished_at ? new Date(sess.finished_at).toLocaleString() : sess.started_at ? new Date(sess.started_at).toLocaleString() : "N/A"}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {(sess.status === "active" || sess.status === "waiting") && (
                            <button
                              onClick={() => void forceEndSession(sess)}
                              title="Force end session"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-500 hover:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg transition-colors"
                            >
                              <Slash size={14} /> Force End
                            </button>
                          )}
                          <Link
                            href={`/dashboard/reports/${sess.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg transition-colors"
                          >
                            <FileText size={14} /> View Report
                          </Link>
                          <button
                            onClick={() => void deleteSession(sess.id)}
                            title="Delete session"
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
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
            </div>
          </motion.div>

        </div>
        
        {/* Course Feedback Table */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="bg-white dark:bg-slate-900/50 backdrop-blur-xl rounded-3xl border border-slate-200/60 dark:border-slate-800/50 shadow-sm overflow-hidden flex flex-col mb-10">
          <div className="p-5 sm:p-6 border-b border-gray-100 dark:border-white/5">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"><MessageSquare size={20} className="text-pink-500"/> User Feedback</h2>
            <p className="text-xs mt-1 text-slate-500 dark:text-slate-400">Recent feedback submitted by students</p>
          </div>
          <div className="flex-1 overflow-auto max-h-[500px]">
            <div className="w-full overflow-x-auto whitespace-nowrap">
             <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur z-10 shadow-sm border-b border-slate-200/70 dark:border-slate-800/60">
                  <tr>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">User</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Rating</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-1/2">Feedback</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/60">
                  {feedbackList.map((f) => (
                    <tr key={f.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{f.display_name}</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">{f.id.slice(0, 8)}...</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 text-amber-500 font-bold">
                          {f.rating} / 5
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-700 dark:text-slate-300 text-sm">
                        <p className="line-clamp-3">{f.message}</p>
                      </td>
                      <td className="px-6 py-4 text-slate-400 text-sm">
                        {new Date(f.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                         <button
                            onClick={() => void deleteFeedback(f.id)}
                            title="Delete feedback"
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                      </td>
                    </tr>
                  ))}
                  {feedbackList.length === 0 && (
                     <tr>
                      <td colSpan={5} className="px-6 py-10 text-center text-slate-400 text-sm">
                        No feedback submitted yet.
                      </td>
                    </tr>
                  )}
                </tbody>
             </table>
             </div>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
