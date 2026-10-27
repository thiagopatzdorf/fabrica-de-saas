import { describe, expect, it } from "vitest";

import {
  calculatePassChance,
  PREDICTION_WEIGHTS,
  RECENT_WINDOW_SIZE,
  VOLUME_TARGET_QUESTIONS,
  type SubjectPerformanceInput,
} from "./prediction";

const subj = (
  id: string,
  weight: number,
  totalAnswered: number,
  totalCorrect: number
): SubjectPerformanceInput => ({
  subjectId: id,
  subjectName: id,
  weight,
  totalAnswered,
  totalCorrect,
});

describe("calculatePassChance", () => {
  it("usuário sem nenhuma resposta tem chance 0 e não vira NaN por divisão por zero", () => {
    const r = calculatePassChance({
      subjectPerformances: [subj("a", 50, 0, 0), subj("b", 50, 0, 0)],
      totalAnswered: 0,
      totalCorrect: 0,
      recentAnswersCorrect: [],
    });
    expect(r.chancePercent).toBe(0);
    expect(r.overallAccuracy).toBe(0);
    expect(Number.isNaN(r.chancePercent)).toBe(false);
  });

  it("edital sem matérias não quebra (soma de pesos zero)", () => {
    const r = calculatePassChance({
      subjectPerformances: [],
      totalAnswered: 0,
      totalCorrect: 0,
      recentAnswersCorrect: [],
    });
    expect(r.chancePercent).toBe(0);
    expect(r.weakSubjects).toEqual([]);
  });

  it("desempenho perfeito com volume na meta chega a 100%", () => {
    const r = calculatePassChance({
      subjectPerformances: [subj("a", 60, 90, 90), subj("b", 40, 60, 60)],
      totalAnswered: VOLUME_TARGET_QUESTIONS,
      totalCorrect: VOLUME_TARGET_QUESTIONS,
      recentAnswersCorrect: Array(RECENT_WINDOW_SIZE).fill(true),
    });
    expect(r.chancePercent).toBe(100);
  });

  it("os pesos do modelo somam 1, senão a chance passaria de 100% ou nunca chegaria", () => {
    const soma =
      PREDICTION_WEIGHTS.weightedAccuracy + PREDICTION_WEIGHTS.volume + PREDICTION_WEIGHTS.consistency;
    expect(soma).toBeCloseTo(1, 10);
  });

  it("volume satura em 100% acima da meta: responder mais não infla a chance", () => {
    const base = {
      subjectPerformances: [subj("a", 100, 150, 75)],
      totalCorrect: 75,
      recentAnswersCorrect: [true, false],
    };
    const naMeta = calculatePassChance({ ...base, totalAnswered: 150 });
    const muitoAcima = calculatePassChance({
      ...base,
      subjectPerformances: [subj("a", 100, 1500, 750)],
      totalAnswered: 1500,
      totalCorrect: 750,
    });
    expect(naMeta.breakdown.volume).toBe(100);
    expect(muitoAcima.breakdown.volume).toBe(100);
    expect(muitoAcima.chancePercent).toBe(naMeta.chancePercent);
  });

  it("pouca prática pesa: 15 questões todas certas dão volume de 10%, não 100%", () => {
    const r = calculatePassChance({
      subjectPerformances: [subj("a", 100, 15, 15)],
      totalAnswered: 15,
      totalCorrect: 15,
      recentAnswersCorrect: Array(15).fill(true),
    });
    expect(r.breakdown.volume).toBe(10);
    expect(r.chancePercent).toBeLessThan(100);
  });

  it("matéria não praticada derruba a estimativa em relação a ter praticado", () => {
    const praticou = calculatePassChance({
      subjectPerformances: [subj("a", 50, 50, 40), subj("b", 50, 50, 40)],
      totalAnswered: 100,
      totalCorrect: 80,
      recentAnswersCorrect: [true],
    });
    const ignorou = calculatePassChance({
      subjectPerformances: [subj("a", 50, 100, 80), subj("b", 50, 0, 0)],
      totalAnswered: 100,
      totalCorrect: 80,
      recentAnswersCorrect: [true],
    });
    expect(ignorou.chancePercent).toBeLessThan(praticou.chancePercent);
  });

  it("matéria de peso alto vai mais fundo na nota do que a de peso baixo", () => {
    const forteNaPesada = calculatePassChance({
      subjectPerformances: [subj("pesada", 90, 50, 50), subj("leve", 10, 50, 0)],
      totalAnswered: 100,
      totalCorrect: 50,
      recentAnswersCorrect: [],
    });
    const forteNaLeve = calculatePassChance({
      subjectPerformances: [subj("pesada", 90, 50, 0), subj("leve", 10, 50, 50)],
      totalAnswered: 100,
      totalCorrect: 50,
      recentAnswersCorrect: [],
    });
    expect(forteNaPesada.chancePercent).toBeGreaterThan(forteNaLeve.chancePercent);
  });

  it("consistência olha só a janela recente: respostas antigas ruins não pesam", () => {
    const recentes = Array(RECENT_WINDOW_SIZE).fill(true);
    const antigas = Array(50).fill(false);
    const r = calculatePassChance({
      subjectPerformances: [subj("a", 100, 10, 10)],
      totalAnswered: 10,
      totalCorrect: 10,
      recentAnswersCorrect: [...recentes, ...antigas],
    });
    expect(r.breakdown.consistency).toBe(100);
  });

  it("resultado fica sempre entre 0 e 100", () => {
    for (const acertos of [0, 1, 50, 150]) {
      const r = calculatePassChance({
        subjectPerformances: [subj("a", 100, 150, acertos)],
        totalAnswered: 150,
        totalCorrect: acertos,
        recentAnswersCorrect: Array(20).fill(acertos > 0),
      });
      expect(r.chancePercent).toBeGreaterThanOrEqual(0);
      expect(r.chancePercent).toBeLessThanOrEqual(100);
    }
  });

  it("arredonda a uma casa decimal (1 acerto em 3 = 33.3%, não 33.333...)", () => {
    const r = calculatePassChance({
      subjectPerformances: [subj("a", 100, 3, 1)],
      totalAnswered: 3,
      totalCorrect: 1,
      recentAnswersCorrect: [],
    });
    expect(r.overallAccuracy).toBe(33.3);
  });
});

