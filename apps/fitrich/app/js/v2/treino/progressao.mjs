// Sobrecarga progressiva, volume semanal por grupo muscular, platô e deload. Tudo determinístico: a mesma
// história devolve a mesma sugestão, sem sorteio e sem "intuição". Nenhuma saída julga a pessoa: são códigos
// (`acao`, `motivo`) que a tela traduz em frase neutra. Fontes e decisões: docs/pesquisa-treino.md.
import { segundaDaSemana, somarDias, diasEntre } from "../../datas.mjs";
import { arred, arredondarCarga, e1rm } from "./formulas.mjs";
import { exercicioPorId, incrementoPadrao } from "./catalogo.mjs";

// Faixa de evidência para hipertrofia: 10–20 séries por grupo por semana (Schoenfeld 2017: ≥10 supera <10;
// Pelland 2024: retorno decrescente claro acima de ~12–20). É referência, não meta obrigatória: quem prioriza
// outro grupo pode ficar abaixo em muitos deles sem nenhum problema.
export const FAIXA_VOLUME = Object.freeze({ min: 10, max: 20 });
export const PESO_SECUNDARIO = 0.5;
export const RIR_ALVO = Object.freeze({ min: 1, max: 3 });

const trabalho = (s) => s && !s.aquecimento && s.reps >= 1;
export const concluida = (x) => x && x.estado !== "andamento";

// Séries de trabalho de um exercício numa sessão.
export const seriesDeTrabalho = (sessao, exercicioId) => (sessao?.series ?? []).filter((s) => s.exercicioId === exercicioId && trabalho(s));

// Histórico do exercício, do mais antigo ao mais recente, só sessões concluídas e só séries de trabalho.
// `antesDe` (ISO, exclusivo) deixa conferir o que valia antes de uma data (recordes, "última vez").
export function historicoDoExercicio(sessoes, exercicioId, { antesDe = null } = {}) {
  return [...sessoes].filter((x) => concluida(x) && (!antesDe || x.data < antesDe)).sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.id < b.id ? -1 : 1))
    .map((x) => ({ data: x.data, sessaoId: x.id, series: seriesDeTrabalho(x, exercicioId) })).filter((x) => x.series.length);
}

const maior = (xs) => xs.reduce((m, v) => (m == null || v > m ? v : m), null);
// Métrica de força de uma sessão: melhor 1RM estimado; sem carga (peso do corpo) cai para o máximo de repetições.
export function metricaDaSessao(h) {
  const est = h.series.map((s) => (s.kg > 0 ? e1rm(s.kg, s.reps, s.rir ?? 0) : null)).filter((v) => v != null);
  return est.length ? { tipo: "e1rm", valor: maior(est) } : { tipo: "reps", valor: maior(h.series.map((s) => s.reps)) };
}

// ---------- dupla progressão ----------
// Faixa de repetições (ex.: 8–12) e uma carga. Enquanto não bate o topo da faixa em TODAS as séries, a carga
// fica e a meta é +1 repetição; batendo, sobe um degrau e volta ao piso da faixa. Duas sessões seguidas abaixo
// do piso sugerem uma carga ~5% menor (a carga estava alta demais para essa faixa, não é retrocesso).
// item = { series, repsMin, repsMax, incremento? }. Devolve { acao, kg, repsAlvo, ultima } com acao em
// "inicio" | "subir" | "manter" | "mais_reps" | "reduzir" | "variacao".
export function sugerirProxima(historico, item, exercicio = null) {
  const { series: prescritas = 3, repsMin = 8, repsMax = 12 } = item;
  const inc = item.incremento ?? incrementoPadrao(exercicio);
  if (!historico.length) return { acao: "inicio", kg: null, repsAlvo: repsMin, ultima: null };
  const ult = historico[historico.length - 1], kgRef = maior(ult.series.map((s) => s.kg)) ?? 0;
  const naCarga = ult.series.filter((s) => s.kg === kgRef);
  const minReps = Math.min(...naCarga.map((s) => s.reps));
  const base = { ultima: { data: ult.data, series: ult.series.map((s) => ({ kg: s.kg, reps: s.reps, rir: s.rir ?? null })) } };
  if (minReps >= repsMax && naCarga.length >= prescritas) {
    return inc > 0 ? { ...base, acao: "subir", kg: arredondarCarga(kgRef + inc, inc), repsAlvo: repsMin } : { ...base, acao: "variacao", kg: kgRef, repsAlvo: repsMax };
  }
  if (minReps < repsMin) {
    const ant = historico[historico.length - 2];
    const antRef = ant ? maior(ant.series.map((s) => s.kg)) ?? 0 : null;
    const antMin = ant ? Math.min(...ant.series.filter((s) => s.kg === antRef).map((s) => s.reps)) : null;
    if (ant && antMin < repsMin && antRef >= kgRef && kgRef > 0 && inc > 0) return { ...base, acao: "reduzir", kg: arredondarCarga(kgRef * 0.95, inc), repsAlvo: repsMin };
    return { ...base, acao: "manter", kg: kgRef, repsAlvo: repsMin };
  }
  const alvo = Math.min(repsMax, minReps + 1);
  return { ...base, acao: naCarga.length < prescritas ? "mais_reps" : "manter", kg: kgRef, repsAlvo: naCarga.length < prescritas ? Math.max(minReps, repsMin) : alvo };
}

