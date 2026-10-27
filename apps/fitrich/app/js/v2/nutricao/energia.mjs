// Energia e metas de nutrição: TMB (Mifflin-St Jeor), gasto total, alvo com limites seguros, proteína por
// kg, gordura/carbo/fibra e água. Lógica pura, sem DOM nem relógio. Cada número tem fonte em
// docs/pesquisa-nutricao.md; as escolhas que são MINHAS (e não da fonte) estão marcadas "decisão".
// É acompanhamento pessoal, não prescrição: nada aqui diagnostica, e todo piso protege contra o excesso.
import { dia } from "../../datas.mjs";

export const ATIVIDADES = { sedentario: 1.2, leve: 1.375, moderado: 1.55, alto: 1.725, muito_alto: 1.9 };
export const OBJETIVOS = ["manter", "perder", "ganhar"];
// 7700 kcal por kg de massa corporal (regra de Wishnofsky). É aproximação: Hall (2011) mostra que o déficit
// rende menos com o tempo; por isso a adaptação pela tendência real de peso existe (tendencia.mjs).
export const KCAL_POR_KG = 7700;
export const KCAL_POR_KG_SEMANA = KCAL_POR_KG / 7; // 1100 kcal/dia por 1 kg/semana
// Ritmo semanal como % do peso (faixa 0,5 a 1% é a referência de segurança; decisão: padrão no meio-termo
// baixo, 0,5% para perder e 0,25% para ganhar, e teto de 1% e 0,5%).
export const RITMO = { perder: { padrao: 0.5, min: 0.25, max: 1 }, ganhar: { padrao: 0.25, min: 0.1, max: 0.5 } };
export const PISO_KCAL = { f: 1200, m: 1500, "": 1500 }; // NHLBI; sexo não informado usa o piso maior (decisão: lado seguro)
export const DEFICIT_MAX = 0.2;   // nunca mais de 20% abaixo do gasto (decisão)
export const SUPERAVIT_MAX = 0.15; // nunca mais de 15% acima (decisão)
export const GORDURA_PCT = 27.5;  // meio da faixa de referência 20-35% da energia (IOM/AMDR)
export const GORDURA_PCT_MIN = 20;
export const CARBO_MIN_G = 130;   // IOM: mínimo de glicose para o cérebro
export const PROTEINA_PCT_MAX = 35; // proteína não passa de 35% da energia (AMDR do IOM: 10-35%)
export const FIBRA_G_POR_1000 = 14; // IOM: 14 g a cada 1000 kcal

export const arred = (v, c = 0) => { const f = 10 ** c; return Math.sign(v) * Math.round(Math.abs(v) * f + 1e-9) / f; }; // half-up sobre o módulo

// Idade em anos completos na data `hoje` (ISO). null sem nascimento válido.
export function idadeEm(nascimento, hoje) {
  if (!nascimento || !hoje || nascimento > hoje) return null;
  const a = Number(hoje.slice(0, 4)) - Number(nascimento.slice(0, 4));
  return hoje.slice(5) < nascimento.slice(5) ? a - 1 : a;
}

// Mifflin-St Jeor (1990): 10·kg + 6,25·cm − 5·idade + 5 (homem) | − 161 (mulher). Sem sexo informado usa o ponto
// médio (−78) e marca `estimado` (decisão: não inventar um sexo). Só para adultos; fora da faixa devolve null.
export function tmbMifflin({ sexo = "", kg, cm, idade }) {
  if (!(kg >= 20 && kg <= 500) || !(cm >= 80 && cm <= 250) || !Number.isFinite(idade) || idade < 18 || idade > 100) return null;
  const k = sexo === "m" ? 5 : sexo === "f" ? -161 : -78;
  return { kcal: arred(10 * kg + 6.25 * cm - 5 * idade + k), estimado: sexo !== "m" && sexo !== "f" };
}

export const gastoTotal = (tmb, atividade) => (ATIVIDADES[atividade] ? arred(tmb * ATIVIDADES[atividade]) : null);

// Peso de referência para proteína: com IMC >= 30 usar o peso real inflaria a meta; usa o peso ajustado
// (peso no IMC 25 + 25% do excedente), prática comum de nutrição clínica.
export function pesoReferencia(kg, cm) {
  const ideal = 25 * (cm / 100) ** 2;
  return kg / (cm / 100) ** 2 >= 30 ? arred(ideal + 0.25 * (kg - ideal), 1) : kg;
}

// Faixa de proteína em g/kg/dia. RDA 0,8 (mínimo para não faltar); ISSN 1,4-2,0 para quem se exercita; Morton 2018:
// ~1,6 já capta o ganho de massa magra; em déficit ou ganho a faixa sobe para 1,6-2,2. Decisão: 'leve' 1,0-1,6
// (entre a RDA e a faixa de quem treina) e teto de 2,2 mesmo em déficit (ISSN chega a 3,1 só em atletas magros).
export function faixaProteinaGKg({ objetivo = "manter", atividade = "moderado", treinaForca = false }) {
  if (objetivo === "perder" || objetivo === "ganhar") return [1.6, 2.2];
  if (treinaForca || atividade === "moderado" || atividade === "alto" || atividade === "muito_alto") return [1.4, 2.0];
  return atividade === "leve" ? [1.0, 1.6] : [0.8, 1.2];
}

