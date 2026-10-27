import { prisma } from "@/lib/prisma";
import { summarizeProgress } from "@/lib/progress";
import {
  calculatePassChance,
  type PredictionResult,
  type SubjectPerformanceInput,
} from "@/lib/prediction";

export async function getContests() {
  const contests = await prisma.contest.findMany({
    orderBy: { examDate: "asc" },
    include: {
      _count: { select: { questions: true } },
    },
  });
  return contests;
}

export async function getContestBySlug(slug: string) {
  return prisma.contest.findUnique({
    where: { slug },
    include: {
      subjects: {
        include: {
          subject: true,
          // questionCount já vem no campo próprio, mas contamos de fato
          // as questões cadastradas para não depender de dado manual.
        },
        orderBy: { weight: "desc" },
      },
      _count: { select: { questions: true } },
    },
  });
}

export async function getQuestionsForSolving(params: {
  contestId: string;
  subjectId?: string;
}) {
  const { contestId, subjectId } = params;

  return prisma.question.findMany({
    where: {
      contestId,
      ...(subjectId ? { subjectId } : {}),
    },
    orderBy: { createdAt: "asc" },
    include: {
      subject: true,
      options: {
        select: { id: true, label: true, text: true },
        orderBy: { label: "asc" },
      },
    },
  });
}

export async function getUserProgressSummary(userId: string) {
  const progress = await prisma.userProgress.findMany({
    where: { userId },
    include: {
      contest: true,
      subject: true,
    },
  });

  return summarizeProgress(progress);
}

export async function getContestPrediction(
  userId: string,
  contestId: string
): Promise<PredictionResult> {
  const [contestSubjects, progressRows, recentAnswers] = await Promise.all([
    prisma.contestSubject.findMany({
      where: { contestId },
      include: { subject: true },
    }),
    prisma.userProgress.findMany({
      where: { userId, contestId },
    }),
    prisma.userAnswer.findMany({
      where: { userId, question: { contestId } },
      orderBy: { answeredAt: "desc" },
      take: 20,
      select: { isCorrect: true },
    }),
  ]);

  const progressBySubject = new Map(progressRows.map((p) => [p.subjectId, p]));

  const subjectPerformances: SubjectPerformanceInput[] = contestSubjects.map((cs) => {
    const progress = progressBySubject.get(cs.subjectId);
    return {
      subjectId: cs.subjectId,
      subjectName: cs.subject.name,
      weight: cs.weight,
      totalAnswered: progress?.totalAnswered ?? 0,
      totalCorrect: progress?.totalCorrect ?? 0,
    };
  });

  const totalAnswered = progressRows.reduce((sum, p) => sum + p.totalAnswered, 0);
  const totalCorrect = progressRows.reduce((sum, p) => sum + p.totalCorrect, 0);

  return calculatePassChance({
    subjectPerformances,
    totalAnswered,
    totalCorrect,
    recentAnswersCorrect: recentAnswers.map((a) => a.isCorrect),
  });
}
