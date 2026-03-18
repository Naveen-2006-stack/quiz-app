"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, User, Mail } from "lucide-react";
import Link from "next/link";

const avatarSeeds = ["Felix", "Aneka", "Oliver", "Zoe", "Leo", "Mia", "Max", "Lily"];

const getAvatarUrl = (seed: string) =>
  `https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}&backgroundColor=c0aede,b6e3f4`;

export default function ProfilePage() {
  const router = useRouter();
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [supabase] = useState(() => createSupabaseBrowserClient());

  const [user, setUser] = useState<any>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedAvatar, setSelectedAvatar] = useState<string>(getAvatarUrl(avatarSeeds[0]));

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setIsSetupMode(params.get("setup") === "avatar");
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) { router.push("/login"); return; }
      setUser(session.user);
      setEmail(session.user.email ?? "");
      fetchProfile(session.user.id, session.user);
    });
  }, []);

  const fetchProfile = async (userId: string, authUser: any) => {
    const { data } = await supabase.from("profiles").select("display_name, avatar_url").eq("id", userId).maybeSingle();
    const fallbackName = authUser.email?.split("@")[0] || "User";
    setDisplayName(data?.display_name || fallbackName);
    setSelectedAvatar(data?.avatar_url || getAvatarUrl(avatarSeeds[0]));
    setLoading(false);
  };

  const handleSave = async () => {
    if (!user || !displayName.trim()) return;
    setSaving(true);
    await supabase
      .from("profiles")
      .upsert({ id: user.id, display_name: displayName.trim(), avatar_url: selectedAvatar }, { onConflict: "id" });
    setSaving(false);
    setSaved(true);
    if (isSetupMode) {
      router.push("/dashboard");
      return;
    }
    setTimeout(() => setSaved(false), 2500);
  };

  const avatarUrl = selectedAvatar;
  const initials = displayName ? displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase() : "?";

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      {/* Back */}
      {!isSetupMode && (
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-8 group">
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          Back to Dashboard
        </Link>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-[2rem] shadow-xl shadow-slate-200/40 dark:shadow-none border border-gray-100 dark:border-white/5 overflow-hidden">
        {/* Header gradient */}
        <div className="h-28 bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600" />

        {/* Avatar */}
        <div className="px-8 pb-8">
          {isSetupMode && (
            <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
              Welcome! Choose your avatar to continue.
            </div>
          )}
          <div className="-mt-14 mb-6 w-24 h-24">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-24 h-24 rounded-2xl object-cover ring-4 ring-white dark:ring-slate-800 shadow-xl" />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-400 to-violet-600 flex items-center justify-center text-white text-3xl font-black ring-4 ring-white dark:ring-slate-800 shadow-xl">
                {initials}
              </div>
            )}
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

              {/* Avatar Selector */}
              <div>
                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3">Choose Your Avatar</h3>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                  {avatarSeeds.map((seed) => {
                    const avatarOptionUrl = getAvatarUrl(seed);
                    const isSelected = selectedAvatar === avatarOptionUrl;

                    return (
                      <button
                        key={seed}
                        type="button"
                        onClick={() => setSelectedAvatar(avatarOptionUrl)}
                        className={`rounded-xl transition-transform hover:scale-110 focus:outline-none ${
                          isSelected
                            ? "ring-4 ring-indigo-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-800"
                            : "ring-2 ring-transparent"
                        }`}
                        title={`Select ${seed}`}
                      >
                        <img
                          src={avatarOptionUrl}
                          alt={`${seed} avatar`}
                          className="w-full aspect-square rounded-xl object-cover border border-slate-200 dark:border-slate-700 bg-white"
                        />
                      </button>
                    );
                  })}
                </div>
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
