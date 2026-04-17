"use client";

import { Suspense, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

function LoginPageContent() {
  const [error, setError] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError("");

    const requestedNext = searchParams.get("next") ?? "/dashboard";
    const safeNext = requestedNext.startsWith("/") ? requestedNext : "/dashboard";
    const callbackParams = new URLSearchParams({ next: safeNext });

    // Use the origin from window so it supports localhost in dev and Vercel branch URLs in prod
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?${callbackParams.toString()}`,
        queryParams: {
          prompt: "select_account",
        },
      },
    });
    
    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 transition-colors flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background aesthetics */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-violet-500/10 blur-[100px] rounded-full pointer-events-none" />

      <Link href="/" className="absolute top-8 left-8 flex items-center gap-2 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium transition-colors z-10">
        <ArrowLeft size={20} /> Back to standard join
      </Link>

      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}
        className="w-full max-w-md bg-white/70 dark:bg-slate-900/50 backdrop-blur-xl rounded-[2rem] p-8 shadow-2xl shadow-indigo-600/10 dark:shadow-[0_20px_60px_rgba(2,6,23,0.5)] border border-white/20 dark:border-slate-800/50 relative z-10"
      >
        <div className="text-center mb-10">
          <div className="flex justify-center mb-6">
            <Link href="/" className="group inline-flex items-center justify-center gap-3">
              <Image
                src="/logo.png"
                alt="LevelNLearn logo"
                width={40}
                height={40}
                className="w-10 h-10 object-contain dark:invert transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3"
              />
              <span className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white transition-all duration-300 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-indigo-400 group-hover:to-cyan-400">
                LevelNLearn
              </span>
            </Link>
          </div>
        </div>

        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 rounded-xl mb-6 text-sm font-semibold flex items-center justify-center text-center">
            {error}
          </motion.div>
        )}

        <div className="space-y-6">
          <motion.button 
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={googleLoading}
            onClick={handleGoogleLogin}
            className="w-full py-4 px-6 bg-white dark:bg-slate-700 text-slate-700 dark:text-white border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-slate-600 hover:border-indigo-200 dark:hover:border-indigo-500/30 rounded-2xl font-bold text-lg shadow-md dark:shadow-none transition-all flex items-center justify-center gap-4 disabled:opacity-50"
          >
            {googleLoading ? <Loader2 className="animate-spin text-slate-500 dark:text-slate-300 w-6 h-6" /> : (
              <svg className="w-6 h-6" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            Sign in with Google
          </motion.button>

          <div className="flex justify-center mt-8">
            <button
              type="button"
              className="group inline-flex items-center justify-center gap-2 rounded-full border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-900/40 px-4 py-1.5 text-xs font-black tracking-[0.18em] uppercase text-slate-500 dark:text-slate-400 transition-all duration-300 hover:border-slate-300 dark:hover:border-slate-500 hover:text-slate-700 dark:hover:text-white"
              aria-label="BY SCRIPTARC"
            >
              <Image
                src="/scriptarc-logo.jpeg"
                alt="scriptArc logo"
                width={16}
                height={16}
                className="w-4 h-4 shrink-0 rounded-sm object-cover transition-all duration-300 group-hover:-translate-y-0.5"
              />
              <span className="transition-all duration-300">BY SCRIPTARC</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function LoginPageFallback() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 transition-colors flex items-center justify-center">
      <Loader2 className="animate-spin text-indigo-500 w-10 h-10" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}
