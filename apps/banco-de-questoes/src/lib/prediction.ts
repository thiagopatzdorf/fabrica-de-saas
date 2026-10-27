/**
 * Modelo de predição v1 — "chance de passar".
 *
 * Deliberadamente NÃO é machine learning: é uma média ponderada, transparente
 * e fácil de explicar ao usuário (e de ajustar depois, ver `PREDICTION_WEIGHTS`).
 *
 * chance = acertosPonderados * 0.6 + volumeNormalizado * 0.25 + consistencia * 0.15
 *
 * - acertosPonderados: mistura o acerto geral do usuário no concurso com o
 *   acerto por matéria ponderado pelo peso de cada matéria no edital. Uma
 *   matéria de peso alto (ex: 40%) pesa mais no resultado do que uma de
 *   peso baixo (ex: 10%) — assim como pesaria na nota real da prova.
 * - volumeNormalizado: quantidade de questões respondidas no concurso,
 *   normalizada por uma meta de prática (`VOLUME_TARGET_QUESTIONS`). Poucas
 *   questões respondidas não sustentam uma estimativa confiável.
 * - consistencia: acerto nas últimas N respostas (`RECENT_WINDOW_SIZE`),
 *   captando se o desempenho recente está melhorando, piorando ou estável.
 */

export const PREDICTION_WEIGHTS = {
  weightedAccuracy: 0.6,
  volume: 0.25,
  consistency: 0.15,
} as const;

// Quantidade de questões respondidas (no concurso) considerada suficiente
// para uma estimativa confiável. Acima disso, o fator de volume satura em 1.
export const VOLUME_TARGET_QUESTIONS = 150;

// Nº de respostas mais recentes usadas para medir consistência.
export const RECENT_WINDOW_SIZE = 20;

// Acerto por matéria abaixo deste limiar é sinalizado como ponto fraco.
const WEAK_SUBJECT_ACCURACY_THRESHOLD = 0.6;

export type SubjectPerformanceInput = {
  subjectId: string;
  subjectName: string;
  /** Peso da matéria no edital, em % (0-100). */
  weight: number;
  totalAnswered: number;
  totalCorrect: number;
};

export type PredictionInput = {
  subjectPerformances: SubjectPerformanceInput[];
  totalAnswered: number;
  totalCorrect: number;
  /** true/false de acerto das últimas respostas, mais recente primeiro. */
  recentAnswersCorrect: boolean[];
};

export type WeakSubject = {
  subjectId: string;
  subjectName: string;
  weight: number;
  accuracy: number;
  totalAnswered: number;
};

export type PredictionResult = {
  /** Chance estimada de aprovação, de 0 a 100. */
  chancePercent: number;
  breakdown: {
    weightedAccuracy: number;
    volume: number;
    consistency: number;
  };
  overallAccuracy: number;
  totalAnswered: number;
  /** Matérias com peso relevante no edital e desempenho abaixo do esperado. */
  weakSubjects: WeakSubject[];
};

function accuracyOf(correct: number, answered: number): number {
  if (answered === 0) return 0;
  return correct / answered;
}

export function calculatePassChance(input: PredictionInput): PredictionResult {
  const { subjectPerformances, totalAnswered, totalCorrect, recentAnswersCorrect } = input;

  const overallAccuracy = accuracyOf(totalCorrect, totalAnswered);

  // Acerto por matéria, ponderado pelo peso de cada matéria no edital.
  // Matérias ainda não praticadas entram com acerto 0, o que corretamente
  // reduz a estimativa até que o usuário pratique todas as áreas do edital.
  const totalWeight = subjectPerformances.reduce((sum, s) => sum + s.weight, 0) || 1;
  const subjectWeightedAccuracy =
    subjectPerformances.reduce((sum, s) => {
      const accuracy = accuracyOf(s.totalCorrect, s.totalAnswered);
      return sum + accuracy * (s.weight / totalWeight);
    }, 0) || 0;

  // Combina acerto geral (metade do peso) com acerto por matéria ponderado
  // pelo edital (a outra metade), como pedido no escopo do MVP.
  const weightedAccuracy = overallAccuracy * 0.5 + subjectWeightedAccuracy * 0.5;

  const volume = Math.min(totalAnswered / VOLUME_TARGET_QUESTIONS, 1);

  const recentWindow = recentAnswersCorrect.slice(0, RECENT_WINDOW_SIZE);
  const consistency =
    recentWindow.length > 0
      ? recentWindow.filter(Boolean).length / recentWindow.length
      : 0;

  const chance =
    weightedAccuracy * PREDICTION_WEIGHTS.weightedAccuracy +
    volume * PREDICTION_WEIGHTS.volume +
    consistency * PREDICTION_WEIGHTS.consistency;

  const weakSubjects = subjectPerformances
    .map((s) => ({
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      weight: s.weight,
      accuracy: accuracyOf(s.totalCorrect, s.totalAnswered),
      totalAnswered: s.totalAnswered,
    }))
    .filter((s) => s.accuracy < WEAK_SUBJECT_ACCURACY_THRESHOLD)
    // Prioriza matérias que mais pesam no edital e que têm o pior desempenho.
    .sort((a, b) => b.weight * (1 - b.accuracy) - a.weight * (1 - a.accuracy) || b.weight - a.weight)
    .slice(0, 3);

  return {
    chancePercent: Math.round(chance * 1000) / 10,
    breakdown: {
      weightedAccuracy: Math.round(weightedAccuracy * 1000) / 10,
      volume: Math.round(volume * 1000) / 10,
      consistency: Math.round(consistency * 1000) / 10,
    },
    overallAccuracy: Math.round(overallAccuracy * 1000) / 10,
    totalAnswered,
    weakSubjects,
  };
}