// ---------- platô ----------
// Platô = nas últimas 4 sessões do exercício (cobrindo ≥ 14 dias) a melhor métrica não passou 1% da melhor das
// anteriores. Exige 5 sessões ou mais. É um convite a olhar sono, volume e técnica; nunca uma falha da pessoa.
export function detectarPlato(historico, { janela = 4, ganhoMinimo = 0.01, diasMinimos = 14 } = {}) {
  if (historico.length < janela + 1) return { plato: false, motivo: "pouca_historia" };
  const recentes = historico.slice(-janela), anteriores = historico.slice(0, -janela);
  if (diasEntre(recentes[0].data, recentes[recentes.length - 1].data) < diasMinimos) return { plato: false, motivo: "janela_curta" };
  const mr = recentes.map(metricaDaSessao), ma = anteriores.map(metricaDaSessao);
  if (mr.some((m) => m.tipo !== mr[0].tipo) || ma.some((m) => m.tipo !== mr[0].tipo)) return { plato: false, motivo: "metrica_mudou" };
  const melhorRecente = maior(mr.map((m) => m.valor)), melhorAntes = maior(ma.map((m) => m.valor));
  const plato = melhorRecente < melhorAntes * (1 + ganhoMinimo);
  return { plato, motivo: plato ? "sem_avanco" : "avancando", melhorRecente: arred(melhorRecente, 1), melhorAntes: arred(melhorAntes, 1), sessoes: janela, tipo: mr[0].tipo };
}

// Exercícios com platô entre os feitos nas últimas 6 semanas.
export function platosDaPessoa(sessoes, pessoais, hoje, { semanas = 6 } = {}) {
  const corte = somarDias(hoje, -7 * semanas), ids = new Set();
  for (const x of sessoes) if (concluida(x) && x.data >= corte && x.data <= hoje) for (const s of x.series ?? []) if (trabalho(s)) ids.add(s.exercicioId);
  const ate = sessoes.filter((x) => x.data <= hoje);
  return [...ids].map((id) => ({ exercicioId: id, ...detectarPlato(historicoDoExercicio(ate, id)) })).filter((p) => p.plato);
}

// ---------- volume semanal ----------
// Séries por grupo muscular na semana (segunda a domingo) que contém `ref`: primário conta 1, secundário 0,5.
export function volumeSemanal(sessoes, pessoais, ref) {
  const seg = segundaDaSemana(ref), fim = somarDias(seg, 6), grupos = {};
  let series = 0;
  for (const x of sessoes) {
    if (!concluida(x) || x.data < seg || x.data > fim) continue;
    for (const s of x.series ?? []) {
      if (!trabalho(s)) continue;
      const ex = exercicioPorId(s.exercicioId, pessoais);
      if (!ex) continue;
      series++;
      for (const g of ex.primarios) grupos[g] = (grupos[g] ?? 0) + 1;
      for (const g of ex.secundarios) grupos[g] = (grupos[g] ?? 0) + PESO_SECUNDARIO;
    }
  }
  return { inicio: seg, fim, series, grupos };
}
export function faixaDeVolume(v) {
  if (!(v > 0)) return "sem_registro";
  return v < FAIXA_VOLUME.min ? "abaixo" : v <= FAIXA_VOLUME.max ? "na_faixa" : "acima";
}
// Séries por semana por grupo de um programa (cada rotina feita uma vez por semana): mostra, ao montar, o que o
// programa entrega antes de treinar.
export function volumeDoPrograma(rotinas, pessoais = []) {
  const grupos = {};
  for (const r of rotinas) for (const it of r.itens ?? []) {
    const ex = exercicioPorId(it.exercicioId, pessoais);
    if (!ex) continue;
    for (const g of ex.primarios) grupos[g] = (grupos[g] ?? 0) + it.series;
    for (const g of ex.secundarios) grupos[g] = (grupos[g] ?? 0) + it.series * PESO_SECUNDARIO;
  }
  return grupos;
}
// Série de volume das últimas `n` semanas (a atual é a última).
export function seriesPorSemana(sessoes, hoje, n = 12) {
  const seg = segundaDaSemana(hoje), out = [];
  for (let k = n - 1; k >= 0; k--) { const ini = somarDias(seg, -7 * k), fim = somarDias(ini, 6); let c = 0; for (const x of sessoes) if (concluida(x) && x.data >= ini && x.data <= fim) c += (x.series ?? []).filter(trabalho).length; out.push({ inicio: ini, series: c }); }
  return out;
}

// ---------- deload ----------
// Semanas seguidas de treino sem uma semana leve. Semana leve = zero séries (fora a atual) ou menos de 60% da
// média das 4 anteriores com treino. Consenso de especialistas (Bell 2023): deload a cada 4–8 semanas, 5–7 dias,
// 40–60% menos volume mantendo os exercícios.
export function semanasContinuas(sessoes, hoje, n = 16) {
  const w = seriesPorSemana(sessoes, hoje, n), atual = w.length - 1;
  let leve = -1;
  for (let i = 1; i < w.length; i++) {
    const ant = w.slice(Math.max(0, i - 4), i).map((x) => x.series).filter((v) => v > 0);
    const media = ant.length ? ant.reduce((s, v) => s + v, 0) / ant.length : 0;
    if (i < atual ? w[i].series === 0 || (media > 0 && w[i].series < 0.6 * media) : false) leve = i;
  }
  let c = 0;
  for (let i = leve + 1; i < w.length; i++) if (w[i].series > 0) c++;
  return c;
}
// Sugestão de deload: 8+ semanas contínuas, ou 6+ com 2 ou mais exercícios em platô. Sempre convite.
export function sugerirDeload(sessoes, pessoais, hoje) {
  const semanas = semanasContinuas(sessoes, hoje), platos = platosDaPessoa(sessoes, pessoais, hoje).length, motivos = [];
  if (semanas >= 8) motivos.push("tempo");
  if (semanas >= 6 && platos >= 2) motivos.push("platos");
  return { sugerir: motivos.length > 0, motivos, semanas, platos, reducaoPct: 50, dias: 7 };
}
