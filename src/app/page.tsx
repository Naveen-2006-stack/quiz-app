"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Play, Users, Zap, ShieldCheck } from "lucide-react";
import Image from "next/image";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 transition-colors overflow-hidden relative">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-emerald-500/20 blur-[120px] rounded-full pointer-events-none" />

      {/* Navbar */}
      <nav className="relative z-10 max-w-7xl mx-auto px-6 py-6 flex justify-between items-center">
        <Link href="/" className="group flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="LevelNLearn logo"
            width={40}
            height={40}
            className="w-10 h-10 object-contain dark:invert transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3"
          />
          <span className="text-2xl font-black tracking-tight text-slate-900 dark:text-white transition-all duration-300 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-indigo-400 group-hover:to-cyan-400">
            LevelNLearn
          </span>
        </Link>
        <div className="flex gap-4">
          <Link href="/login" className="text-slate-600 dark:text-slate-300 font-semibold hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors px-4 py-2">
            Sign In with Google
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-32 flex flex-col items-center text-center">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, type: 'spring' }} className="mb-6">
          <span className="px-4 py-2 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 font-bold tracking-wide text-sm border border-indigo-200 dark:border-indigo-500/20">
            v1.0 Real-time Engine Live
          </span>
        </motion.div>

        <motion.h1 initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="text-6xl md:text-8xl font-black text-slate-900 dark:text-white mb-8 tracking-tighter leading-tight max-w-4xl">
          Engage <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-violet-500">students</span> in real-time.
        </motion.h1>

        <motion.p initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="text-xl md:text-2xl text-slate-500 dark:text-slate-400 mb-12 max-w-2xl font-medium leading-relaxed">
          Create interactive quizzes, host live lobbies, and track performance with advanced gamification.
        </motion.p>

        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto justify-center">
          <Link href="/join">
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="w-full sm:w-auto px-8 py-5 rounded-2xl bg-indigo-600 text-white font-bold text-xl flex items-center justify-center gap-3 shadow-2xl shadow-indigo-600/30 group">
              Join a Game
              <ArrowRight className="group-hover:translate-x-1 transition-transform" />
            </motion.button>
          </Link>
          <Link href="/login">
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="w-full sm:w-auto px-8 py-5 rounded-2xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-xl flex items-center justify-center gap-3 shadow-xl border border-gray-100 dark:border-white/10 hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-all">
              Sign In
            </motion.button>
          </Link>
        </motion.div>

        {/* Feature Grid */}
        <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }} className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-32 text-left w-full">
          <div className="bg-white/50 dark:bg-slate-800/50 p-8 rounded-3xl border border-gray-100 dark:border-white/10 backdrop-blur-sm">
            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl flex items-center justify-center mb-6"><Zap size={24} /></div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Live Real-time Play</h3>
            <p className="text-slate-500 dark:text-slate-400">Powered by Supabase WebSockets. Broadcast questions to thousands of students instantly.</p>
          </div>
          <div className="bg-white/50 dark:bg-slate-800/50 p-8 rounded-3xl border border-gray-100 dark:border-white/10 backdrop-blur-sm">
            <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center mb-6"><ShieldCheck size={24} /></div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Anti-Cheat Engine</h3>
            <p className="text-slate-500 dark:text-slate-400">Page visibility tracking. Instantly flag students who switch tabs during the live session.</p>
          </div>
          <div className="bg-white/50 dark:bg-slate-800/50 p-8 rounded-3xl border border-gray-100 dark:border-white/10 backdrop-blur-sm">
            <div className="w-12 h-12 bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl flex items-center justify-center mb-6"><Play size={24} /></div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Gamification</h3>
            <p className="text-slate-500 dark:text-slate-400">Time-decay scoring algorithms and consecutive answer streak multipliers built-in.</p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
