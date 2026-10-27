import { describe, expect, it } from "vitest";

import { summarizeProgress } from "./progress";

const entry = (contestId: string, subject: string, answered: number, correct: number) => ({
  contestId,
  contest: { id: contestId },
  subject,
  totalAnswered: answered,
  totalCorrect: correct,
});

describe("summarizeProgress", () => {
  it("sem nenhum progresso devolve listas vazias e totais zerados", () => {
    expect(summarizeProgress([])).toEqual({
      byContest: [],
      overall: { totalAnswered: 0, totalCorrect: 0 },
    });
  });

  it("soma as matérias do mesmo concurso em uma única linha", () => {
    const r = summarizeProgress([entry("c1", "pt", 10, 7), entry("c1", "dir", 20, 5)]);
    expect(r.byContest).toHaveLength(1);
    expect(r.byContest[0]).toMatchObject({ totalAnswered: 30, totalCorrect: 12 });
    expect(r.byContest[0].subjects).toHaveLength(2);
  });

  it("não mistura concursos diferentes", () => {
    const r = summarizeProgress([entry("c1", "pt", 10, 7), entry("c2", "pt", 4, 1)]);
    expect(r.byContest.map((c) => c.totalAnswered).sort((a, b) => a - b)).toEqual([4, 10]);
  });

  it("ordena o concurso mais estudado primeiro", () => {
    const r = summarizeProgress([entry("c1", "pt", 3, 1), entry("c2", "pt", 40, 20)]);
    expect(r.byContest[0].contest.id).toBe("c2");
  });

  it("total geral soma todos os concursos", () => {
    const r = summarizeProgress([entry("c1", "pt", 10, 7), entry("c2", "pt", 40, 20)]);
    expect(r.overall).toEqual({ totalAnswered: 50, totalCorrect: 27 });
  });

  it("não altera o array de entrada", () => {
    const entradas = [entry("c1", "pt", 10, 7)];
    const copia = JSON.stringify(entradas);
    summarizeProgress(entradas);
    expect(JSON.stringify(entradas)).toBe(copia);
  });
});
