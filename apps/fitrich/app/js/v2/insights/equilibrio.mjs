// Pontuação de equilíbrio (eudaimonia), OPCIONAL e transparente. Quatro eixos, cada um com a CONTA à vista e
// uma FAIXA, nunca um número único que julgue a pessoa. A ideia é a do meio-termo aristotélico: virtude é o ponto
// entre a falta e o excesso, então cada eixo tem uma faixa de equilíbrio e os dois lados dela têm nome ("falta" e
// "excesso"), com texto gentil nos dois. Eixo sem dado fica "sem dado": nunca vira zero nem nota baixa.
import { segundaDaSemana, somarDias } from "../../datas.mjs";
import { contexto, mediaDe, mediana, minutosDe, soma, sonosDoEstado, treinosEntre } from "./base.mjs";

// Faixas de equilíbrio e a razão de cada uma (fontes em docs/pesquisa-revisao.md):
//  dinheiro   poupança 10% a 50% da receita (mediana de 3 meses fechados; a regra clássica dos 20% fica no meio da faixa)
//  corpo      150 a 450 min de atividade por semana (OMS: 150 a 300 já traz o benefício; até 1,5× disso não é excesso)
//  descanso   horas de sono 7 a 9 por noite (média de 14 dias, ≥ 7 registros); sem sono registrado, 2 a 7 dias sem treino na semana
//  constância semanas fechadas com algum registro, de 5 a 8 entre as últimas 8 ("X das últimas 8 semanas"; nunca sequência)
export const FAIXAS = Object.freeze({
  dinheiro: { lo: 1000, hi: 5000, unidade: "bp" },
  corpo: { lo: 150, hi: 450, unidade: "min" },
  descanso_sono: { lo: 7, hi: 9, unidade: "h" },
  descanso_folga: { lo: 2, hi: 7, unidade: "dias" },
  constancia: { lo: 5, hi: 8, unidade: "semanas" },
});

const faixaDe = (v, { lo, hi }) => (v < lo ? "falta" : v > hi ? "excesso" : "equilibrio");
const semDado = (id) => ({ id, faixa: "sem_dado", valor: null, conta: [], limites: null, variante: null });

// Sono: vem do `bemestar` (tela Corpo) ou de uma lista `sonos` de { data, horas }. Sem ela, o eixo usa a folga de treino.
const sonosDe = sonosDoEstado;

export function equilibrio(d, hoje) {
  const ctx = contexto(d, hoje);
  const seg = segundaDaSemana(hoje), ult = somarDias(seg, -7);
  const semanas = (n) => Array.from({ length: n }, (_, i) => { const ini = somarDias(ult, -7 * (n - 1 - i)); return { inicio: ini, fim: somarDias(ini, 6) }; });

  // dinheiro
  let dinheiro = semDado("dinheiro");
  const taxas = ctx.meses(3).map((ym) => ({ ym, bp: ctx.taxaBp(ym) })).filter((x) => x.bp != null);
  if (taxas.length >= 2) { const v = Math.round(mediana(taxas.map((x) => x.bp))); dinheiro = { id: "dinheiro", valor: v, limites: FAIXAS.dinheiro, faixa: faixaDe(v, FAIXAS.dinheiro), conta: taxas, variante: null }; }

  // corpo: minutos por semana (média das 4 semanas fechadas); sem nenhum treino nas 8 semanas, não há dado
  let corpo = semDado("corpo");
  const s4 = semanas(4).map((s) => ({ inicio: s.inicio, minutos: minutosDe(treinosEntre(ctx.treinos, s.inicio, s.fim)) }));
  if (ctx.treinos.length && ctx.treinos.some((t) => t.data >= somarDias(ult, -49))) { const v = Math.round(mediaDe(s4.map((s) => s.minutos))); corpo = { id: "corpo", valor: v, limites: FAIXAS.corpo, faixa: faixaDe(v, FAIXAS.corpo), conta: s4, variante: null }; }

  // descanso
  let descanso = semDado("descanso");
  const sonos = sonosDe(d).filter((s) => s.data <= hoje && s.data > somarDias(hoje, -14));
  if (sonos.length >= 7) { const v = Math.round(mediaDe(sonos.map((s) => s.horas)) * 10) / 10; descanso = { id: "descanso", valor: v, limites: FAIXAS.descanso_sono, faixa: faixaDe(v, FAIXAS.descanso_sono), conta: sonos.map((s) => ({ data: s.data, horas: s.horas })), variante: "sono" }; }
  else if (ctx.treinos.some((t) => t.data >= somarDias(ult, -49))) {
    const folgas = semanas(4).map((s) => ({ inicio: s.inicio, dias: 7 - new Set(treinosEntre(ctx.treinos, s.inicio, s.fim).map((t) => t.data)).size }));
    const v = Math.round(mediaDe(folgas.map((f) => f.dias)) * 10) / 10;
    descanso = { id: "descanso", valor: v, limites: FAIXAS.descanso_folga, faixa: faixaDe(v, FAIXAS.descanso_folga), conta: folgas, variante: "folga" };
  }

  // constância: semanas com pelo menos um registro de qualquer tipo. Exige 4 semanas de uso para não punir quem chegou agora.
  let constancia = semDado("constancia");
  const todasAsDatas = [...(d.lancamentos ?? []), ...(d.pesos ?? []), ...(d.treinos ?? []), ...(d.medidas ?? [])].map((x) => x.data).filter((x) => x <= hoje);
  if (todasAsDatas.length && ctx.diasDesde(todasAsDatas.reduce((m, x) => (x < m ? x : m))) >= 28) {
    const s8 = semanas(8).map((s) => ({ inicio: s.inicio, registros: todasAsDatas.filter((x) => x >= s.inicio && x <= s.fim).length }));
    const v = s8.filter((s) => s.registros > 0).length;
    constancia = { id: "constancia", valor: v, limites: FAIXAS.constancia, faixa: faixaDe(v, FAIXAS.constancia), conta: s8, variante: null };
  }
  const eixos = [dinheiro, corpo, descanso, constancia];
  return { eixos, comDado: eixos.filter((e) => e.faixa !== "sem_dado").length, emEquilibrio: eixos.filter((e) => e.faixa === "equilibrio").length };
}