// Água de BEBIDAS em ml: EFSA 2010 dá água total (comida inclusa) de 2,5 L (homem) e 2,0 L (mulher), com ~20% vindo
// da comida; 80% disso é a meta de beber. Referência para clima moderado: calor e treino pedem mais, e a sede guia.
export const aguaMl = (sexo) => (sexo === "m" ? 2000 : sexo === "f" ? 1600 : 1800);

// Limita o alvo calórico ao que é seguro para o objetivo. Devolve { alvo, limitadoPor }.
export function limitarAlvo({ alvo, get, objetivo, sexo = "" }) {
  const piso = PISO_KCAL[sexo] ?? PISO_KCAL[""];
  const base = objetivo === "perder" ? get * (1 - DEFICIT_MAX) : objetivo === "ganhar" ? get : get * 0.9;
  let lo = Math.max(piso, base);
  const hi = objetivo === "perder" ? get : objetivo === "ganhar" ? get * (1 + SUPERAVIT_MAX) : get * 1.1;
  let por = null;
  if (lo > hi) { lo = hi; por = "piso_acima_do_gasto"; } // corpo pequeno: o piso passa do gasto, então só mantém
  let v = alvo;
  if (v < lo) { v = lo; por ??= piso > base ? "piso" : objetivo === "perder" ? "deficit_max" : "faixa"; }
  if (v > hi) { v = hi; por ??= objetivo === "ganhar" ? "superavit_max" : "faixa"; }
  return { alvo: arred(v), limitadoPor: por };
}

// Meta completa. `ajusteKcal` é a soma das sugestões de tendência que a pessoa ACEITOU (tendencia.mjs).
export function metaNutricional({ sexo = "", kg, cm, idade, atividade = "moderado", objetivo = "manter", ritmoPct = null, ajusteKcal = 0, treinaForca = false, proteinaGKg = null }) {
  const t = tmbMifflin({ sexo, kg, cm, idade });
  if (!t) return { ok: false, codigo: Number.isFinite(idade) && idade < 18 ? "nutricao.menor_de_18" : "nutricao.dados_incompletos" };
  const get = gastoTotal(t.kcal, atividade);
  if (!get) return { ok: false, codigo: "nutricao.atividade_invalida" };
  const faixa = RITMO[objetivo];
  const pct = faixa ? Math.min(faixa.max, Math.max(faixa.min, ritmoPct ?? faixa.padrao)) : 0;
  const kgSem = (faixa ? (kg * pct) / 100 : 0) * (objetivo === "perder" ? -1 : 1);
  const bruto = get + kgSem * KCAL_POR_KG_SEMANA + ajusteKcal;
  const { alvo, limitadoPor } = limitarAlvo({ alvo: bruto, get, objetivo, sexo });
  const avisos = [];
  if (limitadoPor) avisos.push(limitadoPor);
  // Proteína: faixa por kg de referência, limitada a 35% da energia (um alvo calórico pequeno não comporta 2 g/kg).
  const ref = pesoReferencia(kg, cm);
  const [gMin, gMax] = faixaProteinaGKg({ objetivo, atividade, treinaForca });
  const tetoG = Math.floor((alvo * PROTEINA_PCT_MAX) / 100 / 4);
  let alvoG = proteinaGKg != null ? arred(proteinaGKg * ref) : arred(((gMin + gMax) / 2) * ref);
  const minG = Math.min(arred(gMin * ref), tetoG), maxG = Math.min(arred(gMax * ref), tetoG);
  if (alvoG > maxG) { alvoG = maxG; avisos.push("proteina_limitada_pela_energia"); }
  // Gordura no meio da faixa e carbo no resto; se o carbo cair abaixo de 130 g, a gordura cede até 20%.
  let gordG = arred((alvo * GORDURA_PCT) / 100 / 9);
  let carbG = arred((alvo - alvoG * 4 - gordG * 9) / 4);
  if (carbG < CARBO_MIN_G) {
    const gordMinG = arred((alvo * GORDURA_PCT_MIN) / 100 / 9);
    gordG = Math.max(gordMinG, Math.min(gordG, arred((alvo - alvoG * 4 - CARBO_MIN_G * 4) / 9)));
    carbG = arred((alvo - alvoG * 4 - gordG * 9) / 4);
    if (carbG < CARBO_MIN_G) avisos.push("carbo_baixo");
  }
  return {
    ok: true, tmb: t.kcal, tmbEstimado: t.estimado, get, alvoKcal: alvo, kgPorSemana: arred((alvo - get) / KCAL_POR_KG_SEMANA, 2), limitadoPor, avisos,
    proteina: { alvoG, minG, maxG, gKgMin: gMin, gKgMax: gMax, pesoRefKg: ref },
    gordura: { g: gordG, pct: arred(((gordG * 9) / alvo) * 100, 1) },
    carbo: { g: carbG, pct: arred(((carbG * 4) / alvo) * 100, 1) },
    fibraG: arred((FIBRA_G_POR_1000 * alvo) / 1000), aguaMl: aguaMl(sexo),
  };
}

export const diasEntreISO = (a, b) => dia(b) - dia(a);
