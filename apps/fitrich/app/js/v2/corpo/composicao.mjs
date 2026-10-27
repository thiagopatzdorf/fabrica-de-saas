// Composição corporal: IMC, % de gordura (Marinha), RCQ, RCE, massa magra e FFMI. Funções puras, em Node, sem DOM.
// Cada número volta com o CÓDIGO da faixa (a UI traduz) e nenhuma função diz o que a pessoa "deve" pesar.
// Fontes e ressalvas: docs/pesquisa-corpo.md. Todas são triagem e acompanhamento, não diagnóstico.
import { faixaImc as _faixaImcTexto, gorduraMarinha, imc as imcShape } from "../../shape.mjs";

const arred = (v, c) => Math.round(v * 10 ** c) / 10 ** c;
const pos = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;

// IMC = kg / m². Reuso do `shape.mjs` da v1 (mesma conta, uma cópia só).
export const imc = imcShape;
// OMS (adultos): <18,5 / 18,5–24,9 / 25–29,9 / ≥30. Ressalva: não vê músculo, idade, etnia nem onde está a gordura.
export function faixaImc(v) {
  if (!pos(v)) return null;
  return v < 18.5 ? "abaixo" : v < 25 ? "referencia" : v < 30 ? "acima" : "bem_acima";
}
// Um IMC por faixa de peso para a ALTURA: o intervalo de peso que corresponde a 18,5–24,9 (informativo).
export const pesoNaFaixaImc = (alturaCm) => (pos(alturaCm) ? { minKg: arred(18.5 * (alturaCm / 100) ** 2, 1), maxKg: arred(24.9 * (alturaCm / 100) ** 2, 1) } : null);

// Razão cintura/quadril (OMS 2008): abdominal elevada se > 0,90 (homens) ou > 0,85 (mulheres).
export const rcq = (cinturaCm, quadrilCm) => (pos(cinturaCm) && pos(quadrilCm) ? arred(cinturaCm / quadrilCm, 4) : null);
export function faixaRcq(v, sexo) {
  if (!pos(v) || (sexo !== "m" && sexo !== "f")) return null;
  return v > (sexo === "m" ? 0.9 : 0.85) ? "elevada" : "referencia";
}

// Razão cintura/estatura (Ashwell 2012; NICE 2022): <0,4 "atenção ao baixo", 0,40–0,49 referência, 0,50–0,59 aumentada, ≥0,60 alta.
export const rce = (cinturaCm, alturaCm) => (pos(cinturaCm) && pos(alturaCm) ? arred(cinturaCm / alturaCm, 4) : null);
export function faixaRce(v) {
  if (!pos(v)) return null;
  return v < 0.4 ? "baixa" : v < 0.5 ? "referencia" : v < 0.6 ? "aumentada" : "alta";
}

// % de gordura: a fórmula da Marinha dos EUA vive em `shape.mjs` (Hodgdon & Beckett 1984). Aqui só a faixa descritiva
// do ACE (American Council on Exercise): descreve, não diagnostica. Limites superiores exclusivos.
export const gordura = gorduraMarinha;
const LIMITES_GORDURA = { m: [6, 14, 18, 25], f: [14, 21, 25, 32] };
export function faixaGordura(pct, sexo) {
  const l = LIMITES_GORDURA[sexo];
  if (!pos(pct) || !l) return null;
  return pct < l[0] ? "essencial" : pct < l[1] ? "atletica" : pct < l[2] ? "fitness" : pct < l[3] ? "media" : "alta";
}

// Massa magra estimada = peso × (1 − gordura/100). Herda toda a incerteza do % de gordura (erro típico da Marinha ~3–4 pontos).
export const massaMagra = (kg, pctGordura) => (pos(kg) && typeof pctGordura === "number" && pctGordura >= 0 && pctGordura < 100 ? arred(kg * (1 - pctGordura / 100), 1) : null);

// FFMI = massa magra / altura² (m). Normalizado (Kouri 1995): + 6,1 × (1,8 − altura em m), para comparar alturas diferentes.
export const ffmi = (massaMagraKg, alturaCm) => (pos(massaMagraKg) && pos(alturaCm) ? arred(massaMagraKg / (alturaCm / 100) ** 2, 1) : null);
export const ffmiNormalizado = (massaMagraKg, alturaCm) => (pos(massaMagraKg) && pos(alturaCm) ? arred(massaMagraKg / (alturaCm / 100) ** 2 + 6.1 * (1.8 - alturaCm / 100), 1) : null);
// Só existe referência publicada para homens: ~25 foi o teto observado em atletas sem esteroides (Kouri 1995, amostra pequena e discutida).
export const faixaFfmi = (norm, sexo) => (pos(norm) && sexo === "m" ? (norm >= 25 ? "acima_do_observado" : "dentro_do_observado") : null);

// Medida a medida: o valor mais recente de cada campo, desde que dentro de 30 dias da medição mais nova. Assim uma
// medição só de cintura não apaga o pescoço de ontem, e uma fita de 6 meses atrás não se mistura com a de hoje.
function medidasRecentes(medidas) {
  if (!medidas.length) return null;
  const novo = medidas[medidas.length - 1], limite = new Date(Date.parse(`${novo.data}T00:00:00Z`) - 30 * 86400000).toISOString().slice(0, 10);
  const m = { data: novo.data };
  for (const k of ["cinturaCm", "pescocoCm", "quadrilCm"]) { const x = [...medidas].reverse().find((r) => r[k] != null && r.data >= limite); if (x) m[k] = x[k]; }
  return m;
}
// Tudo de uma vez, a partir dos dados v2: último peso ≤ hoje e as medidas recentes ≤ hoje.
export function composicaoCorporal(d, hoje) {
  const ate = (lista) => lista.filter((x) => x.data <= hoje);
  const pesos = ate(d.pesos), medidas = ate(d.medidas);
  const peso = pesos.length ? pesos[pesos.length - 1] : null, m = medidasRecentes(medidas);
  const sexo = d.perfil.sexo, alturaCm = d.perfil.alturaCm;
  const kg = peso?.kg ?? null;
  const v = imc(kg, alturaCm);
  const g = m ? gordura({ sexo, alturaCm, cinturaCm: m.cinturaCm, pescocoCm: m.pescocoCm, quadrilCm: m.quadrilCm }) : null;
  const mm = massaMagra(kg, g);
  const ff = ffmiNormalizado(mm, alturaCm);
  const r1 = m ? rcq(m.cinturaCm, m.quadrilCm) : null, r2 = m ? rce(m.cinturaCm, alturaCm) : null;
  return {
    pesoKg: kg, dataPeso: peso?.data ?? null, dataMedidas: m?.data ?? null,
    imc: v, imcFaixa: faixaImc(v), pesoNaFaixa: pesoNaFaixaImc(alturaCm),
    gordura: g, gorduraFaixa: faixaGordura(g, sexo),
    rcq: r1, rcqFaixa: faixaRcq(r1, sexo), rce: r2, rceFaixa: faixaRce(r2),
    massaMagraKg: mm, ffmi: ffmi(mm, alturaCm), ffmiNorm: ff, ffmiFaixa: faixaFfmi(ff, sexo),
    faltaPerfil: !sexo || !alturaCm,
  };
}
