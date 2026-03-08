"use client";

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle } from 'lucide-react';

const OPTION_COLORS = [
  { bg: 'bg-rose-500',    hover: 'hover:bg-rose-600',   border: 'border-rose-400',    text: 'text-white', label: 'bg-rose-600'   },
  { bg: 'bg-blue-500',    hover: 'hover:bg-blue-600',   border: 'border-blue-400',    text: 'text-white', label: 'bg-blue-600'   },
  { bg: 'bg-amber-500',   hover: 'hover:bg-amber-600',  border: 'border-amber-400',   text: 'text-white', label: 'bg-amber-600'  },
  { bg: 'bg-emerald-500', hover: 'hover:bg-emerald-600',border: 'border-emerald-400', text: 'text-white', label: 'bg-emerald-600'},
];

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

interface ActiveQuestionCardProps {
  question: string;
  questionType?: 'mcq' | 'true_false';
  options: { text: string; is_correct: boolean }[];
  streak: number;
  timeLimit: number; // seconds
  isRevealed: boolean;
  onAnswer: (index: number, reactionTimeMs: number) => Promise<void> | void;
  /** Ghost Mode: when true, the correct answer button gets the secret micro-tell dot */
  isGhostMode?: boolean;
}

export const ActiveQuestionCard = ({
  question,
  questionType = 'mcq',
  options,
  streak,
  timeLimit,
  isRevealed,
  onAnswer,
  isGhostMode = false,
}: ActiveQuestionCardProps) => {
  const [timeLeft, setTimeLeft] = useState(timeLimit);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null); // highlighted but not yet submitted
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const startTimeRef = useRef(Date.now());

  // Reset state when the question changes
  useEffect(() => {
    setTimeLeft(timeLimit);
    setSelectedIndex(null);
    setHasSubmitted(false);
    setSubmitting(false);
    startTimeRef.current = Date.now();
  }, [question, timeLimit]);

  // Countdown timer
  useEffect(() => {
    if (hasSubmitted) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Auto-submit with -1 (time out) if nothing chosen
          if (!hasSubmitted) handleConfirmSubmit(-1, true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [hasSubmitted]);

  // If teacher reveals answer before student submits
  useEffect(() => {
    if (isRevealed && !hasSubmitted) {
      setHasSubmitted(true);
    }
  }, [isRevealed, hasSubmitted]);

  const handleConfirmSubmit = async (overrideIdx?: number, timedOut?: boolean) => {
    const idx = overrideIdx !== undefined ? overrideIdx : selectedIndex;
    if (idx === null || hasSubmitted || submitting) return;
    setSubmitting(true);
    setHasSubmitted(true);
    const reactionMs = Date.now() - startTimeRef.current;
    await onAnswer(idx, reactionMs);
    setSubmitting(false);
  };

  const didAnswerCorrectly =
    hasSubmitted && selectedIndex !== null && selectedIndex >= 0
      ? !!options[selectedIndex]?.is_correct
      : false;
  const showReveal = isRevealed && hasSubmitted;
  const isTrueFalse = questionType === 'true_false';
  const timeFraction = timeLeft / timeLimit;
  const timerColor =
    timeFraction > 0.5 ? 'bg-emerald-500' : timeFraction > 0.25 ? 'bg-amber-500' : 'bg-rose-500';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="w-full max-w-2xl mx-auto rounded-[2.5rem] overflow-hidden bg-white shadow-2xl shadow-indigo-900/10 border border-indigo-50/50 dark:bg-slate-800 dark:shadow-none dark:border-white/5"
    >
      {/* Progress bar */}
      <div className="h-1.5 bg-gray-100 dark:bg-slate-700">
        <motion.div
          className={cn('h-full transition-colors duration-300', timerColor)}
          animate={{ width: `${timeFraction * 100}%` }}
          transition={{ duration: 1, ease: 'linear' }}
        />
      </div>

      <div className="p-6 lg:p-10">
        {/* Timer + Streak header */}
        <div className="flex justify-between items-center mb-8">
          <motion.div
            animate={{ scale: timeLeft <= 5 && timeLeft > 0 ? [1, 1.15, 1] : 1 }}
            transition={{ repeat: timeLeft <= 5 && timeLeft > 0 ? Infinity : 0, duration: 0.8 }}
            className={cn(
              'text-3xl font-black font-mono tracking-tighter px-4 py-2 rounded-2xl',
              timeLeft <= 5
                ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400'
                : 'bg-gray-100 text-slate-800 dark:bg-slate-900/50 dark:text-gray-200'
            )}
          >
            {Math.max(0, timeLeft).toString().padStart(2, '0')}s
          </motion.div>

          <AnimatePresence>
            {streak >= 2 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="flex items-center space-x-2 px-4 py-2 rounded-full bg-amber-100/50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20"
              >
                <span className="text-xl">🔥</span>
                <span className="text-amber-600 dark:text-amber-400 font-extrabold text-lg tracking-tight">
                  {streak}x
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Question text */}
        <h2 className="text-2xl lg:text-3xl font-extrabold text-slate-900 dark:text-white mb-8 leading-tight tracking-tight">
          {question}
        </h2>

        <AnimatePresence mode="wait">
          {/* REVEAL STATE */}
          {showReveal ? (
            <motion.div
              key="reveal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className={cn(
                'rounded-[2rem] p-12 text-center',
                didAnswerCorrectly ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
              )}
            >
              <div className="text-5xl mb-3">{didAnswerCorrectly ? '✅' : '❌'}</div>
              <h3 className="text-4xl font-black tracking-tight mb-2">
                {didAnswerCorrectly ? 'Correct!' : 'Incorrect!'}
              </h3>
              <p className="text-white/80">Waiting for next question...</p>
            </motion.div>

          /* SUBMITTED — WAITING STATE */
          ) : hasSubmitted ? (
            <motion.div
              key="waiting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-[2rem] border-2 border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/50 dark:bg-indigo-500/5 p-10 text-center"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                className="mx-auto mb-5 h-14 w-14 rounded-full border-4 border-indigo-200 border-t-indigo-600 dark:border-indigo-700 dark:border-t-indigo-400"
              />
              <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-1">
                {selectedIndex !== null && selectedIndex >= 0
                  ? `You picked: ${options[selectedIndex]?.text}`
                  : "Time's up!"}
              </h3>
              <p className="text-slate-500 dark:text-slate-400">Waiting for reveal...</p>
            </motion.div>

          /* ANSWER GRID — Select then Confirm */
          ) : (
            <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className={cn('mb-5', isTrueFalse ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : 'grid grid-cols-1 md:grid-cols-2 gap-3 lg:gap-4')}>
                {options.map((opt, idx) => {
                  const color = isTrueFalse
                    ? (opt.text.toLowerCase() === 'false'
                        ? { bg: 'bg-rose-500', hover: 'hover:bg-rose-600', border: 'border-rose-400', text: 'text-white', label: 'bg-rose-600' }
                        : { bg: 'bg-blue-500', hover: 'hover:bg-blue-600', border: 'border-blue-400', text: 'text-white', label: 'bg-blue-600' })
                    : OPTION_COLORS[idx % OPTION_COLORS.length];
                  const isSelected = selectedIndex === idx;
                  const isGhostReveal = isGhostMode && opt.is_correct;

                  return (
                    <motion.button
                      key={idx}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setSelectedIndex(idx)}
                      className={cn(
                        'relative w-full text-left rounded-[1.5rem] font-bold transition-all duration-200 border-4',
                        isTrueFalse ? 'p-8 text-3xl' : 'p-5 text-lg',
                        color.bg, color.hover, color.text,
                        isSelected
                          ? `${color.border} ring-4 ring-white/40 scale-[1.02] shadow-xl`
                          : 'border-transparent opacity-70 hover:opacity-100',
                        isGhostReveal ? 'shadow-[inset_0_0_15px_rgba(255,255,255,0.3)]' : ''
                      )}
                    >
                      <span className="flex items-center gap-4">
                        {!isTrueFalse && (
                          <span className={cn('flex items-center justify-center w-10 h-10 rounded-xl text-sm font-black shrink-0', color.label)}>
                            {OPTION_LABELS[idx]}
                          </span>
                        )}
                        <span className="flex-1 leading-tight">{opt.text}</span>
                        {isSelected && (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                            <CheckCircle size={22} className="text-white shrink-0" />
                          </motion.div>
                        )}
                      </span>

                      {/* GHOST MODE VIP TELL */}
                      {isGhostReveal && (
                        <div
                          aria-hidden="true"
                          className="absolute bottom-2 right-2 text-sm pointer-events-none drop-shadow-md opacity-80"
                        >
                          ✨
                        </div>
                      )}
                    </motion.button>
                  );
                })}
              </div>

              {/* Confirm Button — only shows when something is selected */}
              <AnimatePresence>
                {selectedIndex !== null && (
                  <motion.button
                    key="confirm"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    onClick={() => void handleConfirmSubmit()}
                    disabled={submitting}
                    className="w-full py-4 rounded-2xl bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xl font-black tracking-tight shadow-xl transition-all disabled:opacity-60"
                  >
                    {submitting ? 'Submitting…' : '✓ Confirm & Submit'}
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
