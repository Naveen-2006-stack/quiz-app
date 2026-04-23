"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import { ArrowLeft, Download, Target, Users, Trophy, Percent, ShieldAlert } from "lucide-react";
import Link from "next/link";

type SessionInfo = {
  id: string;
  quiz_id: string;
  finished_at: string | null;
  started_at: string | null;
  quizzes: { title: string } | null;
};

type ViolationLog = {
  type: string;
  timestamp: string;
};

type Participant = {
  id: string;
  display_name: string;
  score: number;
  notes?: string;
  cheat_flags?: number;
  violation_logs?: ViolationLog[];
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
  image_url?: string | null;
};

type LeaderboardRow = {
  participantId: string;
  rank: number;
  name: string;
  score: number;
  correctCount: number;
  totalQuestions: number;
  notes?: string;
  violationLogs: ViolationLog[];
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
      staggerChildren: 0.07,
      delayChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

function rankClass(rank: number) {
  if (rank === 1) return "text-amber-500";
  if (rank === 2) return "text-slate-500";
  if (rank === 3) return "text-orange-500";
  return "text-slate-400";
}

function normalizeViolationLogs(input: any): ViolationLog[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((entry) => {
      const type = typeof entry?.type === "string" ? entry.type : "Unknown";
      const timestamp = typeof entry?.timestamp === "string" ? entry.timestamp : "";
      return { type, timestamp };
    })
    .filter((entry) => !!entry.timestamp);
}

export default function SessionAnalyticsReportPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdminViewer, setIsAdminViewer] = useState(false);

  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [responses, setResponses] = useState<StudentResponse[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [violationLogsByParticipant, setViolationLogsByParticipant] = useState<Record<string, ViolationLog[]>>({});

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
      setIsAdminViewer(isAdmin);

      const { data: sData, error: sErr } = await supabase
        .from("live_sessions")
        .select("id, quiz_id, teacher_id, started_at, finished_at, quizzes(title)")
        .eq("id", sessionId)
        .single();

      if (sErr || !sData) {
        setError("Could not load this report. It may not exist or you may not have access.");
        setLoading(false);
        return;
      }

      const isHost = (sData as any).teacher_id === user.id;
      if (!isAdmin && !isHost) {
        setError("Only the host can view the full session report.");
        setLoading(false);
        router.replace("/dashboard");
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

      const [pRes, rRes, qRes, vRes] = await Promise.all([
        supabase
          .from("participants")
          .select("id, display_name, score, notes, cheat_flags, violation_logs")
          .eq("session_id", sessionId)
          .eq("is_banned", false),
        supabase
          .from("student_responses")
          .select("question_id, participant_id, is_correct")
          .eq("session_id", sessionId),
        supabase
          .from("questions")
          .select("id, question_text, order_index, image_url")
          .eq("quiz_id", sData.quiz_id)
          .order("order_index", { ascending: true }),
        supabase
          .from("participant_violations")
          .select("participant_id, violation_type, created_at")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: false }),
      ]);

      if (pRes.error) throw pRes.error;
      if (rRes.error) throw rRes.error;
      if (qRes.error) throw qRes.error;
      if (vRes.error) throw vRes.error;

      const participantRows = (pRes.data || []) as Participant[];
      setParticipants(participantRows.map((p) => ({
        ...p,
        violation_logs: normalizeViolationLogs((p as any).violation_logs),
      })));
      setResponses((rRes.data || []) as StudentResponse[]);
      setQuestions((qRes.data || []) as Question[]);

      const logsMap: Record<string, ViolationLog[]> = {};

      participantRows.forEach((p: any) => {
        logsMap[p.id] = normalizeViolationLogs(p.violation_logs);
      });

      (vRes.data || []).forEach((row: any) => {
        const pid = row.participant_id as string | undefined;
        if (!pid) return;
        if (!logsMap[pid]) logsMap[pid] = [];

        const dbLog = {
          type: row.violation_type || "Unknown",
          timestamp: row.created_at,
        };

        const exists = logsMap[pid].some(
          (l) => l.type === dbLog.type && Math.abs(new Date(l.timestamp).getTime() - new Date(dbLog.timestamp).getTime()) < 2000
        );

        if (!exists) logsMap[pid].push(dbLog);
      });

      Object.keys(logsMap).forEach((pid) => {
        logsMap[pid] = [...logsMap[pid]].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
      });

      setViolationLogsByParticipant(logsMap);
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
      participantId: p.id,
      rank: index + 1,
      name: p.display_name || "Unknown",
      score: p.score || 0,
      correctCount: correctByParticipant.get(p.id) || 0,
      totalQuestions: questions.length,
      notes: p.notes || "",
      violationLogs: violationLogsByParticipant[p.id] || [],
    }));
  }, [participants, responses, questions.length, violationLogsByParticipant]);

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
    const header = ["Rank", "Student Name", "Final Score", "Questions Correct", "Violation Count", "Violation Types", "Notes"];
    const rows = leaderboard.map((row) => [
      row.rank,
      row.name,
      row.score,
      `${row.correctCount} / ${row.totalQuestions}`,
      row.violationLogs.length,
      row.violationLogs.map((v) => v.type).join(" | "),
      row.notes || "",
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

  const backHref = isAdminViewer ? "/admin-dashboard" : "/dashboard/reports";
  const backLabel = isAdminViewer ? "Back to Admin Dashboard" : "Back to Reports";

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="h-10 w-72 animate-pulse rounded-xl bg-slate-200" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-white border border-slate-200" />
            ))}
          </div>
          <div className="h-80 animate-pulse rounded-2xl bg-white border border-slate-200" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-4xl rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <h1 className="text-2xl font-bold text-rose-700">Report Error</h1>
          <p className="mt-2 text-rose-600">{error}</p>
          <Link href={backHref} className="mt-5 inline-flex items-center gap-2 text-slate-600 hover:text-indigo-600">
            <ArrowLeft size={16} /> {backLabel}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800">
      <motion.div
        className="mx-auto max-w-7xl space-y-8"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={itemVariants} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href={backHref} className="mb-2 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600">
              <ArrowLeft size={14} /> {backLabel}
            </Link>
            <h1 className="text-3xl font-black tracking-tight text-slate-800">
              {sessionInfo?.quizzes?.title || "Session Report"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Played on {sessionInfo?.finished_at ? new Date(sessionInfo.finished_at).toLocaleString() : "N/A"}
            </p>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500">
              <Users size={14} /> Total Participants
            </div>
            <div className="mt-3 text-3xl font-black text-slate-800">{totalParticipants}</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500">
              <Trophy size={14} /> Average Score
            </div>
            <div className="mt-3 text-3xl font-black text-slate-800">{averageScore.toFixed(1)}</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500">
              <Percent size={14} /> Average Accuracy
            </div>
            <div className="mt-3 text-3xl font-black text-slate-800">{averageAccuracy.toFixed(1)}%</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500">
              <Target size={14} /> Toughest Question
            </div>
            <div className="mt-3 line-clamp-2 text-sm font-semibold text-slate-800">
              {toughestQuestion
                ? `Q${toughestQuestion.orderIndex + 1}: ${toughestQuestion.questionText}`
                : "No answered questions"}
            </div>
          </div>
        </motion.div>

        <motion.section
          variants={itemVariants}
          className="rounded-2xl border border-slate-200 bg-white p-6"
        >
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-2xl font-bold text-slate-800">Leaderboard</h2>
            <button
              onClick={downloadCsv}
              className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-600 transition-colors hover:bg-indigo-100"
            >
              <Download size={16} /> Download CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3">Rank</th>
                  <th className="px-3 py-3">Student Name</th>
                  <th className="px-3 py-3">Final Score</th>
                  <th className="px-3 py-3">Questions Correct</th>
                  <th className="px-3 py-3">Violations</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row) => (
                  <tr key={`${row.rank}-${row.name}`} className="border-b border-slate-100 last:border-b-0">
                    <td className={`px-3 py-3 font-black ${rankClass(row.rank)}`}>#{row.rank}</td>
                    <td className="px-3 py-3 text-slate-800">{row.name}</td>
                    <td className="px-3 py-3 font-semibold text-slate-800">{row.score.toLocaleString()}</td>
                    <td className="px-3 py-3 text-slate-500">
                      {row.correctCount} / {row.totalQuestions}
                    </td>
                    <td className="px-3 py-3">
                      {row.violationLogs.length > 0 ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                          row.violationLogs.length >= 3
                            ? "bg-rose-100 text-rose-700"
                            : row.violationLogs.length >= 2
                            ? "bg-orange-100 text-orange-700"
                            : "bg-amber-100 text-amber-700"
                        }`}>
                          <ShieldAlert size={12} /> {row.violationLogs.length}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {leaderboard.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                      No leaderboard data available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.section>

        <motion.section variants={itemVariants} className="space-y-4">
          <h2 className="text-2xl font-bold text-slate-800">Question-by-Question Breakdown</h2>

          {questionStats.map((q, index) => (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.3, delay: index * 0.04 }}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Question {q.orderIndex + 1}</div>
              <div className="mb-4 text-base font-semibold text-slate-800">{q.questionText}</div>

              <div className="h-4 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                <div className="flex h-full w-full">
                  <div className="h-full bg-emerald-500" style={{ width: `${q.correctPct}%` }} />
                  <div className="h-full bg-rose-500" style={{ width: `${q.incorrectPct}%` }} />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-emerald-600">{q.correctCount} Correct</span>
                <span className="text-slate-400">•</span>
                <span className="text-rose-600">{q.incorrectCount} Incorrect</span>
                <span className="text-slate-500">({q.attempts} attempts)</span>
              </div>
            </motion.div>
          ))}

          {questionStats.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
              No question analytics available for this session.
            </div>
          )}
        </motion.section>

        <motion.section
          variants={itemVariants}
          className="rounded-2xl border border-slate-200 bg-white p-6"
        >
          <h2 className="text-2xl font-bold text-slate-800 mb-4">Detailed Anti-Cheat Logs</h2>

          <div className="space-y-4">
            {leaderboard.map((row) => (
              <div key={`log-${row.participantId}`} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-slate-800">{row.name}</h3>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {row.violationLogs.length} violation{row.violationLogs.length === 1 ? "" : "s"}
                  </span>
                </div>

                {row.violationLogs.length === 0 ? (
                  <p className="text-sm text-slate-500">No violations recorded.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                          <th className="py-2 pr-4">#</th>
                          <th className="py-2 pr-4">Type</th>
                          <th className="py-2 pr-2">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.violationLogs.map((log, idx) => (
                          <tr key={`${row.participantId}-${idx}`} className="border-b border-slate-100 last:border-b-0">
                            <td className="py-2 pr-4 text-slate-500">{idx + 1}</td>
                            <td className="py-2 pr-4 text-slate-800 font-semibold">{log.type}</td>
                            <td className="py-2 pr-2 text-slate-500">{new Date(log.timestamp).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}

            {leaderboard.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
                No student records available.
              </div>
            )}
          </div>
        </motion.section>
      </motion.div>
    </div>
  );
}
