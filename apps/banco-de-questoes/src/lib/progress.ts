/**
 * Agregação do progresso do usuário por concurso. Função pura (sem Prisma)
 * para que a conta possa ser testada sem banco.
 */
export type ProgressEntry<C extends { id?: string } = { id?: string }> = {
  contestId: string;
  contest: C;
  totalAnswered: number;
  totalCorrect: number;
};

export type ContestProgress<E extends ProgressEntry> = {
  contest: E["contest"];
  subjects: E[];
  totalAnswered: number;
  totalCorrect: number;
};

export function summarizeProgress<E extends ProgressEntry>(entries: E[]) {
  const contestMap = new Map<string, ContestProgress<E>>();

  for (const entry of entries) {
    const existing = contestMap.get(entry.contestId);
    if (existing) {
      existing.subjects.push(entry);
      existing.totalAnswered += entry.totalAnswered;
      existing.totalCorrect += entry.totalCorrect;
    } else {
      contestMap.set(entry.contestId, {
        contest: entry.contest,
        subjects: [entry],
        totalAnswered: entry.totalAnswered,
        totalCorrect: entry.totalCorrect,
      });
    }
  }

  const byContest = Array.from(contestMap.values()).sort(
    (a, b) => b.totalAnswered - a.totalAnswered
  );

  const overall = byContest.reduce(
    (acc, c) => {
      acc.totalAnswered += c.totalAnswered;
      acc.totalCorrect += c.totalCorrect;
      return acc;
    },
    { totalAnswered: 0, totalCorrect: 0 }
  );

  return { byContest, overall };
}
