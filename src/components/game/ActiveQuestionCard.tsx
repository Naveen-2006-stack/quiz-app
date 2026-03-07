"use client";

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useEffect, useRef, useState } from 'react';

interface ActiveQuestionCardProps {
  question: string;
  options: { text: string; is_correct: boolean }[];
  streak: number;
  timeLimit: number; // in seconds
  isRevealed: boolean;
  onAnswer: (index: number, reactionTimeMs: number) => Promise<void> | void;
}

export const ActiveQuestionCard = ({ question, options, streak, timeLimit, isRevealed, onAnswer }: ActiveQuestionCardProps) => {
  const [timeLeft, setTimeLeft] = useState(timeLimit);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [submittedIndex, setSubmittedIndex] = useState<number | null>(null);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    setTimeLeft(timeLimit);
    setHasSubmitted(false);
    setSubmittedIndex(null);
    startTimeRef.current = Date.now();
  }, [question, timeLimit]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (timeLeft === 0 && !hasSubmitted) {
      void handleSelect(-1);
    }
  }, [timeLeft, hasSubmitted]);

  useEffect(() => {
    if (isRevealed && !hasSubmitted) {
      setHasSubmitted(true);
      setSubmittedIndex(-1);
    }
  }, [isRevealed, hasSubmitted]);

  const handleSelect = async (idx: number) => {
    if (hasSubmitted) return;
    setHasSubmitted(true);
    setSubmittedIndex(idx);
    const reactionTimeMs = Date.now() - startTimeRef.current;
    await onAnswer(idx, reactionTimeMs);
  };

  const selectedThemeClass = submittedIndex === null
    ? ""
    : submittedIndex === 0
      ? "bg-rose-100/50 dark:bg-rose-500/10"
      : submittedIndex === 1
        ? "bg-indigo-100/50 dark:bg-indigo-500/10"
        : submittedIndex === 2
          ? "bg-amber-100/50 dark:bg-amber-500/10"
          : "bg-emerald-100/50 dark:bg-emerald-500/10";

  const didAnswerCorrectly = submittedIndex !== null && submittedIndex >= 0
    ? !!options[submittedIndex]?.is_correct
    : false;

  const showReveal = isRevealed && hasSubmitted;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn(
        "w-full max-w-2xl mx-auto rounded-[2.5rem] p-6 lg:p-10 transition-colors duration-300",
        "bg-white shadow-[0_20px_60px_-15px_rgba(79,70,229,0.15)] border border-indigo-50/50",
        "dark:bg-slate-800 dark:shadow-none dark:border-white/5"
      )}
    >
      {/* Header Info: Timer & Streak */}
      <div className="flex justify-between items-center mb-10">
        <div className="flex items-center space-x-2">
          <motion.div 
            animate={{ scale: timeLeft <= 5 && timeLeft > 0 ? [1, 1.1, 1] : 1 }}
            transition={{ repeat: timeLeft <= 5 && timeLeft > 0 ? Infinity : 0, duration: 1 }}
            className={cn(
              "text-3xl font-black font-mono tracking-tighter px-4 py-2 rounded-2xl",
              timeLeft <= 5 ? "bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400" : "bg-gray-100 text-slate-800 dark:bg-slate-900/50 dark:text-gray-200"
            )}
          >
            00:{Math.max(0, timeLeft).toString().padStart(2, '0')}
          </motion.div>
        </div>

        {/* Dynamic Streak Indicator */}
        <AnimatePresence>
          {streak >= 2 && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.5, rotate: -10 }} animate={{ opacity: 1, scale: 1, rotate: 0 }}
              className="flex items-center space-x-2 px-4 py-2 rounded-full bg-amber-100/50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 shadow-[0_0_20px_rgba(251,191,36,0.3)]"
            >
              <span className="text-xl">🔥</span>
              <span className="text-amber-600 dark:text-amber-400 font-extrabold text-lg tracking-tight">
                {streak}x Streak
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <h2 className="text-3xl lg:text-4xl font-extrabold text-slate-900 dark:text-white mb-12 leading-tight tracking-tight px-2">
        {question}
      </h2>

      <AnimatePresence mode="wait">
        {!showReveal && hasSubmitted ? (
          <motion.div
            key="locked-in"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "rounded-[2rem] border p-10 text-center transition-colors",
              "border-gray-200 bg-gray-50/70 dark:border-slate-700 dark:bg-slate-900/50",
              selectedThemeClass
            )}
          >
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="mx-auto mb-6 h-16 w-16 rounded-full border-4 border-indigo-300 border-t-indigo-600 dark:border-indigo-500/30 dark:border-t-indigo-400 animate-spin"
            />
            <h3 className="text-3xl font-extrabold text-slate-900 dark:text-slate-50 mb-2">Answer Submitted!</h3>
            <p className="text-slate-600 dark:text-slate-300">Waiting for timer...</p>
          </motion.div>
        ) : showReveal ? (
          <motion.div
            key="reveal"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "rounded-[2rem] p-12 text-center",
              didAnswerCorrectly ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
            )}
          >
            <h3 className="text-5xl font-black tracking-tight mb-2">
              {didAnswerCorrectly ? "Correct!" : "Incorrect!"}
            </h3>
            <p className="text-white/90 font-medium">Waiting for next question...</p>
          </motion.div>
        ) : (
          <motion.div key="answer-grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
            {options.map((opt, idx) => (
              <motion.button
                key={idx}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => void handleSelect(idx)}
                className={cn(
                  "relative overflow-hidden group w-full text-left p-6 rounded-[2rem] text-xl font-bold transition-all duration-300 shadow-sm",
                  "bg-gray-50 text-slate-700 hover:bg-gray-100 border-2 border-transparent dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-900/80"
                )}
              >
                <div className="absolute left-0 top-0 bottom-0 w-2 opacity-0 transition-opacity bg-indigo-500 group-hover:opacity-100 dark:group-hover:opacity-30" />

                <span className="flex items-center gap-6">
                  <span className="flex items-center justify-center w-12 h-12 rounded-2xl shadow-sm text-lg bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500">
                    {['A', 'B', 'C', 'D'][idx]}
                  </span>
                  <span className="flex-1 pr-2">{opt.text}</span>
                </span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
