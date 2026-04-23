"use client";

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle } from 'lucide-react';
import confetti from 'canvas-confetti';

type OptionColor = {
  bg: string;
  hover: string;
  border: string;
  text: string;
  label: string;
  depth: string;
};

const OPTION_COLORS: OptionColor[] = [
  { bg: 'bg-rose-500', hover: 'hover:bg-rose-600', border: 'border-rose-400', text: 'text-white', label: 'bg-rose-600', depth: 'shadow-[0_5px_0_rgba(190,24,93,0.45)] dark:shadow-none' },
  { bg: 'bg-blue-500', hover: 'hover:bg-blue-600', border: 'border-blue-400', text: 'text-white', label: 'bg-blue-600', depth: 'shadow-[0_5px_0_rgba(29,78,216,0.45)] dark:shadow-none' },
  { bg: 'bg-amber-500', hover: 'hover:bg-amber-600', border: 'border-amber-400', text: 'text-white', label: 'bg-amber-600', depth: 'shadow-[0_5px_0_rgba(180,83,9,0.45)] dark:shadow-none' },
  { bg: 'bg-emerald-500', hover: 'hover:bg-emerald-600', border: 'border-emerald-400', text: 'text-white', label: 'bg-emerald-600', depth: 'shadow-[0_5px_0_rgba(4,120,87,0.45)] dark:shadow-none' },
];

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

interface ActiveQuestionCardProps {
  question: string;
  imageUrl?: string | null;
  questionType?: 'mcq' | 'true_false' | 'multi_select';
  options: { text: string; is_correct?: boolean }[];
  streak: number;
  timeLimit: number; // seconds
  isRevealed: boolean;
  /** Server-confirmed result from submit_answer_v2 RPC */
  wasAnswerCorrect?: boolean | null;
  onAnswer: (indices: number[], reactionTimeMs: number) => Promise<void> | void;
  /** Ghost Mode: when true, the correct answer button gets the secret micro-tell dot */
  isGhostMode?: boolean;
  isAlreadyAnswered?: boolean;
  /** Test Mode: when true, students cannot see marks or correct/incorrect feedback */
  isTestMode?: boolean;
}

