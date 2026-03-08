"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import { ArrowLeft, Download, Target, Users, Trophy, Percent } from "lucide-react";
import Link from "next/link";

type SessionInfo = {
  id: string;
  quiz_id: string;
  finished_at: string | null;
  started_at: string | null;
  quizzes: { title: string } | null;
};

type Participant = {
  id: string;
  display_name: string;
  score: number;
};

type StudentResponse = {
  question_id: string;
  participant_id: string;
  is_correct: boolean;
};

type Question = {
  id: string;
  question_text: string;
  order_index: number;
};

type LeaderboardRow = {
  rank: number;
  name: string;
  score: number;
  correctCount: number;
  totalQuestions: number;
};

type QuestionStat = {
  id: string;
  orderIndex: number;
  questionText: string;
  correctCount: number;
  incorrectCount: number;
  attempts: number;
  correctPct: number;
  incorrectPct: number;
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.06,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

function rankClass(rank: number) {
  if (rank === 1) return "text-amber-400";
  if (rank === 2) return "text-slate-300";
  if (rank === 3) return "text-amber-700";
  return "text-slate-400";
}

export default function SessionAnalyticsReportPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [responses, setResponses] = useState<StudentResponse[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);

  useEffect(() => {
    if (!sessionId) return;
    void loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const loadReport = async () => {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      const isAdmin = profile?.role === "admin";

      let sessionQuery = supabase
        .from("live_sessions")
        .select("id, quiz_id, started_at, finished_at, quizzes(title)")
        .eq("id", sessionId);

      if (!isAdmin) {
        sessionQuery = sessionQuery.eq("teacher_id", user.id);
      }

      const { data: sData, error: sErr } = await sessionQuery.single();

      if (sErr || !sData) {
        setError("Could not load this report. It may not exist or you may not have access.");
        setLoading(false);
        return;
      }

      const quizRel = Array.isArray((sData as any).quizzes)
        ? (sData as any).quizzes[0]
        : (sData as any).quizzes;

      setSessionInfo({
        id: (sData as any).id,
        quiz_id: (sData as any).quiz_id,
        started_at: (sData as any).started_at,
        finished_at: (sData as any).finished_at,
        quizzes: quizRel ? { title: quizRel.title } : null,
      });

      const [pRes, rRes, qRes] = await Promise.all([
        supabase
          .from("participants")
          .select("id, display_name, score")
          .eq("session_id", sessionId),
        supabase
          .from("student_responses")
          .select("question_id, participant_id, is_correct")
          .eq("session_id", sessionId),
        supabase
          .from("questions")
          .select("id, question_text, order_index")
          .eq("quiz_id", sData.quiz_id)
          .order("order_index", { ascending: true }),
      ]);

      if (pRes.error) throw pRes.error;
      if (rRes.error) throw rRes.error;
      if (qRes.error) throw qRes.error;

      setParticipants((pRes.data || []) as Participant[]);
      setResponses((rRes.data || []) as StudentResponse[]);
      setQuestions((qRes.data || []) as Question[]);
    } catch (err: any) {
      setError(err?.message || "Failed to load analytics report.");
    } finally {
      setLoading(false);
    }
  };

  const leaderboard = useMemo<LeaderboardRow[]>(() => {
    if (!participants.length) return [];

    const correctByParticipant = new Map<string, number>();
    responses.forEach((r) => {
      if (!r.is_correct) return;
      correctByParticipant.set(r.participant_id, (correctByParticipant.get(r.participant_id) || 0) + 1);
    });

    const sorted = [...participants].sort((a, b) => b.score - a.score);

    return sorted.map((p, index) => ({
      rank: index + 1,
      name: p.display_name || "Unknown",
      score: p.score || 0,
      correctCount: correctByParticipant.get(p.id) || 0,
      totalQuestions: questions.length,
    }));
  }, [participants, responses, questions.length]);

  const questionStats = useMemo<QuestionStat[]>(() => {
    const grouped = new Map<string, { correct: number; incorrect: number }>();

    responses.forEach((r) => {
      const current = grouped.get(r.question_id) || { correct: 0, incorrect: 0 };
      if (r.is_correct) current.correct += 1;
      else current.incorrect += 1;
      grouped.set(r.question_id, current);
    });

    return questions.map((q) => {
      const stats = grouped.get(q.id) || { correct: 0, incorrect: 0 };
      const attempts = stats.correct + stats.incorrect;
      const correctPct = attempts > 0 ? (stats.correct / attempts) * 100 : 0;
      const incorrectPct = attempts > 0 ? (stats.incorrect / attempts) * 100 : 0;

      return {
        id: q.id,
        orderIndex: q.order_index,
        questionText: q.question_text,
        correctCount: stats.correct,
        incorrectCount: stats.incorrect,
        attempts,
        correctPct,
        incorrectPct,
      };
    });
  }, [questions, responses]);

  const totalParticipants = participants.length;

  const averageScore = useMemo(() => {
    if (!participants.length) return 0;
    const sum = participants.reduce((acc, p) => acc + (p.score || 0), 0);
    return sum / participants.length;
  }, [participants]);

  const averageAccuracy = useMemo(() => {
    if (!responses.length) return 0;
    const correct = responses.filter((r) => r.is_correct).length;
    return (correct / responses.length) * 100;
  }, [responses]);

  const toughestQuestion = useMemo(() => {
    if (!questionStats.length) return null;
    const attempted = questionStats.filter((q) => q.attempts > 0);
    if (!attempted.length) return null;
    return [...attempted].sort((a, b) => a.correctPct - b.correctPct)[0];
  }, [questionStats]);

  const downloadCsv = () => {
    const header = ["Rank", "Student Name", "Final Score", "Questions Correct"];
    const rows = leaderboard.map((row) => [
      row.rank,
      row.name,
      row.score,
      `${row.correctCount} / ${row.totalQuestions}`,
    ]);

    const csv = [header, ...rows]
      .map((line) =>
        line
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `session-${sessionId}-leaderboard.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-50">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="h-10 w-72 animate-pulse rounded-xl bg-slate-800" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-900/60" />
            ))}
          </div>
          <div className="h-80 animate-pulse rounded-2xl bg-slate-900/60" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-50">
        <div className="mx-auto max-w-4xl rounded-2xl border border-rose-700/40 bg-rose-950/20 p-6">
          <h1 className="text-2xl font-bold text-rose-300">Report Error</h1>
          <p className="mt-2 text-rose-200/90">{error}</p>
          <Link href="/dashboard/reports" className="mt-5 inline-flex items-center gap-2 text-slate-200 hover:text-white">
            <ArrowLeft size={16} /> Back to Reports
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-50">
      <motion.div
        className="mx-auto max-w-7xl space-y-8"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={itemVariants} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/dashboard/reports" className="mb-2 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200">
              <ArrowLeft size={14} /> Back to Reports
            </Link>
            <h1 className="text-3xl font-black tracking-tight text-slate-50">
              {sessionInfo?.quizzes?.title || "Session Report"}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Played on {sessionInfo?.finished_at ? new Date(sessionInfo.finished_at).toLocaleString() : "N/A"}
            </p>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 backdrop-blur-xl">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400">
              <Users size={14} /> Total Participants
            </div>
            <div className="mt-3 text-3xl font-black text-slate-50">{totalParticipants}</div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 backdrop-blur-xl">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400">
              <Trophy size={14} /> Average Score
            </div>
            <div className="mt-3 text-3xl font-black text-slate-50">{averageScore.toFixed(1)}</div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 backdrop-blur-xl">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400">
              <Percent size={14} /> Average Accuracy
            </div>
            <div className="mt-3 text-3xl font-black text-slate-50">{averageAccuracy.toFixed(1)}%</div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 backdrop-blur-xl">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400">
              <Target size={14} /> Toughest Question
            </div>
            <div className="mt-3 line-clamp-2 text-sm font-semibold text-slate-100">
              {toughestQuestion
                ? `Q${toughestQuestion.orderIndex + 1}: ${toughestQuestion.questionText}`
                : "No answered questions"}
            </div>
          </div>
        </motion.div>

        <motion.section
          variants={itemVariants}
          className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur-xl"
        >
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-2xl font-bold text-slate-50">Leaderboard</h2>
            <button
              onClick={downloadCsv}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
            >
              <Download size={16} /> Download CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead>
                <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-3">Rank</th>
                  <th className="px-3 py-3">Student Name</th>
                  <th className="px-3 py-3">Final Score</th>
                  <th className="px-3 py-3">Questions Correct</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row) => (
                  <tr key={`${row.rank}-${row.name}`} className="border-b border-slate-900/70 last:border-b-0">
                    <td className={`px-3 py-3 font-black ${rankClass(row.rank)}`}>#{row.rank}</td>
                    <td className="px-3 py-3 text-slate-100">{row.name}</td>
                    <td className="px-3 py-3 font-semibold text-slate-200">{row.score.toLocaleString()}</td>
                    <td className="px-3 py-3 text-slate-300">
                      {row.correctCount} / {row.totalQuestions}
                    </td>
                  </tr>
                ))}
                {leaderboard.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                      No leaderboard data available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.section>

        <motion.section variants={itemVariants} className="space-y-4">
          <h2 className="text-2xl font-bold text-slate-50">Question-by-Question Breakdown</h2>

          {questionStats.map((q, index) => (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.3, delay: index * 0.04 }}
              className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 backdrop-blur-xl"
            >
              <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Question {q.orderIndex + 1}</div>
              <div className="mb-4 text-base font-semibold text-slate-100">{q.questionText}</div>

              <div className="h-4 w-full overflow-hidden rounded-full border border-slate-800 bg-slate-950">
                <div className="flex h-full w-full">
                  <div className="h-full bg-emerald-500" style={{ width: `${q.correctPct}%` }} />
                  <div className="h-full bg-rose-500" style={{ width: `${q.incorrectPct}%` }} />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-emerald-400">{q.correctCount} Correct</span>
                <span className="text-slate-400">•</span>
                <span className="text-rose-400">{q.incorrectCount} Incorrect</span>
                <span className="text-slate-500">({q.attempts} attempts)</span>
              </div>
            </motion.div>
          ))}

          {questionStats.length === 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center text-slate-400 backdrop-blur-xl">
              No question analytics available for this session.
            </div>
          )}
        </motion.section>
      </motion.div>
    </div>
  );
}
