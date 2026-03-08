"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Send, ArrowLeft, CheckCircle } from "lucide-react";
import Link from "next/link";

export default function FeedbackPage() {
  const router = useRouter();
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [user, setUser] = useState<any>(null);
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUser(session.user);
    });
  }, []);

  const handleSubmit = async () => {
    if (rating === 0 || !feedback.trim()) return;
    setSubmitting(true);
    await supabase.from("feedback").insert([{
      user_id: user?.id ?? null,
      rating,
      message: feedback.trim(),
    }]);
    setSubmitting(false);
    setSubmitted(true);
  };

  const displayRating = hoveredRating || rating;
  const ratingLabels = ["", "Poor", "Fair", "Good", "Great", "Excellent!"];

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-8 group">
        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
        Back to Dashboard
      </Link>

      <div className="bg-white dark:bg-slate-800 rounded-[2rem] shadow-xl shadow-slate-200/40 dark:shadow-none border border-gray-100 dark:border-white/5 overflow-hidden">
        <div className="p-8">
          <AnimatePresence mode="wait">
            {submitted ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-10"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", bounce: 0.5, delay: 0.1 }}
                >
                  <CheckCircle className="mx-auto text-emerald-500 mb-5" size={64} />
                </motion.div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Thank you!</h2>
                <p className="text-slate-500 dark:text-slate-400">Your feedback helps us improve the platform.</p>
                <Link href="/dashboard" className="mt-8 inline-block px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-600/20 transition-all">
                  Back to Dashboard
                </Link>
              </motion.div>
            ) : (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-1">Share your feedback</h1>
                <p className="text-slate-500 dark:text-slate-400 mb-8">Tell us about your experience with LevelNLearn.</p>

                {/* Stars */}
                <div className="mb-8">
                  <label className="block text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3">
                    Overall Rating
                  </label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <motion.button
                        key={star}
                        whileHover={{ scale: 1.2 }}
                        whileTap={{ scale: 0.9 }}
                        onMouseEnter={() => setHoveredRating(star)}
                        onMouseLeave={() => setHoveredRating(0)}
                        onClick={() => setRating(star)}
                        className="transition-colors"
                      >
                        <Star
                          size={36}
                          className={star <= displayRating ? "text-amber-400 fill-amber-400" : "text-slate-300 dark:text-slate-600"}
                        />
                      </motion.button>
                    ))}
                    <AnimatePresence>
                      {displayRating > 0 && (
                        <motion.span
                          key={displayRating}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0 }}
                          className="ml-3 text-sm font-bold text-amber-500"
                        >
                          {ratingLabels[displayRating]}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Text area */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2">
                    Your thoughts
                  </label>
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    rows={5}
                    placeholder="What did you love? What could be better?"
                    className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-white/10 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all dark:text-white resize-none"
                  />
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSubmit}
                  disabled={submitting || rating === 0 || !feedback.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold shadow-lg shadow-indigo-600/20 transition-all"
                >
                  {submitting ? "Sending…" : <><Send size={18} /> Submit Feedback</>}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
