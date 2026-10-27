// Contas do corpo: média e tendência do peso, IMC, gordura estimada e consistência de treino.
// É acompanhamento, não diagnóstico: nenhuma função aqui diz o que a pessoa "deve" pesar.
import { dia, segundaDaSemana, somarDias, mesDe } from "./datas.mjs";

export const arred = (v, c = 1) => Math.round(v * 10 ** c) / 10 ** c;

// Média dos pesos dos últimos `janela` dias, ponto a ponto (uma pesagem isolada oscila 1 a 2 kg por água).
export function mediaMovel(pesos, janela = 7) {
  return pesos.map((p, i) => {
    const d = dia(p.data), ate = pesos.slice(0, i + 1).filter((q) => d - dia(q.data) < janela);
    return { data: p.data, kg: arred(ate.reduce((s, q) => s + q.kg, 0) / ate.length, 2) };
  });
}

// Inclinação (kg por semana) por mínimos quadrados nos últimos `dias`. null com pouco dado, para não
// anunciar tendência a partir de duas pesagens.
export function tendencia(pesos, hoje, dias = 28) {
  const ini = dia(hoje) - dias, pts = pesos.filter((p) => dia(p.data) >= ini && dia(p.data) <= dia(hoje));
  if (pts.length < 3) return null;
  const xs = pts.map((p) => dia(p.data) - ini), ys = pts.map((p) => p.kg);
  if (Math.max(...xs) - Math.min(...xs) < 7) return null;
  const n = pts.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0), sxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  return { kgPorSemana: arred((sxy / sxx) * 7, 2), pontos: n };
}

// Semanas até a meta no ritmo atual; null se o ritmo é desprezível, vai para o lado errado ou passa de 3 anos.
export function projecaoMeta(atual, meta, kgPorSemana) {
  if (atual == null || meta == null || kgPorSemana == null || Math.abs(kgPorSemana) < 0.05) return null;
  const falta = meta - atual;
  if (Math.abs(falta) < 0.1) return 0;
  if (Math.sign(falta) !== Math.sign(kgPorSemana)) return null;
  const sem = Math.ceil(falta / kgPorSemana);
  return sem > 156 ? null : sem;
}

export const imc = (kg, cm) => (kg > 0 && cm > 0 ? arred(kg / (cm / 100) ** 2, 1) : null);
// Faixas da OMS para adultos. Informativo: ignora massa muscular, idade e distribuição de gordura.
export function faixaImc(v) {
  if (v == null) return null;
  return v < 18.5 ? "abaixo da faixa de referência" : v < 25 ? "dentro da faixa de referência" : v < 30 ? "acima da faixa de referência" : "bem acima da faixa de referência";
}

// Método da Marinha dos EUA (medidas em cm). null quando as medidas não fazem sentido (cintura <= pescoço).
export function gorduraMarinha({ sexo, alturaCm, cinturaCm, pescocoCm, quadrilCm }) {
  if (!(alturaCm > 0 && cinturaCm > 0 && pescocoCm > 0)) return null;
  let v;
  if (sexo === "m") {
    if (cinturaCm <= pescocoCm) return null;
    v = 495 / (1.0324 - 0.19077 * Math.log10(cinturaCm - pescocoCm) + 0.15456 * Math.log10(alturaCm)) - 450;
  } else if (sexo === "f") {
    if (!(quadrilCm > 0) || cinturaCm + quadrilCm <= pescocoCm) return null;
    v = 495 / (1.29579 - 0.35004 * Math.log10(cinturaCm + quadrilCm - pescocoCm) + 0.221 * Math.log10(alturaCm)) - 450;
  } else return null;
  return v > 2 && v < 65 ? arred(v, 1) : null;
}

export const treinosNaSemana = (treinos, ref) => { const seg = segundaDaSemana(ref), fim = somarDias(seg, 6); return treinos.filter((t) => t.data >= seg && t.data <= fim); };

// Semanas seguidas em que a meta de treinos foi batida. A semana corrente conta se já bateu; se ainda
// não bateu, não quebra a sequência (a semana não acabou), só não soma.
export function sequenciaSemanas(treinos, metaSemana, hoje) {
  let seg = segundaDaSemana(hoje), seq = 0;
  if (treinosNaSemana(treinos, seg).length >= metaSemana) seq++;
  for (let k = 0; k < 520; k++) {
    seg = somarDias(seg, -7);
    if (treinosNaSemana(treinos, seg).length >= metaSemana) seq++; else break;
  }
  return seq;
}

// Treinos por semana, das últimas `n` semanas (a corrente é a última).
export function treinosPorSemana(treinos, hoje, n = 8) {
  const seg0 = segundaDaSemana(hoje);
  return Array.from({ length: n }, (_, i) => { const seg = somarDias(seg0, -7 * (n - 1 - i)); return { inicio: seg, total: treinosNaSemana(treinos, seg).length }; });
}
export const treinosNoMes = (treinos, ym) => treinos.filter((t) => mesDe(t.data) === ym);
