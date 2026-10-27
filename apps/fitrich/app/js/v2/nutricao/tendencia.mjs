// Tendência de peso e adaptação sem culpa. A média móvel exponencial do "Hacker's Diet" (Walker) tira o ruído
// de água e sal do dia; a taxa da tendência (kg/semana) é comparada com a que a pessoa PEDIU, e a diferença vira
// uma sugestão pequena de calorias a cada 2 semanas. Sugestão, nunca ordem: quem decide é a pessoa.
import { diasEntre, somarDias } from "../../datas.mjs";
import { KCAL_POR_KG_SEMANA, arred, limitarAlvo } from "./energia.mjs";

export const ALFA = 0.1;          // 10% de suavização, o valor do Hacker's Diet
export const JANELA_DIAS = 14;    // a cada 2 semanas
export const AQUECIMENTO_DIAS = 21; // a média precisa de ~3 semanas de história para parar de "puxar" o início
export const MIN_PESAGENS = 6;    // pesagens dentro da janela de 14 dias
export const MIN_DIAS_REGISTRO = 10; // dias com refeição registrada na janela (de 14)
export const TOLERANCIA_KG_SEMANA = 0.1; // diferença abaixo disso é "dentro do meio-termo" (~110 kcal/dia)
export const AJUSTE_MAX = 250;    // um passo nunca passa de ±250 kcal/dia
export const PASSO_KCAL = 25;

// Série suavizada. Dia sem pesagem não existe: uma pesagem após `g` dias vale como `g` atualizações com o mesmo
// valor, ou seja alfa efetivo 1 − (1 − alfa)^g. Duas pesagens no mesmo dia viram a média delas.
export function tendenciaPeso(pesos, alfa = ALFA) {
  const porDia = new Map();
  for (const p of pesos) { const l = porDia.get(p.data) ?? []; l.push(p.kg); porDia.set(p.data, l); }
  const dias = [...porDia.keys()].sort();
  const serie = [];
  for (const d of dias) {
    const l = porDia.get(d), kg = l.reduce((a, b) => a + b, 0) / l.length;
    if (!serie.length) { serie.push({ data: d, kg: arred(kg, 2), tendencia: arred(kg, 3) }); continue; }
    const ant = serie[serie.length - 1], g = diasEntre(ant.data, d), a = 1 - (1 - alfa) ** g;
    serie.push({ data: d, kg: arred(kg, 2), tendencia: arred(ant.tendencia + a * (kg - ant.tendencia), 3) });
  }
  return serie;
}

// Taxa da tendência em kg/semana nos últimos 14 dias; null quando faltam dados para afirmar qualquer coisa.
export function taxaSemanal(serie, hoje, { janela = JANELA_DIAS } = {}) {
  const ate = serie.filter((p) => p.data <= hoje);
  if (ate.length < MIN_PESAGENS) return null;
  const ini = somarDias(hoje, -(janela - 1));
  const naJanela = ate.filter((p) => p.data >= ini);
  if (naJanela.length < MIN_PESAGENS) return null;
  const a = naJanela[0], b = naJanela[naJanela.length - 1], span = diasEntre(a.data, b.data);
  if (span < 10) return null;
  if (diasEntre(ate[0].data, hoje) < AQUECIMENTO_DIAS) return null;
  return { kgPorSemana: arred(((b.tendencia - a.tendencia) / span) * 7, 2), pesagens: naJanela.length, de: a.data, ate: b.data, tendenciaKg: b.tendencia };
}

// Sugestão a cada 2 semanas. Códigos (a UI traduz, sempre em tom neutro): "cedo", "sem_peso", "registro_insuficiente",
// "no_meio_termo", "ajustar" (com deltaKcal e novoAlvo) e "no_limite" (o alvo seguro já está no limite).
export function sugerirAjuste({ serie, hoje, alvoKcal, get, objetivo, sexo = "", kgPorSemanaAlvo, diasRegistrados, ultimoAjusteEm = null }) {
  if (ultimoAjusteEm && diasEntre(ultimoAjusteEm, hoje) < JANELA_DIAS) return { tipo: "cedo", proximaEm: somarDias(ultimoAjusteEm, JANELA_DIAS) };
  const taxa = taxaSemanal(serie, hoje);
  if (!taxa) return { tipo: "sem_peso" };
  if (diasRegistrados < MIN_DIAS_REGISTRO) return { tipo: "registro_insuficiente", taxa, diasRegistrados };
  const erro = kgPorSemanaAlvo - taxa.kgPorSemana;
  if (Math.abs(erro) <= TOLERANCIA_KG_SEMANA + 1e-9) return { tipo: "no_meio_termo", taxa };
  const bruto = Math.max(-AJUSTE_MAX, Math.min(AJUSTE_MAX, erro * KCAL_POR_KG_SEMANA));
  const delta = Math.sign(bruto) * Math.round(Math.abs(bruto) / PASSO_KCAL + 1e-9) * PASSO_KCAL;
  const { alvo } = limitarAlvo({ alvo: alvoKcal + delta, get, objetivo, sexo });
  if (alvo === alvoKcal) return { tipo: "no_limite", taxa };
  return { tipo: "ajustar", taxa, deltaKcal: alvo - alvoKcal, novoAlvo: alvo };
}
