// Regras de insight do corpo (treino e peso). Mesma forma das de dinheiro. Nenhuma regra comenta aparência, comida ou
// "o que a pessoa deve pesar": só ritmo, constância e descanso, sempre com a saída "se for de propósito, tudo bem".
import { mesDe, segundaDaSemana, somarDias } from "../../datas.mjs";
import { CATEGORIA_FITNESS_ID } from "../esquema.mjs";
import { academiaOciosa } from "../shape-financas.mjs";
import { mediaMovel, projecaoMeta, tendencia, treinosPorSemana } from "../../shape.mjs";
import { gruposDoTreino, insight, mediaDe, minutosDe, regra, soma, treinosEntre } from "./base.mjs";

const idsDe = (xs, n = 10) => xs.slice(0, n).map((x) => x.id);
const metaDe = (ctx, tipo) => ctx.d.metas?.find((m) => m.tipo === tipo) ?? null;
const mensalidade = (d, ym) => soma((d.recorrencias ?? []).filter((r) => r.ativa && r.tipo === "despesa" && r.freq === "mensal" && r.categoriaId === CATEGORIA_FITNESS_ID && (!r.fim || r.fim >= `${ym}-01`) && mesDe(r.inicio) <= ym).map((r) => r.centavos));

// Estado de peso: média de 7 dias (uma pesagem oscila 1 a 2 kg por água) e ritmo em 28 dias (≥ 3 pesagens em ≥ 7 dias).
function estadoPeso(ctx) {
  if (!ctx.pesos.length) return null;
  const mm = mediaMovel(ctx.pesos, 7), media = mm[mm.length - 1].kg;
  return { media, ritmo: tendencia(ctx.pesos, ctx.hoje, 28), meta: metaDe(ctx, "peso") };
}

