"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter, useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Save, Plus, Trash2, ArrowLeft, GripVertical, CheckCircle2 } from "lucide-react";
import Link from "next/link";

interface Option { text: string; is_correct: boolean; }
type QuestionType = "mcq" | "true_false";
interface Question { id: string; question_text: string; question_type: QuestionType; time_limit: number; base_points: number; options: Option[]; order_index: number; _isNew?: boolean; }
interface Quiz { id: string; title: string; description: string; timer_based_marking?: boolean; test_mode?: boolean; }

const getMcqDefaultOptions = (): Option[] => [
  { text: "", is_correct: true },
  { text: "", is_correct: false },
  { text: "", is_correct: false },
  { text: "", is_correct: false },
];

const TRUE_FALSE_OPTIONS: Option[] = [
  { text: "True", is_correct: true },
  { text: "False", is_correct: false },
];

export default function QuizEditor() {
  const router = useRouter();
  const params = useParams();
  const quizId = params.id as string;

  const [quiz, setQuiz] = useState<Quiz>({ id: quizId, title: "Loading...", description: "", timer_based_marking: true });
  const [questions, setQuestions] = useState<Question[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    fetchQuizData();
  }, [quizId]);

  const fetchQuizData = async () => {
    // 1. Fetch Quiz Details
    const { data: qData } = await supabase.from("quizzes").select("*").eq("id", quizId).single();
    if (qData) setQuiz(qData);

    // 2. Fetch Questions
    const { data: qsData } = await supabase.from("questions").select("*").eq("quiz_id", quizId).order("order_index");
    if (qsData) {
      const normalized = (qsData as any[]).map((q) => ({
        ...q,
        question_type: (q.question_type || "mcq") as QuestionType,
        options: Array.isArray(q.options) ? q.options : getMcqDefaultOptions(),
      }));
      setQuestions(normalized as Question[]);
    }
  };

  const addQuestion = () => {
    const newQ: Question = {
      id: crypto.randomUUID(), // Temp ID for React key
      question_text: "",
      question_type: "mcq",
      time_limit: 40,
      base_points: 100,
      order_index: questions.length,
      options: getMcqDefaultOptions(),
      _isNew: true
    };
    setQuestions([...questions, newQ]);
  };

  const updateQuestion = (index: number, field: keyof Question, value: any) => {
    setQuestions(prev => prev.map((q, i) => i === index ? { ...q, [field]: value } : q));
  };

  const updateOption = (qIndex: number, oIndex: number, text: string) => {
    setQuestions(prev => prev.map((q, i) => {
      if (i !== qIndex) return q;
      const newOptions = q.options.map((opt, j) => j === oIndex ? { ...opt, text } : opt);
      return { ...q, options: newOptions };
    }));
  };

  const setCorrectOption = (qIndex: number, oIndex: number) => {
    setQuestions(prev => prev.map((q, i) => {
      if (i !== qIndex) return q;
      const newOptions = q.question_type === "true_false"
        ? q.options.map((opt, j) => ({ ...opt, is_correct: j === oIndex }))
        : q.options.map((opt, j) => (j === oIndex ? { ...opt, is_correct: !opt.is_correct } : opt));
      return { ...q, options: newOptions };
    }));
  };

  const setQuestionType = (qIndex: number, nextType: QuestionType) => {
    const updated = [...questions];
    const current = updated[qIndex];

    if (nextType === "true_false") {
      const currentlyCorrect = current.options.findIndex((o) => o.is_correct);
      // Preserve intent: if the second option (index 1) was correct → False is correct.
      // In all other cases (index 0, 2, 3, or -1 meaning none) → True is correct.
      // This ensures exactly one of True/False is always marked correct.
      const trueShouldBeCorrect = currentlyCorrect !== 1;
      updated[qIndex] = {
        ...current,
        question_type: "true_false",
        options: [
          { text: "True", is_correct: trueShouldBeCorrect },
          { text: "False", is_correct: !trueShouldBeCorrect },
        ],
      };
    } else {
      const prev = current.options;
      const padded = [
        prev[0] ? { ...prev[0] } : { text: "", is_correct: true },
        prev[1] ? { ...prev[1] } : { text: "", is_correct: false },
        prev[2] ? { ...prev[2] } : { text: "", is_correct: false },
        prev[3] ? { ...prev[3] } : { text: "", is_correct: false },
      ];
      updated[qIndex] = {
        ...current,
        question_type: "mcq",
        options: padded,
      };
    }

    setQuestions(updated);
  };

  const deleteQuestion = async (index: number, rawId: string, isNew?: boolean) => {
    if (!isNew) {
      await supabase.from("questions").delete().eq("id", rawId);
    }
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const saveQuiz = async () => {
    setSaving(true);
    setSaveStatus(null);
    const errors: string[] = [];
    try {
      // 1. Update Quiz Title/Desc
      const { error: quizError } = await supabase
        .from('quizzes')
        .update({ title: quiz.title, description: quiz.description, timer_based_marking: quiz.timer_based_marking, test_mode: quiz.test_mode ?? false })
        .eq('id', quiz.id);
      if (quizError) errors.push(`Quiz details: ${quizError.message}`);

      // 2. Upsert Questions one by one
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const hasCorrectAnswer = q.options.some((opt) => !!opt.is_correct);
        if (!hasCorrectAnswer) {
          errors.push(`Question ${i + 1}: mark at least one correct answer.`);
          continue;
        }

        const payload = {
          quiz_id: quizId,
          question_text: q.question_text,
          question_type: q.question_type || "mcq",
          time_limit: q.time_limit,
          base_points: q.base_points,
          options: q.options,
          order_index: i,
        };

        if (q._isNew) {
          const { error: insertError } = await supabase.from('questions').insert([payload]);
          if (insertError) errors.push(`Question ${i + 1} insert: ${insertError.message}`);
        } else {
          const { error: updateError } = await supabase.from('questions').update(payload).eq('id', q.id);
          if (updateError) errors.push(`Question ${i + 1} update: ${updateError.message}`);
        }
      }

      // Refresh to get real UUIDs for newly-inserted questions
      await fetchQuizData();

      if (errors.length > 0) {
        setSaveStatus({ type: 'error', message: errors.join(' | ') });
      } else {
        setSaveStatus({ type: 'success', message: `Quiz saved! ${questions.length} question${questions.length !== 1 ? 's' : ''} saved successfully.` });
        setTimeout(() => setSaveStatus(null), 4000);
      }
    } catch (err: any) {
      setSaveStatus({ type: 'error', message: err?.message || 'Unexpected error saving quiz.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-24">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-white/10">
        <Link href="/dashboard" className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors">
          <ArrowLeft size={20} /> Back to Dashboard
        </Link>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={saveQuiz} disabled={saving}
            className="flex-1 sm:flex-none flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-medium shadow-lg shadow-indigo-600/20 transition-all"
          >
            <Save size={18} /> {saving ? 'Saving…' : 'Save Quiz'}
          </button>
        </div>
      </div>

      {/* Save Status Banner */}
      {saveStatus && (
        <div className={`px-5 py-4 rounded-2xl font-semibold text-sm ${saveStatus.type === 'success'
          ? 'bg-emerald-50 border border-emerald-300 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400'
          : 'bg-rose-50 border border-rose-300 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-400'
          }`}>
          {saveStatus.type === 'success' ? '✅ ' : '❌ '}{saveStatus.message}
        </div>
      )}

      {/* Quiz Details Form */}
      <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-white/10 space-y-6">
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Quiz Title</label>
          <input
            type="text" value={quiz.title} onChange={e => setQuiz({ ...quiz, title: e.target.value })}
            className="w-full text-2xl font-bold px-4 py-3 rounded-xl bg-gray-50 dark:bg-slate-900 border border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800 outline-none transition-all dark:text-white"
            placeholder="Enter quiz title..."
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Description (Optional)</label>
          <textarea
            value={quiz.description || ""} onChange={e => setQuiz({ ...quiz, description: e.target.value })} rows={2}
            className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-slate-900 border border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800 outline-none transition-all dark:text-white resize-none"
            placeholder="What is this quiz about?"
          />
        </div>

        {/* Timer-based Scoring Toggle */}
        <div className="flex items-start sm:items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-slate-900/50 rounded-2xl border border-gray-100 dark:border-white/5">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">Timer-based Scoring</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Faster answers get more points when enabled</p>
          </div>
          <button
            onClick={() => setQuiz({ ...quiz, timer_based_marking: !quiz.timer_based_marking })}
            className={`relative inline-flex h-6 w-11 shrink-0 self-start sm:self-center mt-0.5 sm:mt-0 items-center rounded-full transition-colors focus:outline-none ring-2 ring-offset-2 ring-transparent focus:ring-indigo-500 ${quiz.timer_based_marking ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-slate-700'
              }`}
          >
            <span
              className={`${quiz.timer_based_marking ? 'translate-x-6' : 'translate-x-1'
                } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
            />
          </button>
        </div>

        {/* Test Mode Toggle */}
        <div className="flex items-start sm:items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-slate-900/50 rounded-2xl border border-gray-100 dark:border-white/5">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">Test Mode</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">When on, students cannot see their marks or the final leaderboard — only you can</p>
          </div>
          <button
            onClick={() => setQuiz({ ...quiz, test_mode: !quiz.test_mode })}
            className={`relative inline-flex h-6 w-11 shrink-0 self-start sm:self-center mt-0.5 sm:mt-0 items-center rounded-full transition-colors focus:outline-none ring-2 ring-offset-2 ring-transparent focus:ring-violet-500 ${quiz.test_mode ? 'bg-violet-600' : 'bg-gray-300 dark:bg-slate-700'
              }`}
          >
            <span
              className={`${quiz.test_mode ? 'translate-x-6' : 'translate-x-1'
                } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
            />
          </button>
        </div>
      </div>

      {/* Questions Editor */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Questions <span className="text-slate-400 text-lg font-normal">({questions.length})</span></h2>
        </div>

        <AnimatePresence>
          {questions.map((q, qIdx) => (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm border border-gray-100 dark:border-white/10"
            >
              <div className="flex items-start gap-4 mb-6">
                <div className="mt-3 cursor-grab text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                  <GripVertical size={20} />
                </div>
                <div className="flex-1 space-y-4">
                  <div className="flex justify-between items-start gap-4">
                    <input
                      type="text" value={q.question_text} onChange={e => updateQuestion(qIdx, "question_text", e.target.value)}
                      placeholder={`Question ${qIdx + 1}`}
                      className="w-full text-xl font-semibold px-4 py-3 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-white/10 focus:border-indigo-500 outline-none transition-all dark:text-white"
                    />
                    <button
                      onClick={() => deleteQuestion(qIdx, q.id, q._isNew)}
                      className="p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-colors"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>

                  {/* Settings Row: Time & Points */}
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-slate-900 px-4 py-2 rounded-xl border border-gray-200 dark:border-white/10">
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Type:</span>
                      <select
                        value={q.question_type || "mcq"}
                        onChange={e => setQuestionType(qIdx, e.target.value as QuestionType)}
                        className="bg-transparent text-slate-900 dark:text-white font-semibold outline-none cursor-pointer"
                      >
                        <option value="mcq">Multiple Choice</option>
                        <option value="true_false">True / False</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-slate-900 px-4 py-2 rounded-xl border border-gray-200 dark:border-white/10">
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Time Limit:</span>
                      <select
                        value={q.time_limit} onChange={e => updateQuestion(qIdx, "time_limit", parseInt(e.target.value))}
                        className="bg-transparent text-slate-900 dark:text-white font-semibold outline-none cursor-pointer"
                      >
                        {[10, 20, 30, 40, 60, 90].map(t => <option key={t} value={t}>{t}s</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-slate-900 px-4 py-2 rounded-xl border border-gray-200 dark:border-white/10">
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Points:</span>
                      <select
                        value={q.base_points} onChange={e => updateQuestion(qIdx, "base_points", parseInt(e.target.value))}
                        className="bg-transparent text-slate-900 dark:text-white font-semibold outline-none cursor-pointer"
                      >
                        {[50, 100, 200].map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Options Editor */}
              {q.question_type === "true_false" ? (
                <div className="ml-9 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {q.options.slice(0, 2).map((opt, oIdx) => {
                    const isTrue = opt.text.toLowerCase() === "true";
                    return (
                      <button
                        key={oIdx}
                        type="button"
                        onClick={() => setCorrectOption(qIdx, oIdx)}
                        className={`relative w-full p-6 rounded-2xl border-2 text-left transition-all ${isTrue
                          ? "bg-blue-500 text-white border-blue-400"
                          : "bg-rose-500 text-white border-rose-400"
                          } ${opt.is_correct ? "ring-4 ring-white/40 scale-[1.01]" : "opacity-75 hover:opacity-100"}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xl font-black tracking-tight">{opt.text}</span>
                          <CheckCircle2 size={24} className={opt.is_correct ? "fill-white/30 text-white" : "text-white/70"} />
                        </div>
                        <p className="mt-2 text-sm text-white/85">{opt.is_correct ? "Correct answer" : "Tap to mark as correct"}</p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="ml-9 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {q.options.map((opt, oIdx) => (
                    <div
                      key={oIdx}
                      className={`relative flex items-center p-2 rounded-xl border-2 transition-all ${opt.is_correct
                        ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-500/10'
                        : 'border-transparent bg-gray-50 dark:bg-slate-900 focus-within:border-indigo-200 dark:focus-within:border-indigo-500/50'
                        }`}
                    >
                      <button
                        onClick={() => setCorrectOption(qIdx, oIdx)}
                        className={`p-2 rounded-lg transition-colors ${opt.is_correct ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400'
                          }`}
                        title={opt.is_correct ? "Marked correct (click to unmark)" : "Click to mark as correct"}
                      >
                        <CheckCircle2 size={24} className={opt.is_correct ? 'fill-emerald-100 dark:fill-emerald-900/30' : ''} />
                      </button>
                      <input
                        type="text" value={opt.text} onChange={e => updateOption(qIdx, oIdx, e.target.value)}
                        placeholder={`Add answer ${oIdx + 1}`}
                        className="flex-1 px-2 py-2 bg-transparent outline-none text-slate-900 dark:text-white font-medium"
                      />
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        <motion.button
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={addQuestion}
          className="w-full flex justify-center items-center gap-2 py-4 border-2 border-dashed border-gray-300 dark:border-white/20 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-3xl text-indigo-600 dark:text-indigo-400 font-bold transition-all"
        >
          <Plus size={20} /> Add Question
        </motion.button>
      </div>
    </div>
  );
}
