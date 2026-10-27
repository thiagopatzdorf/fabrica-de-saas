// Tendência de peso: média móvel exponencial (Hacker's Diet, John Walker) + taxa semanal com faixa de incerteza
// + projeção até a meta. Pura. O peso de um dia é ruído (água, sal, intestino: 1–2 kg); a tendência é o sinal.
import { dia, somarDias } from "../../datas.mjs";

const arred = (v, c) => Math.round(v * 10 ** c) / 10 ** c;
// Parâmetro de suavização: 0,1 por dia (o do livro: cada pesagem puxa a tendência 10% do caminho até ela).
export const ALFA = 0.1;
// Valor crítico t (bicaudal, 95%) por graus de liberdade: pouca pesagem = faixa larga, de propósito.
const T95 = [0, 12.71, 4.3, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23];
export const tCritico = (gl) => (gl < 1 ? Infinity : gl <= 10 ? T95[gl] : gl <= 20 ? 2.1 : gl <= 30 ? 2.05 : 1.97);

// Um ponto por dia (média se houver mais de uma pesagem no mesmo dia), em ordem de data.
export function pesosPorDia(pesos) {
  const m = new Map();
  for (const p of pesos) { const a = m.get(p.data) ?? { s: 0, n: 0 }; a.s += p.kg; a.n++; m.set(p.data, a); }
  return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([data, a]) => ({ data, kg: a.s / a.n }));
}

// Tendência com buraco no calendário: o fator vale por DIA, então depois de g dias sem pesar o peso novo pesa
// 1 − (1 − α)^g (g=1 → α, igual ao livro). Primeira pesagem = ponto de partida.
export function tendenciaEma(pesos, { alfa = ALFA } = {}) {
  const dias = pesosPorDia(pesos), saida = [];
  let t = null, anterior = null;
  for (const p of dias) {
    if (t == null) t = p.kg;
    else { const g = dia(p.data) - dia(anterior); t += (1 - (1 - alfa) ** g) * (p.kg - t); }
    anterior = p.data;
    saida.push({ data: p.data, kg: arred(p.kg, 2), tendencia: arred(t, 3) });
  }
  return saida;
}

// Taxa semanal por mínimos quadrados nos pesos CRUS dos últimos `dias` dias, com erro-padrão da inclinação.
// null com pouco dado (< 4 dias pesados ou menos de 14 dias de intervalo): não se anuncia ritmo com 3 pontos.
export function taxaSemanal(pesos, hoje, { dias = 28 } = {}) {
  const ini = dia(hoje) - dias;
  const pts = pesosPorDia(pesos).filter((p) => dia(p.data) >= ini && dia(p.data) <= dia(hoje));
  if (pts.length < 4) return null;
  const xs = pts.map((p) => (dia(p.data) - ini) / 7), ys = pts.map((p) => p.kg);
  if ((Math.max(...xs) - Math.min(...xs)) * 7 < 14) return null;
  const n = pts.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0), sxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const b = sxy / sxx, a = my - b * mx;
  const ssr = xs.reduce((s, x, i) => s + (ys[i] - (a + b * x)) ** 2, 0);
  const se = Math.sqrt(ssr / (n - 2) / sxx), margem = tCritico(n - 2) * se;
  return { kgPorSemana: arred(b, 3), erroPadrao: arred(se, 3), margem: arred(margem, 3), pontos: n, dias: Math.round((Math.max(...xs) - Math.min(...xs)) * 7) };
}

// Ruído diário: desvio-padrão do peso cru em torno da tendência, últimos `dias` dias. É a resposta a "subi 1 kg de ontem pra hoje".
export function ruidoDiario(serie, hoje, { dias = 28 } = {}) {
  const ini = dia(hoje) - dias, s = serie.filter((p) => dia(p.data) >= ini && dia(p.data) <= dia(hoje));
  if (s.length < 5) return null;
  return arred(Math.sqrt(s.reduce((a, p) => a + (p.kg - p.tendencia) ** 2, 0) / (s.length - 1)), 2);
}

// Semanas até a meta. Estados: na_meta | sem_direcao (ritmo ~0 ou pro lado oposto) | incerta (a faixa cruza zero:
// os dados ainda não dizem para que lado vai) | alem_3_anos | ok {semanas:{min,central,max}, data}.
export function projecao({ atualKg, metaKg, taxa, hoje }) {
  if (atualKg == null || metaKg == null || !taxa) return { estado: "sem_dados" };
  const falta = metaKg - atualKg;
  if (Math.abs(falta) < 0.1) return { estado: "na_meta" };
  const r = taxa.kgPorSemana, lo = r - taxa.margem, hi = r + taxa.margem;
  if (Math.abs(r) < 0.05 || Math.sign(r) !== Math.sign(falta)) return { estado: "sem_direcao" };
  if (lo * hi <= 0) return { estado: "incerta" };
  const semanas = (v) => Math.ceil(falta / v);
  const rapido = Math.abs(lo) > Math.abs(hi) ? lo : hi, lento = Math.abs(lo) > Math.abs(hi) ? hi : lo;
  const s = { min: semanas(rapido), central: semanas(r), max: semanas(lento) };
  if (s.max > 156) return { estado: "alem_3_anos", semanas: s };
  return { estado: "ok", semanas: s, data: somarDias(hoje, s.central * 7) };
}

// Avisos de proporção (meio-termo): ritmo de perda acima de 1% do peso por semana e meta abaixo da faixa de referência do IMC.
// Não bloqueiam nada; a UI sugere conversar com um profissional.
export function alertasDePeso({ atualKg, metaKg, alturaCm, taxa }) {
  const a = [];
  if (taxa && atualKg > 0 && -taxa.kgPorSemana > 0.01 * atualKg) a.push("ritmo_rapido");
  if (metaKg > 0 && alturaCm > 0 && metaKg / (alturaCm / 100) ** 2 < 18.5) a.push("meta_abaixo_da_faixa");
  return a;
}