describe("pontos fracos (weakSubjects)", () => {
  it("matéria com 60% ou mais não é ponto fraco; abaixo disso é", () => {
    const r = calculatePassChance({
      subjectPerformances: [subj("ok", 50, 10, 6), subj("fraca", 50, 10, 5)],
      totalAnswered: 20,
      totalCorrect: 11,
      recentAnswersCorrect: [],
    });
    expect(r.weakSubjects.map((s) => s.subjectId)).toEqual(["fraca"]);
  });

  it("ordena por prejuízo real (peso x erro): peso 20 com 10% de acerto vem antes de peso 30 com 55%", () => {
    // prejuízo: b = 20 * 0.9 = 18; a = 30 * 0.45 = 13.5
    const r = calculatePassChance({
      subjectPerformances: [subj("a", 30, 100, 55), subj("b", 20, 100, 10)],
      totalAnswered: 200,
      totalCorrect: 65,
      recentAnswersCorrect: [],
    });
    expect(r.weakSubjects.map((s) => s.subjectId)).toEqual(["b", "a"]);
  });

  it("mostra no máximo 3 pontos fracos", () => {
    const r = calculatePassChance({
      subjectPerformances: ["a", "b", "c", "d", "e"].map((id) => subj(id, 20, 10, 0)),
      totalAnswered: 50,
      totalCorrect: 0,
      recentAnswersCorrect: [],
    });
    expect(r.weakSubjects).toHaveLength(3);
  });

  it("matéria nunca praticada aparece como ponto fraco com acerto 0", () => {
    const r = calculatePassChance({
      subjectPerformances: [subj("nova", 40, 0, 0)],
      totalAnswered: 0,
      totalCorrect: 0,
      recentAnswersCorrect: [],
    });
    expect(r.weakSubjects[0]).toMatchObject({ subjectId: "nova", accuracy: 0, totalAnswered: 0 });
  });
});