export const REGRAS_CORPO = [
  // Minutos de treino da última semana fechada contra a média das 4 anteriores (precisa de 3 com treino). Salto de 50% ou
  // mais informa com cuidado (a literatura de carga aguda:crônica aponta risco acima de ~1,3 a 1,5, mas com evidência
  // fraca); queda de 50% ou mais é só uma semana leve, descrita sem peso.
  regra("treino-volume-vs-media", "corpo", {
    impacto: 3, acionavel: 3,
    limiares: { semanasDeBase: 4, minSemanasComTreino: 3, saltoBp: 15000, quedaBp: 5000 },
    avaliar(ctx) {
      const seg = segundaDaSemana(ctx.hoje), ult = somarDias(seg, -7);
      const base = [1, 2, 3, 4].map((k) => treinosEntre(ctx.treinos, somarDias(ult, -7 * k), somarDias(ult, -7 * k + 6)));
      const comTreino = base.filter((s) => s.length);
      if (comTreino.length < 3) return [];
      const media = mediaDe(base.map(minutosDe));
      const semana = treinosEntre(ctx.treinos, ult, somarDias(ult, 6)), vol = minutosDe(semana);
      if (!(media > 0)) return [];
      const razaoBp = Math.round((vol / media) * 10000);
      const variante = razaoBp >= 15000 ? "alto" : razaoBp <= 5000 ? "baixo" : null;
      if (!variante) return [];
      return [insight("treino-volume-vs-media", { variante, severidade: variante === "alto" ? "atencao" : "info", numeros: { minutos: vol, mediaMinutos: Math.round(media), razaoBp }, evidencia: { treinos: idsDe(semana) } })];
    },
  }),

  // Grupo muscular (quando o treino o registra) que apareceu 2 vezes ou mais nos 28 dias antes das últimas 2 semanas e sumiu nelas.
  regra("grupo-muscular-esquecido", "corpo", {
    impacto: 3, acionavel: 4,
    limiares: { janelaRecenteDias: 14, janelaAnteriorDias: 28, minVezesAntes: 2 },
    avaliar(ctx) {
      const recente = ctx.treinos.filter((t) => ctx.diasDesde(t.data) < 14), antes = ctx.treinos.filter((t) => ctx.diasDesde(t.data) >= 14 && ctx.diasDesde(t.data) < 42);
      const contar = (ts) => { const m = new Map(); for (const t of ts) for (const g of gruposDoTreino(t)) m.set(g, [...(m.get(g) ?? []), t]); return m; };
      const r = contar(recente), a = contar(antes);
      const sumido = [...a].filter(([g, ts]) => ts.length >= 2 && !r.has(g)).sort((x, y) => y[1].length - x[1].length)[0];
      return sumido ? [insight("grupo-muscular-esquecido", { alvo: sumido[0], numeros: { grupo: sumido[0], vezes: sumido[1].length, dias: ctx.diasDesde(sumido[1][sumido[1].length - 1].data) }, evidencia: { treinos: idsDe(sumido[1]) } })] : [];
    },
  }),

  // O mesmo para o tipo de treino (Corrida, Musculação…), que o esquema já registra: 3 ou mais vezes nos 28 dias antes
  // das últimas 2 semanas e nenhuma nelas.
  regra("tipo-de-treino-esquecido", "corpo", {
    impacto: 2, acionavel: 4,
    limiares: { janelaRecenteDias: 14, janelaAnteriorDias: 28, minVezesAntes: 3 },
    avaliar(ctx) {
      const recente = new Set(ctx.treinos.filter((t) => ctx.diasDesde(t.data) < 14).map((t) => t.tipo));
      const antes = new Map();
      for (const t of ctx.treinos.filter((x) => ctx.diasDesde(x.data) >= 14 && ctx.diasDesde(x.data) < 42)) antes.set(t.tipo, [...(antes.get(t.tipo) ?? []), t]);
      const s = [...antes].filter(([tp, ts]) => ts.length >= 3 && !recente.has(tp)).sort((x, y) => y[1].length - x[1].length)[0];
      // Se NADA foi treinado nas 2 semanas, quem fala é a regra "retomada" (mais gentil e mais útil).
      if (!s || !ctx.treinos.some((t) => ctx.diasDesde(t.data) < 14)) return [];
      return [insight("tipo-de-treino-esquecido", { alvo: s[0], numeros: { tipo: s[0], vezes: s[1].length }, evidencia: { treinos: idsDe(s[1]) } })];
    },
  }),

  // Ritmo de variação do peso (28 dias) de 1% da média ou mais POR SEMANA: rápido para qualquer direção. A referência
  // costumeira de perda é 0,5 a 1% por semana; acima disso o app só avisa, e pede um profissional se não for de propósito.
  regra("peso-ritmo-rapido", "corpo", {
    impacto: 4, acionavel: 3,
    limiares: { janelaDias: 28, minPesagens: 3, pctDaMediaPorSemana: 1 },
    avaliar(ctx) {
      const e = estadoPeso(ctx);
      if (!e?.ritmo) return [];
      const pctSemana = (Math.abs(e.ritmo.kgPorSemana) / e.media) * 100;
      if (pctSemana < 1) return [];
      return [insight("peso-ritmo-rapido", { variante: e.ritmo.kgPorSemana < 0 ? "perda" : "ganho", severidade: "atencao", numeros: { kgPorSemana: Math.abs(e.ritmo.kgPorSemana), pctPorSemana: Math.round(pctSemana * 10) / 10, pesagens: e.ritmo.pontos }, evidencia: { pesos: idsDe(ctx.pesos.filter((p) => ctx.diasDesde(p.data) <= 28)) } })];
    },
  }),

  // Com meta de peso: a tendência vai para o lado contrário (0,1 kg/semana ou mais, e a meta a 1 kg ou mais de distância).
  regra("peso-direcao-oposta", "corpo", {
    impacto: 3, acionavel: 3,
    limiares: { ritmoMinimoKgSemana: 0.1, distanciaMinimaKg: 1 },
    avaliar(ctx) {
      const e = estadoPeso(ctx);
      if (!e?.ritmo || !e.meta) return [];
      const falta = e.meta.alvo - e.media;
      if (Math.abs(falta) < 1 || Math.abs(e.ritmo.kgPorSemana) < 0.1 || Math.sign(falta) === Math.sign(e.ritmo.kgPorSemana)) return [];
      return [insight("peso-direcao-oposta", { numeros: { kgPorSemana: Math.abs(e.ritmo.kgPorSemana), mediaKg: e.media, metaKg: e.meta.alvo } })];
    },
  }),

  // Com meta de peso e a tendência indo para ela (e não rápida demais): projeção em semanas; ou meta alcançada (a 0,1 kg).
  regra("peso-no-caminho", "corpo", {
    impacto: 2, acionavel: 2,
    limiares: { ritmoMinimoKgSemana: 0.05, metaAlcancadaAteKg: 0.1, projecaoMaximaSemanas: 156, ritmoRapidoPct: 1 },
    avaliar(ctx) {
      const e = estadoPeso(ctx);
      if (!e?.ritmo || !e.meta) return [];
      if ((Math.abs(e.ritmo.kgPorSemana) / e.media) * 100 >= 1) return [];
      const semanas = projecaoMeta(e.media, e.meta.alvo, e.ritmo.kgPorSemana);
      if (semanas == null) return [];
      return [insight("peso-no-caminho", { variante: semanas === 0 ? "atingida" : "indo", numeros: { semanas, kgPorSemana: Math.abs(e.ritmo.kgPorSemana), mediaKg: e.media, metaKg: e.meta.alvo } })];
    },
  }),

  // "X das últimas 8 semanas fechadas na meta de treino" (nunca sequência). 6 ou mais celebra; 2 ou menos acolhe e sugere
  // uma meta temporária menor. Exige 4 semanas de uso (primeiro treino há 28 dias ou mais).
  regra("consistencia-semanas", "corpo", {
    impacto: 3, acionavel: 3,
    limiares: { semanas: 8, altaDe: 6, baixaAte: 2, minDiasDeUso: 28 },
    avaliar(ctx) {
      const meta = metaDe(ctx, "treino");
      if (!meta || !ctx.treinos.length) return [];
      const primeiro = ctx.treinos.reduce((m, t) => (t.data < m ? t.data : m), "9999");
      if (ctx.diasDesde(primeiro) < 28) return [];
      const ref = somarDias(segundaDaSemana(ctx.hoje), -1);
      const sem = treinosPorSemana(ctx.treinos, ref, 8), x = sem.filter((s) => s.total >= meta.alvo).length;
      const variante = x >= 6 ? "alta" : x <= 2 ? "baixa" : null;
      return variante ? [insight("consistencia-semanas", { variante, numeros: { x, de: 8, meta: meta.alvo }, evidencia: { metas: [meta.id] } })] : [];
    },
  }),

  // Última pesagem há 21 dias ou mais, com histórico (3 ou mais pesagens). Convite sem pressão: peso é opcional.
  regra("pesagem-esparsa", "corpo", {
    impacto: 1, acionavel: 4,
    limiares: { minPesagens: 3, diasSemPesar: 21 },
    avaliar(ctx) {
      if (ctx.pesos.length < 3) return [];
      const dias = ctx.diasDesde(ctx.pesos[ctx.pesos.length - 1].data);
      return dias >= 21 ? [insight("pesagem-esparsa", { numeros: { dias } })] : [];
    },
  }),

  // Nada treinado nos últimos 14 dias depois de 4 ou mais treinos nos 28 dias anteriores: convite a retomar pequeno.
  regra("retomada", "corpo", {
    impacto: 3, acionavel: 5,
    limiares: { janelaSemTreinoDias: 14, minTreinosAntes: 4, janelaAntesDias: 28 },
    avaliar(ctx) {
      if (ctx.treinos.some((t) => ctx.diasDesde(t.data) < 14)) return [];
      const antes = ctx.treinos.filter((t) => ctx.diasDesde(t.data) >= 14 && ctx.diasDesde(t.data) < 42);
      return antes.length >= 4 ? [insight("retomada", { numeros: { treinosAntes: antes.length, minutos: minutosDe(antes) }, evidencia: { treinos: idsDe(antes) } })] : [];
    },
  }),

  // Cruzamento corpo × dinheiro: mensalidade de academia ativa e 14 dias ou mais sem treino (a lógica já existe em shape-financas).
  regra("academia-ociosa", "corpo", {
    impacto: 2, acionavel: 4,
    limiares: { diasSemTreino: 14 },
    avaliar(ctx) {
      const m = mensalidade(ctx.d, ctx.ym);
      if (!(m > 0)) return [];
      const a = academiaOciosa({ mensalidadeCentavos: m, treinos: ctx.treinos, hoje: ctx.hoje });
      if (!a.alertas.includes("sem_treino_ha_dias")) return [];
      return [insight("academia-ociosa", { numeros: { mensalidadeCentavos: m, dias: a.diasSemTreino ?? 0 }, evidencia: { recorrencias: (ctx.d.recorrencias ?? []).filter((r) => r.categoriaId === CATEGORIA_FITNESS_ID && r.ativa).map((r) => r.id) } })];
    },
  }),

  // Treino em 7 dos últimos 7 dias, ou em 6 com esforço médio 4 ou mais (de 5): descanso também é parte do treino.
  regra("sem-dia-de-descanso", "corpo", {
    impacto: 3, acionavel: 4,
    limiares: { janelaDias: 7, diasSemFolga: 7, diasComEsforcoAlto: 6, esforcoMedioMinimo: 4 },
    avaliar(ctx) {
      const ts = ctx.treinos.filter((t) => ctx.diasDesde(t.data) < 7);
      const dias = new Set(ts.map((t) => t.data)).size;
      const esf = ts.filter((t) => t.esforco != null).map((t) => t.esforco), esforcoMedio = esf.length ? mediaDe(esf) : 0;
      if (!(dias >= 7 || (dias >= 6 && esforcoMedio >= 4))) return [];
      return [insight("sem-dia-de-descanso", { severidade: "atencao", numeros: { dias, esforcoMedio: Math.round(esforcoMedio * 10) / 10 }, evidencia: { treinos: idsDe(ts) } })];
    },
  }),
];