export const ActiveQuestionCard = ({
  question,
  imageUrl = null,
  questionType = 'mcq',
  options,
  streak,
  timeLimit,
  isRevealed,
  wasAnswerCorrect = null,
  onAnswer,
  isGhostMode = false,
  isAlreadyAnswered = false,
  isTestMode = false,
}: ActiveQuestionCardProps) => {
  const [timeLeft, setTimeLeft] = useState(timeLimit);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]); // highlighted but not yet submitted
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [shuffledOptions, setShuffledOptions] = useState<{ text: string; is_correct: boolean; originalIndex: number }[]>([]);
  const startTimeRef = useRef(Date.now());

  // Reset state when the question changes
  useEffect(() => {
    setTimeLeft(timeLimit);
    setSelectedIndices([]);
    setHasSubmitted(false);
    setSubmitting(false);
    startTimeRef.current = Date.now();

    // Options are now shuffled server-side via get_questions_for_student RPC
    setShuffledOptions(options.map((opt, i) => ({ ...opt, originalIndex: i })) as any);
  }, [question, timeLimit, options]);

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
    const indices = overrideIdx !== undefined ? [overrideIdx] : selectedIndices;
    if (indices.length === 0 || hasSubmitted || submitting) return;
    setSubmitting(true);
    setHasSubmitted(true);
    const reactionMs = Date.now() - startTimeRef.current;

    await onAnswer(indices, reactionMs);
    setSubmitting(false);
  };

  const currentSelectionIdx = selectedIndices.length ? selectedIndices[0] : null;

  // Use server-confirmed result (wasAnswerCorrect) when available; fall back to client-side is_correct
  const didAnswerCorrectly =
    isRevealed && hasSubmitted
      ? wasAnswerCorrect !== null && wasAnswerCorrect !== undefined
        ? wasAnswerCorrect
        : (selectedIndices.length > 0 ? selectedIndices.every((idx) => !!shuffledOptions[idx]?.is_correct) : false)
      : false;

  const showReveal = isRevealed && hasSubmitted;
  const isTrueFalse = questionType === 'true_false';
  const isMultiSelect = questionType === 'multi_select';
  const timeFraction = timeLeft / timeLimit;
  const timerColor =
    timeFraction > 0.5 ? 'bg-emerald-500' : timeFraction > 0.25 ? 'bg-amber-500' : 'bg-rose-500';

  // Trigger Confetti when answer is revealed and correct
  useEffect(() => {
    if (showReveal && didAnswerCorrectly && !isTestMode) {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10B981', '#34D399', '#059669', '#FCD34D'],
        zIndex: 100 // ensure it's above other elements
      });
    }
  }, [showReveal, didAnswerCorrectly]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="w-full max-w-2xl mx-auto rounded-[2.5rem] overflow-hidden bg-white/80 dark:bg-slate-900/60 backdrop-blur-2xl shadow-2xl shadow-indigo-900/10 border border-white/50 dark:border-white/10"
    >
      {/* Progress bar */}
      <div className="h-1.5 bg-gray-100/50 dark:bg-slate-700/50 backdrop-blur-md">
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
              'text-3xl font-black font-mono tracking-tighter px-4 py-2 rounded-2xl border-2 transition-all duration-300',
              timeLeft <= 5 && timeLeft > 0
                ? 'bg-rose-100/90 text-rose-600 border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.6)] dark:bg-rose-500/20 dark:text-rose-400'
                : 'bg-gray-100 text-slate-800 border-transparent dark:bg-slate-900/50 dark:text-gray-200 shadow-none'
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
        {imageUrl && (
          <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            <img
              src={imageUrl}
              alt="Question visual"
              className="w-full max-h-80 object-contain"
              loading="lazy"
            />
          </div>
        )}
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
                isTestMode
                  ? 'bg-slate-700 text-white'
                  : didAnswerCorrectly ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
              )}
            >
              <div className="text-5xl mb-3">{isTestMode ? '📝' : didAnswerCorrectly ? '✅' : '❌'}</div>
              <h3 className="text-4xl font-black tracking-tight mb-2">
                {isTestMode ? 'Answer Submitted' : didAnswerCorrectly ? 'Correct!' : 'Incorrect!'}
              </h3>
              <p className="text-white/80">Waiting for next question...</p>
            </motion.div>

            /* LOCKED / ALREADY ANSWERED STATE */
          ) : isAlreadyAnswered ? (
             <motion.div
              key="locked"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-[2rem] border-2 border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/50 dark:bg-indigo-500/5 p-10 text-center"
            >
              <div className="text-5xl mb-3">🔒</div>
              <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-1">
                Answer Locked
              </h3>
              <p className="text-slate-500 dark:text-slate-400">You have already submitted an answer for this question.</p>
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
                {selectedIndices.length > 0
                  ? `You picked: ${selectedIndices.map((idx) => shuffledOptions[idx]?.text).filter(Boolean).join(', ')}`
                  : "Time's up!"}
              </h3>
              <p className="text-slate-500 dark:text-slate-400">Waiting for reveal...</p>
            </motion.div>

            /* ANSWER GRID — Select then Confirm */
          ) : (
            <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {isMultiSelect && (
                <div className="mb-4 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
                  Multiple Choice question: select all correct answers. More than one option can be right.
                </div>
              )}
              <div className={cn('mb-5', isTrueFalse ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : 'grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4')}>
                {shuffledOptions.map((opt, idx) => {
                  const isGhostReveal = isGhostMode && opt.is_correct;

                  // Normal color logic — ghost mode never overrides the button color.
                  // (Doing so was causing the backend-confirmed correctness to appear wrong.)
                  const color: OptionColor = isTrueFalse
                    ? (opt.text.toLowerCase() === 'false'
                      ? { bg: 'bg-rose-500', hover: 'hover:bg-rose-600', border: 'border-rose-400', text: 'text-white', label: 'bg-rose-600', depth: 'shadow-[0_5px_0_rgba(190,24,93,0.45)] dark:shadow-none' }
                      : { bg: 'bg-blue-500', hover: 'hover:bg-blue-600', border: 'border-blue-400', text: 'text-white', label: 'bg-blue-600', depth: 'shadow-[0_5px_0_rgba(29,78,216,0.45)] dark:shadow-none' })
                    : OPTION_COLORS[idx % OPTION_COLORS.length];

                  const isSelected = selectedIndices.includes(idx);

                  return (
                    <motion.button
                      key={idx}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        if (isTrueFalse) {
                          setSelectedIndices([idx]);
                          return;
                        }
                        if (!isMultiSelect) {
                          setSelectedIndices([idx]);
                          return;
                        }
                        setSelectedIndices((prev) =>
                          prev.includes(idx) ? prev.filter((v) => v !== idx) : [...prev, idx]
                        );
                      }}
                      className={cn(
                        'relative w-full text-left rounded-[1.5rem] font-bold transition-all duration-200 border-4 min-h-[48px]',
                        isTrueFalse ? 'p-8 text-3xl' : 'p-5 text-lg',
                        color.bg, color.hover, color.text,
                        color.depth,
                        isSelected
                          ? `${color.border} ring-4 ring-white/40 scale-[1.02] shadow-xl translate-y-[1px]`
                          : 'border-transparent opacity-80 hover:opacity-100'
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

                      {/* GHOST MODE: star icon pinned to top-right corner */}
                      {isGhostReveal && (
                        <div
                          aria-hidden="true"
                          className="absolute top-2 right-3 text-base pointer-events-none drop-shadow-md"
                          title="Ghost: correct answer"
                        >
                          ⭐
                        </div>
                      )}
                    </motion.button>
                  );
                })}
              </div>

              {/* Confirm Button — Fixed to bottom for mobile ergonomics */}
              <AnimatePresence>
                {selectedIndices.length > 0 && (
                  <motion.div
                    key="confirm-wrapper"
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 50 }}
                    className="fixed bottom-0 left-0 w-full p-4 pb-[env(safe-area-inset-bottom)] z-50 bg-slate-950/80 backdrop-blur-md border-t border-white/10 flex justify-center"
                  >
                    <button
                      onClick={() => void handleConfirmSubmit()}
                      disabled={submitting}
                      className="w-full max-w-2xl py-4 rounded-2xl bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xl font-black tracking-tight shadow-xl transition-all disabled:opacity-60"
                    >
                      {submitting ? 'Submitting…' : `✓ Confirm ${selectedIndices.length} Selection${selectedIndices.length > 1 ? 's' : ''}`}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
