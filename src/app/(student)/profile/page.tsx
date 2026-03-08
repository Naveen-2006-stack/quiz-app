"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Save, ArrowLeft, User, Mail, Camera } from "lucide-react";
import Link from "next/link";

export default function ProfilePage() {
  const router = useRouter();
  const [supabase] = useState(() => createSupabaseBrowserClient());

  const [user, setUser] = useState<any>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) { router.push("/login"); return; }
      setUser(session.user);
      setEmail(session.user.email ?? "");
      fetchProfile(session.user.id, session.user);
    });
  }, []);

  const fetchProfile = async (userId: string, authUser: any) => {
    const { data } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle();
    setDisplayName(data?.display_name || authUser.user_metadata?.full_name || "");
    setLoading(false);
  };

  const handleSave = async () => {
    if (!user || !displayName.trim()) return;
    setSaving(true);
    await supabase.from("profiles").update({ display_name: displayName.trim() }).eq("id", user.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const avatarUrl = user?.user_metadata?.avatar_url;
  const initials = displayName ? displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase() : "?";

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      {/* Back */}
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-8 group">
        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
        Back to Dashboard
      </Link>

      <div className="bg-white dark:bg-slate-800 rounded-[2rem] shadow-xl shadow-slate-200/40 dark:shadow-none border border-gray-100 dark:border-white/5 overflow-hidden">
        {/* Header gradient */}
        <div className="h-28 bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600" />

        {/* Avatar */}
        <div className="px-8 pb-8">
          <div className="relative -mt-14 mb-6 w-24 h-24">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-24 h-24 rounded-2xl object-cover ring-4 ring-white dark:ring-slate-800 shadow-xl" />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-400 to-violet-600 flex items-center justify-center text-white text-3xl font-black ring-4 ring-white dark:ring-slate-800 shadow-xl">
                {initials}
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-600 flex items-center justify-center">
              <Camera size={14} className="text-slate-500 dark:text-slate-300" />
            </div>
          </div>

          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-10 bg-slate-100 dark:bg-slate-700 rounded-xl" />
              <div className="h-10 bg-slate-100 dark:bg-slate-700 rounded-xl" />
            </div>
          ) : (
            <div className="space-y-5">
              {/* Display Name */}
              <div>
                <label className="block text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2">
                  <User size={14} className="inline mr-1.5" />Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name..."
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-white/10 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all dark:text-white font-medium"
                />
              </div>

              {/* Email (read-only) */}
              <div>
                <label className="block text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2">
                  <Mail size={14} className="inline mr-1.5" />Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  readOnly
                  className="w-full px-4 py-3 rounded-xl bg-gray-100 dark:bg-slate-900/50 border border-gray-200 dark:border-white/5 text-slate-500 dark:text-slate-500 font-medium cursor-not-allowed outline-none"
                />
                <p className="text-xs text-slate-400 mt-1.5">Email is managed by Google and cannot be changed here.</p>
              </div>

              {/* Save button */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSave}
                disabled={saving || !displayName.trim()}
                className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-base shadow-lg shadow-indigo-600/20 transition-all"
              >
                {saving ? "Saving…" : saved ? "✓ Saved!" : "Save Changes"}
              </motion.button>

              <AnimatePresence>
                {saved && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-center text-sm font-semibold text-emerald-500"
                  >
                    Your profile has been updated!
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
