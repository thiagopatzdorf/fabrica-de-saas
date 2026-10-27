// Programas (conjuntos de rotinas) prontos e as operações de montar e editar uma rotina. Os modelos são
// dados originais do Fitrich: escolhas de exercícios e faixas de repetição comuns na prática, sem copiar
// programa de ninguém. Uma rotina = um dia de treino (A, B, C...); um programa = as rotinas que se alternam.
import { exercicioPorId, incrementoPadrao } from "./catalogo.mjs";
import { volumeDoPrograma } from "./progressao.mjs";

// Item: [exercício, séries, repsMin, repsMax]
const it = (exercicioId, series, repsMin, repsMax) => ({ exercicioId, series, repsMin, repsMax });
const dia = (pt, en, itens) => ({ nome: { "pt-BR": pt, en }, itens: itens.map((x) => it(...x)) });

export const PROGRAMAS = Object.freeze([
  { id: "full-body", dias: 3, nome: { "pt-BR": "Corpo inteiro", en: "Full body" },
    descricao: { "pt-BR": "Dois dias que se alternam (A, B, A / B, A, B). Bom para 3 treinos por semana.", en: "Two days that alternate (A, B, A / B, A, B). Good for 3 sessions a week." },
    rotinas: [
      dia("A", "A", [["agachamento-livre", 3, 5, 8], ["supino-reto-halteres", 3, 8, 12], ["remada-curvada-barra", 3, 8, 12], ["desenvolvimento-halteres", 2, 8, 12], ["rosca-alternada", 2, 10, 12], ["prancha", 2, 30, 60]]),
      dia("B", "B", [["leg-press", 3, 8, 12], ["supino-inclinado-halteres", 3, 8, 12], ["puxada-frente", 3, 8, 12], ["stiff-halteres", 3, 8, 12], ["elevacao-lateral-halteres", 2, 12, 15], ["crunch-cabo", 2, 10, 15]]),
    ] },
  { id: "upper-lower", dias: 4, nome: { "pt-BR": "Superior e inferior", en: "Upper / lower" },
    descricao: { "pt-BR": "Quatro dias: superior, inferior, superior, inferior. Cada grupo duas vezes por semana.", en: "Four days: upper, lower, upper, lower. Each muscle group twice a week." },
    rotinas: [
      dia("Superior A", "Upper A", [["supino-reto-barra", 3, 5, 8], ["remada-curvada-barra", 3, 6, 10], ["desenvolvimento-halteres", 3, 8, 12], ["puxada-frente", 3, 8, 12], ["rosca-alternada", 2, 10, 12], ["triceps-corda", 2, 10, 12]]),
      dia("Inferior A", "Lower A", [["agachamento-livre", 3, 5, 8], ["stiff-halteres", 3, 8, 12], ["leg-press", 2, 10, 12], ["mesa-flexora", 2, 10, 15], ["panturrilha-em-pe", 3, 10, 15], ["prancha", 2, 30, 60]]),
      dia("Superior B", "Upper B", [["supino-inclinado-halteres", 3, 8, 12], ["remada-unilateral-halter", 3, 8, 12], ["arnold-press", 3, 8, 12], ["barra-fixa-pronada", 3, 5, 10], ["elevacao-lateral-halteres", 3, 12, 15], ["rosca-martelo", 2, 10, 12], ["triceps-frances-halter", 2, 10, 12]]),
      dia("Inferior B", "Lower B", [["agachamento-bulgaro", 3, 8, 12], ["hip-thrust-barra", 3, 8, 12], ["cadeira-extensora", 3, 10, 15], ["cadeira-flexora", 3, 10, 15], ["panturrilha-sentado", 3, 12, 15], ["elevacao-pernas-suspenso", 2, 8, 15]]),
    ] },
  { id: "ppl", dias: 3, nome: { "pt-BR": "Empurrar, puxar, pernas", en: "Push / pull / legs" },
    descricao: { "pt-BR": "Três dias. Com 3 treinos por semana cada grupo entra uma vez; repetindo o ciclo (6 dias) entra duas.", en: "Three days. At 3 sessions a week each group is hit once; repeating the cycle (6 days) hits it twice." },
    rotinas: [
      dia("Empurrar", "Push", [["supino-reto-barra", 4, 5, 8], ["desenvolvimento-halteres", 3, 8, 12], ["supino-inclinado-halteres", 3, 8, 12], ["elevacao-lateral-halteres", 3, 12, 15], ["triceps-corda", 3, 10, 15], ["extensao-triceps-cabo", 2, 10, 15]]),
      dia("Puxar", "Pull", [["barra-fixa-pronada", 4, 5, 10], ["remada-baixa-cabo", 3, 8, 12], ["remada-unilateral-halter", 3, 8, 12], ["face-pull", 3, 12, 15], ["rosca-direta-barra", 3, 8, 12], ["rosca-martelo", 2, 10, 12]]),
      dia("Pernas", "Legs", [["agachamento-livre", 4, 5, 8], ["stiff-barra", 3, 6, 10], ["leg-press", 3, 10, 12], ["cadeira-flexora", 3, 10, 15], ["panturrilha-em-pe", 4, 10, 15], ["crunch-cabo", 3, 10, 15]]),
    ] },
  { id: "abc", dias: 3, nome: { "pt-BR": "ABC", en: "ABC split" },
    descricao: { "pt-BR": "A peito, ombros e tríceps; B costas e bíceps; C pernas. Um dia de descanso entre eles quando der.", en: "A chest, shoulders and triceps; B back and biceps; C legs. A rest day between them when possible." },
    rotinas: [
      dia("A · Peito, ombros, tríceps", "A · Chest, shoulders, triceps", [["supino-reto-barra", 4, 6, 10], ["supino-inclinado-halteres", 3, 8, 12], ["crossover-cabo", 3, 10, 15], ["desenvolvimento-halteres", 3, 8, 12], ["elevacao-lateral-halteres", 3, 12, 15], ["triceps-testa-barra", 3, 8, 12], ["triceps-corda", 3, 10, 15]]),
      dia("B · Costas e bíceps", "B · Back and biceps", [["puxada-frente", 4, 8, 12], ["remada-curvada-barra", 3, 8, 10], ["remada-baixa-cabo", 3, 10, 12], ["crucifixo-inverso-maquina", 3, 12, 15], ["rosca-direta-barra", 3, 8, 12], ["rosca-martelo", 3, 10, 12]]),
      dia("C · Pernas", "C · Legs", [["agachamento-livre", 4, 6, 10], ["leg-press", 3, 10, 12], ["stiff-barra", 3, 8, 10], ["cadeira-extensora", 3, 12, 15], ["mesa-flexora", 3, 10, 15], ["panturrilha-em-pe", 4, 10, 15], ["abdominal-crunch", 3, 12, 20]]),
    ] },
  { id: "abcd", dias: 4, nome: { "pt-BR": "ABCD", en: "ABCD split" },
    descricao: { "pt-BR": "Quatro dias, um foco por dia: peito e tríceps, costas e bíceps, quadríceps, ombros e posteriores.", en: "Four days, one focus each: chest and triceps, back and biceps, quads, shoulders and hamstrings." },
    rotinas: [
      dia("A · Peito e tríceps", "A · Chest and triceps", [["supino-reto-barra", 4, 6, 10], ["supino-inclinado-halteres", 3, 8, 12], ["peck-deck", 3, 10, 15], ["mergulho-paralelas", 3, 6, 12], ["triceps-testa-barra", 3, 8, 12], ["triceps-corda", 3, 10, 15]]),
      dia("B · Costas e bíceps", "B · Back and biceps", [["barra-fixa-pronada", 4, 5, 10], ["remada-curvada-barra", 3, 8, 10], ["remada-unilateral-halter", 3, 8, 12], ["pullover-cabo", 3, 10, 15], ["rosca-direta-barra", 3, 8, 12], ["rosca-inclinada", 3, 10, 12]]),
      dia("C · Quadríceps e panturrilhas", "C · Quads and calves", [["agachamento-livre", 4, 6, 10], ["leg-press", 3, 10, 12], ["agachamento-bulgaro", 3, 8, 12], ["cadeira-extensora", 3, 12, 15], ["panturrilha-em-pe", 4, 10, 15], ["panturrilha-sentado", 3, 12, 15]]),
      dia("D · Ombros, posteriores e core", "D · Shoulders, hamstrings and core", [["desenvolvimento-barra", 4, 6, 10], ["elevacao-lateral-halteres", 4, 12, 15], ["crucifixo-inverso-halteres", 3, 12, 15], ["stiff-barra", 3, 8, 10], ["mesa-flexora", 3, 10, 15], ["elevacao-pernas-suspenso", 3, 8, 15], ["prancha", 3, 30, 60]]),
    ] },
  { id: "calistenia-casa", dias: 3, nome: { "pt-BR": "Calistenia em casa", en: "Home calisthenics" },
    descricao: { "pt-BR": "Sem equipamento, só peso do corpo. O dia C usa uma barra fixa (ou mesa firme para a remada invertida) e um elástico.", en: "No equipment, bodyweight only. Day C uses a pull-up bar (or a sturdy table for the inverted row) and a band." },
    rotinas: [
      dia("A · Empurrar", "A · Push", [["flexao-braco", 4, 8, 15], ["flexao-pes-elevados", 3, 8, 12], ["pike-push-up", 3, 6, 10], ["mergulho-banco", 3, 10, 15], ["prancha", 3, 30, 60]]),
      dia("B · Pernas", "B · Legs", [["agachamento-bulgaro-corporal", 4, 8, 15], ["agachamento-ar", 3, 15, 25], ["ponte-gluteo-unilateral", 3, 10, 15], ["panturrilha-degrau", 3, 12, 20], ["dead-bug", 3, 8, 12]]),
      dia("C · Puxar", "C · Pull", [["remada-invertida", 4, 8, 12], ["barra-fixa-supinada", 3, 4, 8], ["remada-elastico", 3, 12, 15], ["bird-dog", 3, 8, 12], ["prancha-lateral", 3, 20, 45]]),
    ] },
]);
export const programaPorId = (id) => PROGRAMAS.find((p) => p.id === id) ?? null;

