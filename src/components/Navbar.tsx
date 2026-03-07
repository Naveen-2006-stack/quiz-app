"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import { LogOut, Plus, BookOpen, Clock, Settings, Users, MonitorPlay, Sun, Moon } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import Image from "next/image";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [profile, setProfile] = useState<{ display_name: string; role?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [authUser, setAuthUser] = useState<any>(null);
  
  // Create a memoized, safe instance of the browser client for this component
  const [supabase] = useState(() => createSupabaseBrowserClient());

  useEffect(() => {
    setMounted(true);

    // Get session immediately from localStorage (no server round-trip)
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSessionChange(session?.user ?? null);
    });

    // Subscribe to auth state changes (fires on OAuth redirect, sign-in, sign-out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSessionChange(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSessionChange = async (user: any) => {
    try {
      setAuthUser(user);
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }
      // Use maybeSingle() not single() — single() throws PGRST116 when no row exists
      const { data } = await supabase.from("profiles").select("display_name, role").eq("id", user.id).maybeSingle();

      setProfile({
        display_name: data?.display_name || user.user_metadata?.full_name || user.email || 'User',
        role: data?.role || 'student'
      });
    } catch (err) {
      console.error("Navbar auth check failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  // If it's a public route and they are NOT logged in, we render a simpler version or just don't render this heavy navbar
  // Wait, the landing page already has its own navbar. Let's return null if we are exactly on "/" to preserve the landing page look.
  if (pathname === "/") return null;
  // If we are on /login, maybe return null too
  if (pathname === "/login") return null;

  return (
    <nav className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-gray-100 dark:border-white/10 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          
          {/* Logo Section */}
          <Link href={profile?.role === 'student' ? "/dashboard" : "/teacher-dashboard"} className="flex items-center gap-2 group">
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
          
          {/* Navigation Links based on Role */}
          <div className="flex items-center gap-6">
            {!loading && profile && (
              <div className="hidden md:flex items-center gap-4 text-sm font-medium text-slate-600 dark:text-slate-300">
                
                {profile.role !== 'teacher' && (
                  <Link href="/join" className="flex items-center gap-1 text-emerald-600 dark:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 px-3 py-1.5 rounded-lg transition-colors">
                    <MonitorPlay size={16} /> Join Game
                  </Link>
                )}

                {/* Student Specific */}
                {(profile.role === 'student') && (
                  <Link href="/dashboard" className="flex items-center gap-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                    <Clock size={16} /> My Dashboard
                  </Link>
                )}

                {/* Teacher Specific */}
                {profile.role === 'teacher' && (
                  <>
                    <Link href="/teacher-dashboard" className="flex items-center gap-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                      <BookOpen size={16} /> Teacher Dashboard
                    </Link>
                    <Link href="/teacher-dashboard" className="flex items-center gap-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                       <Plus size={16} /> Create Quiz
                    </Link>
                  </  >
                )}

                {/* Admin Specific */}
                {profile.role === 'admin' && (
                  <Link href="/admin-dashboard" className="flex items-center gap-1 text-amber-600 dark:text-amber-500 hover:text-amber-700 bg-amber-50 dark:bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-500/20 transition-colors">
                    <Settings size={14} /> Admin Dashboard
                  </Link>
                )}
              </div>
            )}

            {/* Profile & Controls */}
            <div className="flex items-center gap-4 pl-4 border-l border-gray-200 dark:border-white/10">
              {/* Theme Toggle */}
              <button 
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")} 
                className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors rounded-full"
                title="Toggle Theme"
              >
                {mounted ? (theme === "dark" ? <Sun size={18} /> : <Moon size={18} />) : <div className="w-[18px] h-[18px]" />}
              </button>

              {!loading && authUser && (
                <>
                  <div className="flex flex-col text-right">
                    <span className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                      {profile?.display_name || authUser.user_metadata?.full_name || authUser.email || 'User'}
                    </span>
                    <span className="text-xs font-medium text-slate-500 capitalize leading-tight">
                      {profile?.role || 'student'}
                    </span>
                  </div>
                  <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-rose-500 transition-colors" title="Logout">
                    <LogOut size={20} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
