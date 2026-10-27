// Fórmulas do treino: 1RM estimado, carga a partir de repetições, frequência cardíaca e ritmo.
// Tudo puro, sem arredondar no meio (só `arred` na saída). Cada fórmula tem teste com valor calculado à mão
// (tests/unit/fitrich-treino.test.mjs). Fontes em docs/pesquisa-treino.md.
export const arred = (v, c = 1) => Math.round(v * 10 ** c) / 10 ** c;
const ehNum = (v) => typeof v === "number" && Number.isFinite(v);

// Epley (1985): 1RM = kg × (1 + reps/30). Com 1 repetição a carga já é o próprio 1RM.
export const epley = (kg, reps) => (!ehNum(kg) || !ehNum(reps) || kg <= 0 || reps < 1 ? null : reps === 1 ? kg : kg * (1 + reps / 30));
// Brzycki (1993): 1RM = kg × 36 / (37 − reps). Diverge perto de 37 repetições, então só vale até 12.
export const brzycki = (kg, reps) => (!ehNum(kg) || !ehNum(reps) || kg <= 0 || reps < 1 || reps > 12 ? null : kg * 36 / (37 - reps));

// Série de trabalho → 1RM estimado. `rir` (repetições na reserva) soma às repetições feitas: 8 reps com 2 na
// reserva pesam como uma série de 10 até a falha. Entre 2 e 10 repetições usa a média das duas fórmulas (as
// duas ficam a ~3% do 1RM real nessa faixa, LeSuer 1997); acima de 10 só a Epley (a Brzycki subestima menos
// quando as repetições crescem, mas perde confiança). Passou de 20 repetições, não estima: série de resistência
// não diz nada confiável sobre força máxima.
export function e1rm(kg, reps, rir = 0) {
  if (!ehNum(kg) || !ehNum(reps) || kg <= 0 || reps < 1) return null;
  const r = reps + (ehNum(rir) && rir > 0 ? rir : 0);
  if (r > 20) return null;
  const e = epley(kg, r), b = brzycki(kg, r);
  return r >= 2 && r <= 10 && b != null ? (e + b) / 2 : e;
}

// Inverso da Epley: carga que se levanta `reps` vezes com `rir` na reserva, dado o 1RM.
export const cargaParaReps = (um, reps, rir = 0) => (!ehNum(um) || um <= 0 || reps < 1 ? null : um / (1 + (reps + Math.max(0, rir)) / 30));
// Percentual do 1RM que cada número de repetições (até a falha) costuma pedir.
export const percentualDeReps = (reps) => 1 / (1 + reps / 30);

// Arredonda a carga ao degrau disponível (anilha). Passo ≤ 0 devolve a carga com 1 casa.
export function arredondarCarga(kg, passo = 2.5) {
  if (!ehNum(kg)) return null;
  if (!(passo > 0)) return arred(kg, 1);
  return arred(Math.round(kg / passo) * passo, 2);
}

// Tonelagem de uma série (kg × repetições): medida simples de volume, não de qualidade.
export const tonelagem = (kg, reps) => (ehNum(kg) && ehNum(reps) ? kg * reps : 0);

// ---------- cardio ----------
// FC máxima estimada. Tanaka 2001 (208 − 0,7 × idade) erra menos que a 220 − idade depois dos 40 anos; as duas
// são estimativas populacionais (o desvio individual é de ±10 bpm ou mais), por isso a pessoa pode digitar a dela.
export const fcMaxTanaka = (idade) => (ehNum(idade) && idade >= 10 && idade <= 100 ? 208 - 0.7 * idade : null);
export const fcMaxFox = (idade) => (ehNum(idade) && idade >= 10 && idade <= 100 ? 220 - idade : null);

// Karvonen: FC alvo = FC repouso + fração × (FC máx − FC repouso).
export const karvonen = (fcMax, fcRepouso, fracao) => (ehNum(fcMax) && ehNum(fcRepouso) && fcMax > fcRepouso ? fcRepouso + fracao * (fcMax - fcRepouso) : null);

// Cinco zonas pela reserva de frequência cardíaca (convenção comum; os limites de 40–59% = moderado e 60–89% =
// vigoroso são os do ACSM). Z1 recuperação, Z2 base, Z3 ritmo, Z4 limiar, Z5 máximo.
export const LIMITES_ZONAS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
export function zonasKarvonen(fcMax, fcRepouso) {
  if (karvonen(fcMax, fcRepouso, 0.5) == null) return null;
  return LIMITES_ZONAS.slice(0, 5).map((a, i) => ({ zona: i + 1, de: Math.round(karvonen(fcMax, fcRepouso, a)), ate: Math.round(karvonen(fcMax, fcRepouso, LIMITES_ZONAS[i + 1])) }));
}
// Sem FC de repouso: percentual simples da FC máxima (50–60, 60–70, 70–80, 80–90, 90–100%).
export function zonasPercentualMax(fcMax) {
  if (!ehNum(fcMax) || fcMax <= 0) return null;
  return LIMITES_ZONAS.slice(0, 5).map((a, i) => ({ zona: i + 1, de: Math.round(fcMax * a), ate: Math.round(fcMax * LIMITES_ZONAS[i + 1]) }));
}
// Zona de uma FC média (1..5); abaixo da Z1 = 0 (leve demais para contar), acima da Z5 = 5.
export function zonaDaFc(fc, zonas) {
  if (!ehNum(fc) || !zonas) return null;
  if (fc < zonas[0].de) return 0;
  const z = zonas.find((x) => fc >= x.de && fc <= x.ate);
  return z ? z.zona : 5;
}

// Ritmo em segundos por km e velocidade em km/h. null sem distância.
export const ritmoSegPorKm = (minutos, km) => (ehNum(minutos) && ehNum(km) && minutos > 0 && km > 0 ? Math.round((minutos * 60) / km) : null);
export const velocidadeKmh = (minutos, km) => (ehNum(minutos) && ehNum(km) && minutos > 0 && km > 0 ? arred(km / (minutos / 60), 1) : null);
export const mmss = (seg) => (ehNum(seg) && seg >= 0 ? `${Math.floor(Math.round(seg) / 60)}:${String(Math.round(seg) % 60).padStart(2, "0")}` : "—");