// Cria as rotinas (ainda sem gravar) de um programa pronto. Nome na língua da pessoa: depois é dela para editar.
export function montarPrograma(programaId, idioma, { novoId }) {
  const p = programaPorId(programaId);
  if (!p) return [];
  const nomePrograma = p.nome[idioma] ?? p.nome["pt-BR"];
  return p.rotinas.map((r, i) => ({ id: novoId(), nome: r.nome[idioma] ?? r.nome["pt-BR"], programa: nomePrograma, ordem: i + 1, itens: r.itens.map((x) => ({ ...x })) }));
}

// ---- edição de uma lista de itens (cada função devolve a lista nova) ----
export const novoItem = (exercicioId, pessoais = []) => {
  const ex = exercicioPorId(exercicioId, pessoais);
  const base = ex?.padrao === "isolar" ? { series: 3, repsMin: 10, repsMax: 15 } : ex?.equipamento === "peso_corporal" ? { series: 3, repsMin: 8, repsMax: 15 } : { series: 3, repsMin: 6, repsMax: 10 };
  return { exercicioId, ...base };
};
export const adicionarItem = (itens, item) => [...itens, item];
export const removerItem = (itens, i) => itens.filter((_, j) => j !== i);
export const moverItem = (itens, i, delta) => {
  const j = i + delta;
  if (j < 0 || j >= itens.length || i < 0 || i >= itens.length) return itens;
  const r = itens.slice(); [r[i], r[j]] = [r[j], r[i]]; return r;
};
export const trocarExercicio = (itens, i, exercicioId) => itens.map((x, j) => (j === i ? { ...x, exercicioId } : x));
// Muda séries e/ou faixa de repetições mantendo a faixa coerente (min ≤ max).
export function mudarPrescricao(itens, i, { series, repsMin, repsMax }) {
  return itens.map((x, j) => {
    if (j !== i) return x;
    const n = { ...x, ...(series != null ? { series } : {}), ...(repsMin != null ? { repsMin } : {}), ...(repsMax != null ? { repsMax } : {}) };
    if (n.repsMax < n.repsMin) { if (repsMin != null && repsMax == null) n.repsMax = n.repsMin; else n.repsMin = n.repsMax; }
    return n;
  });
}
export const incrementoDoItem = (item, pessoais = []) => item.incremento ?? incrementoPadrao(exercicioPorId(item.exercicioId, pessoais));

// Quantas séries por grupo a rotina (ou um conjunto) entrega por semana, se feita uma vez.
export const volumeDaRotina = (rotinas, pessoais = []) => volumeDoPrograma(rotinas, pessoais);
