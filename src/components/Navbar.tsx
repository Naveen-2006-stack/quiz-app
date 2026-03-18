"use client";

import { useEffect, useState, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import {
  LogOut, Settings, MonitorPlay, Sun, Moon, MessageSquare,
  LayoutDashboard, X, Menu, Plus,
} from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, resolvedTheme, setTheme } = useTheme();

  const [profile, setProfile] = useState<{ display_name: string; role?: string; avatar_url?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [authUser, setAuthUser] = useState<any>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const [supabase] = useState(() => createSupabaseBrowserClient());
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSessionChange(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSessionChange(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Close mobile menu on outside click
  useEffect(() => {
    if (!mobileOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [mobileOpen]);

  const handleSessionChange = async (user: any) => {
    try {
      setAuthUser(user);
      if (!user) { setProfile(null); setLoading(false); return; }
      const { data } = await supabase.from("profiles").select("display_name, role, avatar_url").eq("id", user.id).maybeSingle();
      setProfile({
        display_name: data?.display_name || user.user_metadata?.full_name || user.email || "User",
        role: data?.role || "student",
        avatar_url: data?.avatar_url || user.user_metadata?.avatar_url,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setShowLogoutModal(false);
    router.push("/login");
  };

  const handleToggleTheme = () => {
    const activeTheme = resolvedTheme ?? theme;
    setTheme(activeTheme === "dark" ? "light" : "dark");
  };

  const hiddenPaths = ["/", "/login"];
  if (hiddenPaths.includes(pathname)) return null;

  const avatarUrl = profile?.avatar_url;
  const initials = profile?.display_name
    ? profile.display_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <>
      <nav
        ref={mobileMenuRef}
        className="sticky top-3 z-50 mx-3 sm:mx-4 rounded-2xl bg-white/80 dark:bg-slate-900/50 backdrop-blur-xl border border-slate-200/70 dark:border-slate-800/50 shadow-sm dark:shadow-[0_10px_40px_rgba(2,6,23,0.45)] transition-colors"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">

            {/* Logo */}
            <Link href="/dashboard" className="flex items-center gap-2 group">
              <Image
                src="/logo.png"
                alt="LevelNLearn logo"
                width={32}
                height={32}
                className="w-8 h-8 object-contain dark:invert transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3"
              />
              <span className="text-xl font-bold text-slate-900 dark:text-white transition-all duration-300 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-indigo-400 group-hover:to-cyan-400">
                LevelNLearn
              </span>
            </Link>

            {/* Desktop Nav links (hidden on mobile) */}
            <div className="flex items-center gap-6">
              {!loading && profile && (
                <div className="hidden md:flex items-center gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <Link href="/join" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-emerald-600 dark:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors">
                    <MonitorPlay size={16} /> Join Game
                  </Link>
                  <Link href="/dashboard" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-700 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors">
                    <LayoutDashboard size={16} /> Dashboard
                  </Link>
                  <Link href="/feedback" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-700 hover:text-violet-600 dark:text-slate-300 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors">
                    <MessageSquare size={16} /> Feedback
                  </Link>
                  {profile.role === "admin" && (
                    <Link href="/admin-dashboard" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 transition-colors">
                      <Settings size={14} /> Admin
                    </Link>
                  )}
                </div>
              )}

              {/* Right section: theme + profile + hamburger */}
              <div className="flex items-center gap-2 sm:gap-3 pl-3 sm:pl-4 border-l border-slate-200 dark:border-white/10">
                {/* Theme toggle — always visible */}
                {mounted ? (
                  <button
                    onClick={handleToggleTheme}
                    className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors rounded-full"
                    title="Toggle Theme"
                    aria-label="Toggle Theme"
                  >
                    {resolvedTheme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                  </button>
                ) : (
                  <button type="button" disabled aria-hidden="true" className="p-2 text-slate-400 transition-colors rounded-full">
                    <div className="w-[18px] h-[18px]" />
                  </button>
                )}

                {!loading && authUser && (
                  <>
                    {/* Avatar/name — visible on all sizes */}
                    <Link href="/profile" className="flex items-center gap-2 group">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="avatar" className="w-8 h-8 rounded-full object-cover ring-2 ring-transparent group-hover:ring-indigo-400 transition-all" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-violet-600 flex items-center justify-center text-white text-xs font-black ring-2 ring-transparent group-hover:ring-indigo-400 transition-all">
                          {initials}
                        </div>
                      )}
                      <div className="flex-col text-right hidden sm:flex">
                        <span className="text-sm font-bold text-slate-900 dark:text-white leading-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {profile?.display_name || authUser.email}
                        </span>
                      </div>
                    </Link>

                    {/* Logout — hidden on mobile (accessible via menu) */}
                    <button
                      onClick={() => setShowLogoutModal(true)}
                      className="hidden md:flex p-2 text-slate-400 hover:text-rose-500 transition-colors rounded-full"
                      title="Logout"
                    >
                      <LogOut size={20} />
                    </button>
                  </>
                )}

                {/* Hamburger button — visible only on mobile */}
                <button
                  onClick={() => setMobileOpen((v) => !v)}
                  className="md:hidden p-2 text-slate-500 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                  aria-label="Open menu"
                >
                  {mobileOpen ? <X size={22} /> : <Menu size={22} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Mobile Dropdown Menu ── */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: "easeInOut" }}
              className="overflow-hidden md:hidden"
            >
              <div className="mx-3 mb-3 rounded-xl bg-white/90 dark:bg-slate-950/90 backdrop-blur-lg border border-slate-200/70 dark:border-slate-700/50 shadow-lg overflow-hidden">
                {!loading && profile && (
                  <div className="p-3 space-y-1">
                    <Link
                      href="/join"
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-emerald-600 dark:text-emerald-400 font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                    >
                      <MonitorPlay size={18} /> Join Game
                    </Link>
                    <Link
                      href="/dashboard"
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 dark:text-slate-200 font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                    >
                      <LayoutDashboard size={18} /> Dashboard
                    </Link>
                    <Link
                      href="/feedback"
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 dark:text-slate-200 font-semibold hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
                    >
                      <MessageSquare size={18} /> Feedback
                    </Link>
                    {profile.role === "admin" && (
                      <Link
                        href="/admin-dashboard"
                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-amber-600 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 transition-colors"
                      >
                        <Settings size={18} /> Admin Panel
                      </Link>
                    )}
                  </div>
                )}

                {/* Divider + Logout */}
                {!loading && authUser && (
                  <div className="border-t border-slate-200/70 dark:border-slate-700/50 p-3">
                    <button
                      onClick={() => { setMobileOpen(false); setShowLogoutModal(true); }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-rose-500 dark:text-rose-400 font-semibold hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                    >
                      <LogOut size={18} /> Sign Out
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ── Logout Confirmation Modal ── */}
      <AnimatePresence>
        {showLogoutModal && (
          <motion.div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setShowLogoutModal(false)}
            />
            {/* Dialog */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", bounce: 0.3 }}
              className="relative z-10 bg-white dark:bg-slate-800 rounded-[2rem] shadow-2xl p-8 w-full max-w-sm border border-gray-100 dark:border-white/10"
            >
              <button
                onClick={() => setShowLogoutModal(false)}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl transition-colors"
              >
                <X size={18} />
              </button>

              <div className="text-4xl mb-4 text-center">👋</div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white text-center mb-2">Logging out?</h2>
              <p className="text-slate-500 dark:text-slate-400 text-center mb-7">
                You'll need to sign in again to access your dashboard.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowLogoutModal(false)}
                  className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-white/10 text-slate-700 dark:text-slate-300 font-semibold hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 py-3 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold shadow-lg shadow-rose-500/30 transition-all"
                >
                  Yes, Log Out
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
