// Recordes pessoais por exercício: maior carga, melhor 1RM estimado, mais repetições e maior tonelagem de uma
// sessão. Só conta série de trabalho (aquecimento não). O primeiro registro de um exercício é a linha de base,
// não um recorde: `novosRecordes` só acusa quando já havia algo para superar.
import { e1rm, tonelagem } from "./formulas.mjs";
import { historicoDoExercicio } from "./progressao.mjs";

const melhorQue = (atual, v) => atual == null || v > atual.valor;

export function recordesDoExercicio(sessoes, exercicioId, { antesDe = null } = {}) {
  const r = { carga: null, e1rm: null, reps: null, tonelagemSessao: null };
  for (const h of historicoDoExercicio(sessoes, exercicioId, { antesDe })) {
    let ton = 0;
    for (const s of h.series) {
      ton += tonelagem(s.kg, s.reps);
      if (s.kg > 0 && melhorQue(r.carga, s.kg)) r.carga = { valor: s.kg, reps: s.reps, data: h.data };
      const est = s.kg > 0 ? e1rm(s.kg, s.reps, s.rir ?? 0) : null;
      if (est != null && melhorQue(r.e1rm, est)) r.e1rm = { valor: est, kg: s.kg, reps: s.reps, data: h.data };
      // Repetições só valem como recorde na mesma carga ou maior (10 reps com 20 kg não superam 8 reps com 40 kg).
      if (melhorQue(r.reps, s.reps) && (r.reps == null || s.kg >= (r.reps.kg ?? 0))) r.reps = { valor: s.reps, kg: s.kg, data: h.data };
    }
    if (ton > 0 && melhorQue(r.tonelagemSessao, ton)) r.tonelagemSessao = { valor: ton, data: h.data };
  }
  return r;
}

// Uma série nova superou os recordes anteriores? `anteriores` vem de `recordesDoExercicio` (sem esta sessão).
// Devolve a lista de tipos: "carga" | "e1rm" | "reps". Vazia na linha de base ou em série de aquecimento.
export function novosRecordes(anteriores, serie) {
  if (!serie || serie.aquecimento || !(serie.reps >= 1) || !anteriores) return [];
  if (!anteriores.carga && !anteriores.e1rm && !anteriores.reps) return [];
  const out = [];
  if (serie.kg > 0 && anteriores.carga && serie.kg > anteriores.carga.valor) out.push("carga");
  const est = serie.kg > 0 ? e1rm(serie.kg, serie.reps, serie.rir ?? 0) : null;
  if (est != null && anteriores.e1rm && est > anteriores.e1rm.valor * 1.0001) out.push("e1rm");
  if (!(serie.kg > 0) && anteriores.reps && serie.reps > anteriores.reps.valor && serie.kg >= (anteriores.reps.kg ?? 0)) out.push("reps");
  return out;
}

// Todos os exercícios com algum recorde, do mais recente ao mais antigo (para a lista do Progresso).
export function recordesDaPessoa(sessoes) {
  const ids = new Set();
  for (const x of sessoes) for (const s of x.series ?? []) if (!s.aquecimento) ids.add(s.exercicioId);
  return [...ids].map((id) => ({ exercicioId: id, ...recordesDoExercicio(sessoes, id) })).filter((r) => r.carga || r.e1rm || r.reps).sort((a, b) => ((b.e1rm?.data ?? b.reps?.data ?? "") < (a.e1rm?.data ?? a.reps?.data ?? "") ? -1 : 1));
}
