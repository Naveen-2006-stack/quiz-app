"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { generateRoomCode } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Play, Edit3, Trash2, Clock, Users, Hash } from "lucide-react";
import Link from "next/link";

interface Quiz {
  id: string;
  title: string;
  description: string;
  created_at: string;
  _count?: { questions: number };
}

export default function TeacherDashboard() {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQuizzes();
  }, []);

  const fetchQuizzes = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fetch quizzes and manually count questions for now
    const { data, error } = await supabase
      .from('quizzes')
      .select('*, questions(count)')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false });

    if (data) {
       const mapped = data.map(q => ({
           ...q,
           _count: { questions: q.questions[0].count }
       }));
       setQuizzes(mapped);
    }
    setLoading(false);
  };

  const createNewQuiz = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('quizzes')
      .insert([{ title: 'Untitled Quiz', description: '', teacher_id: user.id }])
      .select()
      .single();

    if (data) {
      router.push(`/quiz/${data.id}/edit`);
    }
  };

  const deleteQuiz = async (id: string) => {
    if (!confirm('Are you sure you want to delete this quiz?')) return;
    await supabase.from('quizzes').delete().eq('id', id);
    setQuizzes(quizzes.filter(q => q.id !== id));
  };

  const startSession = async (quizId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('live_sessions')
      .insert([{ 
        quiz_id: quizId, 
        teacher_id: user.id, 
        join_code: generateRoomCode(),
        status: 'waiting'
      }])
      .select()
      .single();

    if (data) {
      router.push(`/host/${data.id}`);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">My Quizzes</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage and host your interactive sessions</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={createNewQuiz}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-lg shadow-indigo-600/20 transition-all"
        >
          <Plus size={20} />
          Create Quiz
        </motion.button>
      </div>

      {/* Quiz Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-64 rounded-3xl bg-white dark:bg-slate-800 shadow-sm border border-gray-100 dark:border-white/5 animate-pulse" />
          ))}
        </div>
      ) : quizzes.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-3xl border border-dashed border-gray-200 dark:border-white/10">
          <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Plus className="text-indigo-600 dark:text-indigo-400" size={32} />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">No quizzes yet</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-6">Create your first quiz to start engaging your students.</p>
          <button onClick={createNewQuiz} className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
            Click here to create one
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {quizzes.map((quiz, idx) => (
              <motion.div
                key={quiz.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
                className="group relative bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-xl shadow-slate-200/40 dark:shadow-none border border-gray-100 dark:border-white/10 hover:border-indigo-200 dark:hover:border-indigo-500/50 transition-all"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white truncate pb-1" title={quiz.title}>
                      {quiz.title}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 min-h-[40px]">
                      {quiz.description || 'No description provided.'}
                    </p>
                  </div>
                </div>

                {/* Stats Row */}
                <div className="flex items-center gap-4 py-4 border-y border-gray-100 dark:border-white/10 mb-6">
                  <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                    <Hash size={16} className="text-indigo-500" />
                    <span className="font-semibold">{quiz._count?.questions || 0}</span> questions
                  </div>
                  <div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
                  <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300 truncate">
                    <Clock size={16} className="text-indigo-500" />
                    <span>{new Date(quiz.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <motion.button 
                      onClick={() => startSession(quiz.id)}
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      className="w-full flex justify-center items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white py-2.5 rounded-xl font-medium transition-colors"
                    >
                      <Play size={18} /> Host Live
                    </motion.button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/quiz/${quiz.id}/edit`}>
                      <button className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-xl transition-colors" title="Edit Quiz">
                        <Edit3 size={20} />
                      </button>
                    </Link>
                    <button onClick={() => deleteQuiz(quiz.id)} className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-colors" title="Delete Quiz">
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
