"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

export default function StudentJoin() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      router.push("/login?message=Please sign in to join a game");
      return;
    }

    // Try to get display name from profile first
    const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).single();
    
    // Fall back to Google OAuth metadata if profile doesn't exist yet
    const displayName = profile?.display_name 
      || user.user_metadata?.full_name 
      || user.email 
      || "Player";

    setName(displayName);
    setIsAuthenticated(true);
    setLoading(false);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // 1. Validate PIN
    const { data: session, error: sessionErr } = await supabase
      .from("live_sessions")
      .select("id, status")
      .eq("join_code", pin.toUpperCase())
      .single();

    if (sessionErr || !session) {
      setError("Invalid game PIN");
      setLoading(false);
      return;
    }

    if (session.status === "finished") {
      setError("This game has already finished");
      setLoading(false);
      return;
    }

    // 2. Register Participant with resilient device UUID
    let deviceUuid = localStorage.getItem("kahoot_device_uuid");
    if (!deviceUuid) {
      deviceUuid = crypto.randomUUID();
      localStorage.setItem("kahoot_device_uuid", deviceUuid);
    }

    const { data: participant, error: partErr } = await supabase
      .from("participants")
      .upsert({
        session_id: session.id,
        device_uuid: deviceUuid,
        display_name: name,
        last_active: new Date().toISOString()
      }, { onConflict: "session_id, device_uuid" })
      .select()
      .single();

    if (partErr) {
      setError("Could not join the session. Try again.");
      setLoading(false);
      return;
    }

    // 3. Navigate to waiting/play room
    router.push(`/play/${session.id}`);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-slate-900 transition-colors">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", bounce: 0.5 }}
        className="w-full max-w-md bg-white dark:bg-slate-800 rounded-[2rem] p-8 shadow-2xl shadow-indigo-500/10 dark:shadow-none border border-gray-100 dark:border-white/10"
      >
        {!isAuthenticated ? (
          <div className="flex flex-col items-center justify-center space-y-4 py-8">
            <Loader2 className="animate-spin text-indigo-500 w-12 h-12" />
            <p className="text-slate-500 font-medium animate-pulse">Verifying Account...</p>
          </div>
        ) : (
          <>
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 -mt-16 shadow-xl shadow-indigo-600/30 transform -rotate-3">
            <span className="text-white font-bold text-4xl">K</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">LevelNLearn</h1>
          <p className="text-slate-500 dark:text-slate-400">Join the live session</p>
        </div>

        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-sm text-center font-medium dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-400">
            {error}
          </motion.div>
        )}

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <input 
              type="text" value={pin} onChange={e => setPin(e.target.value.toUpperCase())} required
              maxLength={6} placeholder="Game PIN"
              className="w-full text-center text-3xl tracking-[0.2em] font-bold px-6 py-4 rounded-2xl bg-gray-50 dark:bg-slate-900 border-2 border-transparent focus:border-indigo-500 outline-none transition-all dark:text-white uppercase placeholder:text-gray-300 dark:placeholder:text-slate-700 placeholder:font-medium placeholder:tracking-normal"
            />
          </div>
          <div>
            <div className="w-full text-center text-xl font-semibold px-6 py-4 rounded-2xl bg-gray-100 dark:bg-slate-900/50 border-2 border-transparent text-slate-500 dark:text-slate-400">
              Playing as: <span className="text-indigo-600 dark:text-indigo-400">{name}</span>
            </div>
          </div>
          <motion.button 
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={loading}
            type="submit"
            className="w-full py-4 bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-2xl font-bold text-xl shadow-xl shadow-slate-900/20 dark:shadow-indigo-600/30 transition-all flex justify-center items-center gap-2 mt-4"
          >
            {loading ? <Loader2 className="animate-spin" /> : "Enter"}
          </motion.button>
        </form>
        </>
        )}
      </motion.div>
    </div>
  );
}
