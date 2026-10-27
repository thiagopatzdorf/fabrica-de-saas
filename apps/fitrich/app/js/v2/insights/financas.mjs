// Regras de insight do lado do dinheiro. Cada regra é uma função pura (contexto) → lista de insights; os
// limiares moram em `limiares` (documentados em docs/pesquisa-revisao.md) e cada um tem teste dos dois lados.
// Tom: descreve o padrão e oferece UM próximo passo; nenhuma regra julga a pessoa.
import { diasEntre, somarDias, somarMeses } from "../../datas.mjs";
import { faturaDaCompra, faturaDoLancamento, fechamentoDaFatura, limiteUsado, resumoDaFatura } from "../cartao.mjs";
import { saldoDaConta } from "../esquema.mjs";
import { despesasDoMes } from "../lancamentos-soma.mjs";
import { despesaEssencialMedia, progressoMeta } from "../metas.mjs";
import { estadoLimites } from "../orcamento.mjs";
import { LIMITE_Z_MODIFICADO, chaveDescricao, escoreModificado, fracaoBp, insight, mediana, regra, soma } from "./base.mjs";

const ids = (ls, n = 8) => ls.slice(0, n).map((l) => l.id);
const porValorDesc = (ls) => [...ls].sort((a, b) => b.centavos - a.centavos);
const saldoLiquido = (ctx, tipos) => soma((ctx.d.contas ?? []).filter((c) => !c.arquivada && c.moeda === ctx.moeda && tipos.includes(c.tipo)).map((c) => saldoDaConta(ctx.d, c.id, ctx.hoje) ?? 0));

// Agrupa despesas à vista por descrição comparável (parcela tem outro tratamento).
function gruposPorDescricao(despesas) {
  const g = new Map();
  for (const l of despesas) {
    if (l.parcela) continue;
    const k = chaveDescricao(l.descricao);
    if (k.length < 3) continue;
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(l);
  }
  return g;
}

export const REGRAS_FINANCAS = [
  // Cobrança que se repete todo mês e ainda não está nas recorrências: a previsão do app fica melhor
  // registrando, e a pessoa pode decidir se ainda quer pagar. Mensal = intervalo mediano de 25 a 35 dias.
  regra("assinatura-repetida", "dinheiro", {
    impacto: 3, acionavel: 5,
    limiares: { soCategoriaNaoEssencial: true, minOcorrencias: 3, minMesesDistintos: 3, variacaoMaximaBp: 1000, intervaloMedianoDias: [25, 35], ativaSeUltimaEmAteDias: 45 },
    avaliar(ctx) {
      const registradas = (ctx.d.recorrencias ?? []).filter((r) => r.ativa !== false).map((r) => chaveDescricao(r.nome));
      const saida = [];
      for (const [k, ls] of gruposPorDescricao(ctx.despesas)) {
        const o = [...ls].sort((a, b) => (a.data < b.data ? -1 : 1));
        // Aluguel e mercado se repetem todo mês e não são "assinatura": só categoria não essencial entra.
        if (o.some((l) => ctx.cat(l.categoriaId)?.essencial)) continue;
        if (o.length < 3 || new Set(o.map((l) => l.data.slice(0, 7))).size < 3) continue;
        if (ctx.diasDesde(o[o.length - 1].data) > 45) continue;
        const med = mediana(o.map((l) => l.centavos));
        if (o.some((l) => Math.abs(l.centavos - med) * 10000 > med * 1000)) continue;
        const gap = mediana(o.slice(1).map((l, i) => diasEntre(o[i].data, l.data)));
        if (gap < 25 || gap > 35) continue;
        if (registradas.some((r) => r && (r === k || r.includes(k) || k.includes(r)))) continue;
        saida.push(insight("assinatura-repetida", { alvo: k, numeros: { nome: o[o.length - 1].descricao, mensalCentavos: Math.round(med), anualCentavos: Math.round(med) * 12, meses: new Set(o.map((l) => l.data.slice(0, 7))).size }, evidencia: { lancamentos: ids(o) }, impacto: Math.min(5, 2 + Math.floor((Math.round(med) * 12) / 100000)) }));
      }
      return saida.sort((a, b) => b.numeros.anualCentavos - a.numeros.anualCentavos).slice(0, 2);
    },
  }),

  // Duas cobranças iguais em poucos dias: ou foi duplicada, ou foi de propósito. Só vale a pena olhar acima de R$ 20.
  regra("cobranca-duplicada", "dinheiro", {
    impacto: 3, acionavel: 5,
    limiares: { janelaDias: 35, intervaloMaxDias: 3, valorMinimoCentavos: 2000 },
    avaliar(ctx) {
      const recentes = ctx.despesas.filter((l) => ctx.diasDesde(l.data) < 35 && l.centavos >= 2000);
      const saida = [];
      for (const [k, ls] of gruposPorDescricao(recentes)) {
        const o = [...ls].sort((a, b) => (a.data < b.data ? -1 : 1));
        for (let i = 1; i < o.length; i++) {
          const a = o[i - 1], b = o[i];
          if (a.centavos === b.centavos && diasEntre(a.data, b.data) <= 3) { saida.push(insight("cobranca-duplicada", { alvo: k, numeros: { nome: b.descricao, valorCentavos: b.centavos, dias: diasEntre(a.data, b.data) }, evidencia: { lancamentos: [a.id, b.id] } })); break; }
        }
      }
      return saida.slice(0, 2);
    },
  }),

  regra("assinaturas-total", "dinheiro", {
    impacto: 2, acionavel: 4,
    limiares: { categoria: "cat-assinaturas", fracaoDaReceitaBp: 500 },
    avaliar(ctx) {
      const receita = ctx.receitaMes(ctx.ymAnt), gasto = despesasDoMes(ctx.reais, ctx.ymAnt, { categoriaIds: ["cat-assinaturas"] });
      const bp = fracaoBp(gasto, receita);
      if (bp == null || bp < 500) return [];
      return [insight("assinaturas-total", { numeros: { gastoCentavos: gasto, taxaBp: bp }, evidencia: { lancamentos: ids(porValorDesc(ctx.despesas.filter((l) => l.categoriaId === "cat-assinaturas" && l.data.startsWith(ctx.ymAnt)))) } })];
    },
  }),

  // Gasto de uma categoria muito acima do que a pessoa costuma gastar nela: escore modificado (mediana/MAD)
  // maior que 3,5, pelo menos o dobro da mediana e acima de R$ 50, com 8 ou mais gastos de histórico.
  regra("gasto-fora-do-padrao", "dinheiro", {
    impacto: 3, acionavel: 3,
    limiares: { janelaRecenteDias: 7, historicoDias: 190, minAmostras: 3 + 5, zModificadoMaior: LIMITE_Z_MODIFICADO, vezesMediana: 2, pisoCentavos: 5000, vezesMedianaSeMadZero: 3 },
    avaliar(ctx) {
      const recentes = ctx.despesas.filter((l) => l.categoriaId && ctx.diasDesde(l.data) < 7 && !l.parcela);
      const saida = [];
      for (const l of recentes) {
        const hist = ctx.despesas.filter((x) => x.categoriaId === l.categoriaId && x.id !== l.id && ctx.diasDesde(x.data) >= 7 && ctx.diasDesde(x.data) <= 190).map((x) => x.centavos);
        if (hist.length < 8 || l.centavos < 5000) continue;
        const { mediana: med, mad: m, z } = escoreModificado(l.centavos, hist);
        const fora = m === 0 ? l.centavos >= med * 3 : z > LIMITE_Z_MODIFICADO && l.centavos >= med * 2;
        if (fora) saida.push(insight("gasto-fora-do-padrao", { alvo: l.id, numeros: { valorCentavos: l.centavos, tipicoCentavos: Math.round(med), categoriaId: l.categoriaId, nome: l.descricao || "" }, evidencia: { lancamentos: [l.id] } }));
      }
      return saida.sort((a, b) => b.numeros.valorCentavos - a.numeros.valorCentavos).slice(0, 1);
    },
  }),

  // No ritmo do ciclo atual a fatura (somada ao que as faturas anteriores e as parcelas já comprometem) ultrapassa o limite.
  // Parcela e recorrência já estão certas; só a parte variável é projetada. Pede 7 dias de ciclo para não projetar de 2 compras.
  regra("fatura-passara-limite", "dinheiro", {
    impacto: 4, acionavel: 4,
    limiares: { diasMinimosDeCiclo: 7 },
    avaliar(ctx) {
      const saida = [];
      for (const c of ctx.d.cartoes ?? []) {
        if (!(c.limiteCentavos > 0)) continue;
        const aberta = faturaDaCompra(c, ctx.hoje), fim = fechamentoDaFatura(c, aberta);
        const ini = somarDias(fechamentoDaFatura(c, somarMeses(aberta, -1)), 1);
        const decorridos = diasEntre(ini, ctx.hoje) + 1, ciclo = diasEntre(ini, fim) + 1;
        if (decorridos < 7 || decorridos > ciclo) continue;
        const itens = ctx.d.lancamentos.filter((l) => l.cartaoId === c.id && l.status !== "cancelado" && l.tipo === "despesa" && l.data <= ctx.hoje && faturaDoLancamento(c, l) === aberta);
        const fixo = soma(itens.filter((l) => l.parcela || l.recorrenciaId).map((l) => l.centavos)), variavel = soma(itens.filter((l) => !l.parcela && !l.recorrenciaId).map((l) => l.centavos));
        const r = resumoDaFatura(c, ctx.d.lancamentos, aberta, ctx.hoje);
        const outros = limiteUsado(c, ctx.d.lancamentos, ctx.hoje) - (r.totalCentavos - r.pagoCentavos);
        const projetado = outros + fixo + Math.round((variavel / decorridos) * ciclo) - r.pagoCentavos;
        if (projetado > c.limiteCentavos) saida.push(insight("fatura-passara-limite", { alvo: c.id, severidade: "atencao", numeros: { nome: c.nome, projetadoCentavos: projetado, limiteCentavos: c.limiteCentavos, dias: ciclo - decorridos }, evidencia: { cartoes: [c.id], lancamentos: ids(porValorDesc(itens)) } }));
      }
      return saida.slice(0, 1);
    },
  }),

  // Dinheiro na conta corrente/carteira acima de (6 meses de despesa essencial + 1 mês de despesa total): sobra que
  // pode ter um destino. Piso de R$ 1.000 para não alarmar por trocado.
  regra("dinheiro-parado", "dinheiro", {
    impacto: 3, acionavel: 4,
    limiares: { mesesDeReserva: 6, mesesDeGiro: 1, pisoCentavos: 100000 },
    avaliar(ctx) {
      const essencial = despesaEssencialMedia(ctx.reais, ctx.d.categorias ?? [], ctx.ym), giro = ctx.despesaMedia();
      if (!essencial || !giro) return [];
      const liquidez = saldoLiquido(ctx, ["corrente", "dinheiro"]), referencia = Math.round(essencial * 6 + giro);
      const parado = liquidez - referencia;
      if (parado < Math.max(100000, essencial)) return [];
      return [insight("dinheiro-parado", { numeros: { paradoCentavos: parado, liquidezCentavos: liquidez, referenciaCentavos: referencia } })];
    },
  }),

  // Cobertura da reserva em meses de despesa essencial (corrente + dinheiro + poupança). Referência 3 a 6 meses (CLT);
  // abaixo de 1 mês pede atenção, abaixo de 3 só informa. Sem despesa essencial medida não há conta.
  regra("reserva-curta", "dinheiro", {
    impacto: 4, acionavel: 3,
    limiares: { atencaoAbaixoDeMeses: 1, informaAbaixoDeMeses: 3 },
    avaliar(ctx) {
      const essencial = despesaEssencialMedia(ctx.reais, ctx.d.categorias ?? [], ctx.ym);
      if (!essencial) return [];
      const meses = saldoLiquido(ctx, ["corrente", "dinheiro", "poupanca"]) / essencial;
      if (meses >= 3) return [];
      return [insight("reserva-curta", { variante: meses < 1 ? "baixa" : "meio", severidade: meses < 1 ? "atencao" : "info", numeros: { meses: Math.round(Math.max(0, meses) * 10) / 10, essencialCentavos: essencial } })];
    },
  }),

  // Taxa de poupança do último mês fechado contra a mediana dos 6 meses anteriores (mínimo 3 com receita). Diferença
  // de 10 pontos percentuais ou mais, para cima ou para baixo.
  regra("poupanca-vs-mediana", "dinheiro", {
    impacto: 3, acionavel: 2,
    limiares: { mesesDeBase: 6, minMesesBase: 3, diferencaMinimaBp: 1000 },
    avaliar(ctx) {
      const atual = ctx.taxaBp(ctx.ymAnt);
      const base = ctx.meses(6, somarMeses(ctx.ymAnt, -1)).map(ctx.taxaBp).filter((x) => x != null);
      if (atual == null || base.length < 3) return [];
      const med = mediana(base), dif = Math.round(atual - med);
      if (Math.abs(dif) < 1000) return [];
      return [insight("poupanca-vs-mediana", { variante: dif > 0 ? "acima" : "abaixo", numeros: { taxaBp: atual, medianaBp: Math.round(med), diferencaBp: Math.abs(dif) } })];
    },
  }),

  // A categoria que mais cresceu no último mês fechado contra a mediana dos 3 meses anteriores: aumento de pelo
  // menos R$ 50 e de pelo menos 30%. Base com pelo menos 2 meses de gasto na categoria.
  regra("categoria-mais-cresceu", "dinheiro", {
    impacto: 3, acionavel: 3,
    limiares: { mesesDeBase: 3, minMesesComGasto: 2, aumentoMinimoCentavos: 5000, aumentoMinimoBp: 3000 },
    avaliar(ctx) {
      const anteriores = ctx.meses(3, somarMeses(ctx.ymAnt, -1));
      let melhor = null;
      for (const c of (ctx.d.categorias ?? []).filter((x) => x.tipo === "despesa")) {
        const v = despesasDoMes(ctx.reais, ctx.ymAnt, { categoriaIds: [c.id] });
        const base = anteriores.map((m) => despesasDoMes(ctx.reais, m, { categoriaIds: [c.id] }));
        if (base.filter((x) => x > 0).length < 2) continue;
        const med = mediana(base), aumento = v - med;
        if (aumento >= 5000 && aumento * 10000 >= med * 3000 && (!melhor || aumento > melhor.aumento)) melhor = { c, v, med, aumento };
      }
      if (!melhor) return [];
      const ls = porValorDesc(ctx.despesas.filter((l) => l.categoriaId === melhor.c.id && l.data.startsWith(ctx.ymAnt)));
      return [insight("categoria-mais-cresceu", { alvo: melhor.c.id, numeros: { categoriaId: melhor.c.id, valorCentavos: melhor.v, tipicoCentavos: Math.round(melhor.med), aumentoCentavos: Math.round(melhor.aumento) }, evidencia: { lancamentos: ids(ls, 5) } })];
    },
  }),

  // Parcelas do cartão que vencem neste mês como fração da receita média (3 meses fechados): 15% informa, 30% pede atenção.
  regra("parcelas-comprometem-renda", "dinheiro", {
    impacto: 4, acionavel: 3,
    limiares: { informaBp: 1500, atencaoBp: 3000 },
    avaliar(ctx) {
      const renda = ctx.receitaMedia();
      if (!renda) return [];
      const ps = (ctx.d.lancamentos ?? []).filter((l) => l.parcela && l.status !== "cancelado" && l.tipo === "despesa" && l.data.startsWith(ctx.ym));
      const total = soma(ps.map((l) => l.centavos)), bp = fracaoBp(total, renda);
      if (bp == null || bp < 1500) return [];
      return [insight("parcelas-comprometem-renda", { severidade: bp >= 3000 ? "atencao" : "info", numeros: { parcelasCentavos: total, taxaBp: bp, rendaCentavos: Math.round(renda) }, evidencia: { lancamentos: ids(porValorDesc(ps)) } })];
    },
  }),

  // Parcelas mínimas das dívidas cadastradas sobre a renda média. A referência bancária 28/36 limita o total de
  // dívidas a 36% da renda bruta: 20% informa, 36% pede atenção. Referência de banco, não lei.
  regra("dividas-minimos-renda", "dinheiro", {
    impacto: 5, acionavel: 3,
    limiares: { informaBp: 2000, atencaoBp: 3600 },
    avaliar(ctx) {
      const renda = ctx.receitaMedia();
      const minimos = soma((ctx.d.dividas ?? []).map((x) => x.parcelaMinimaCentavos ?? 0));
      const bp = renda ? fracaoBp(minimos, renda) : null;
      if (bp == null || bp < 2000) return [];
      return [insight("dividas-minimos-renda", { severidade: bp >= 3600 ? "atencao" : "info", numeros: { minimosCentavos: minimos, taxaBp: bp, rendaCentavos: Math.round(renda) } })];
    },
  }),

  ...metasRegras(),

  // Receita do último mês fechado pelo menos 20% abaixo da mediana dos 3 anteriores (base mínima R$ 100, 2 meses com receita).
  regra("receita-caiu", "dinheiro", {
    impacto: 4, acionavel: 3,
    limiares: { quedaMinimaBp: 2000, minMesesBase: 2 },
    avaliar(ctx) {
      const base = ctx.meses(3, somarMeses(ctx.ymAnt, -1)).map(ctx.receitaMes).filter((x) => x > 0);
      const atual = ctx.receitaMes(ctx.ymAnt);
      if (base.length < 2 || atual <= 0) return [];
      const med = mediana(base), queda = Math.round(((med - atual) / med) * 10000);
      if (med < 10000 || queda < 2000) return [];
      return [insight("receita-caiu", { numeros: { receitaCentavos: atual, medianaCentavos: Math.round(med), quedaBp: queda } })];
    },
  }),

  // Mês fechado com despesa maior que a receita (e receita lançada).
  regra("mes-no-vermelho", "dinheiro", {
    impacto: 4, acionavel: 3,
    limiares: { despesaMaiorQueReceita: true },
    avaliar(ctx) {
      const r = ctx.receitaMes(ctx.ymAnt), g = ctx.despesaMes(ctx.ymAnt);
      if (r <= 0 || g <= r) return [];
      const ls = porValorDesc(ctx.despesas.filter((l) => l.data.startsWith(ctx.ymAnt)));
      return [insight("mes-no-vermelho", { severidade: "atencao", numeros: { receitaCentavos: r, despesaCentavos: g, diferencaCentavos: g - r }, evidencia: { lancamentos: ids(ls, 5) } })];
    },
  }),

  // Categorias com limite no orçamento: acima de 100% pede atenção; de 80% a 100% informa.
  regra("limite-categoria", "dinheiro", {
    impacto: 3, acionavel: 4,
    limiares: { informaPct: 80, atencaoPct: 100 },
    avaliar(ctx) {
      const limites = ctx.d.orcamento?.limites ?? {};
      const e = estadoLimites({ lancamentos: ctx.reais, ym: ctx.ym, limites }).find((x) => x.pct != null && x.pct >= 80);
      if (!e) return [];
      return [insight("limite-categoria", { alvo: e.categoriaId, variante: e.pct > 100 ? "passou" : "perto", severidade: e.pct > 100 ? "atencao" : "info", numeros: { categoriaId: e.categoriaId, gastoCentavos: e.gastoCentavos, limiteCentavos: e.limiteCentavos, pct: Math.round(e.pct) }, evidencia: { lancamentos: ids(porValorDesc(ctx.despesas.filter((l) => l.categoriaId === e.categoriaId && l.data.startsWith(ctx.ym)))) } })];
    },
  }),

  // Lançamentos importados sem categoria: 5 ou mais pedem uma passada de classificação.
  regra("sem-categoria-pendentes", "dinheiro", {
    impacto: 2, acionavel: 5,
    limiares: { minimo: 5 },
    avaliar(ctx) {
      const ls = (ctx.d.lancamentos ?? []).filter((l) => l.categoriaId == null && (l.tipo === "despesa" || l.tipo === "receita") && l.status !== "cancelado");
      return ls.length >= 5 ? [insight("sem-categoria-pendentes", { numeros: { n: ls.length }, evidencia: { lancamentos: ids(ls, 10) } })] : [];
    },
  }),

  // 50/30/20 com margem de 5 pontos: desejos acima de 35% da receita do mês fechado informam; necessidades acima de 60% também.
  regra("desejos-acima-da-faixa", "dinheiro", {
    impacto: 2, acionavel: 3,
    limiares: { faixaClassicaBp: 3000, margemBp: 500, acimaDeBp: 3500 },
    avaliar(ctx) {
      const bp = grupoBp(ctx, "desejo");
      return bp != null && bp > 3500 ? [insight("desejos-acima-da-faixa", { numeros: { taxaBp: bp } })] : [];
    },
  }),
  regra("necessidades-altas", "dinheiro", {
    impacto: 3, acionavel: 2,
    limiares: { faixaClassicaBp: 5000, margemBp: 1000, acimaDeBp: 6000 },
    avaliar(ctx) {
      const bp = grupoBp(ctx, "necessidade");
      return bp != null && bp > 6000 ? [insight("necessidades-altas", { numeros: { taxaBp: bp } })] : [];
    },
  }),

  // O outro lado do meio-termo: média de desejos em 5% da receita ou menos, por 3 meses fechados com receita.
  regra("desejos-quase-zero", "dinheiro", {
    impacto: 1, acionavel: 3,
    limiares: { mesesDeBase: 3, ateBp: 500 },
    avaliar(ctx) {
      const ms = ctx.meses(3).filter((m) => ctx.receitaMes(m) > 0);
      if (ms.length < 3) return [];
      const bps = ms.map((m) => grupoBp(ctx, "desejo", m));
      const media = Math.round(soma(bps) / bps.length);
      return media <= 500 ? [insight("desejos-quase-zero", { numeros: { taxaBp: media } })] : [];
    },
  }),

  // Patrimônio líquido (snapshots mensais) mudou 5% ou mais entre os dois últimos meses registrados.
  regra("patrimonio-variacao", "dinheiro", {
    impacto: 2, acionavel: 2,
    limiares: { variacaoMinimaBp: 500 },
    avaliar(ctx) {
      const s = [...(ctx.d.snapshots ?? [])].sort((a, b) => (a.ym < b.ym ? -1 : 1));
      if (s.length < 2) return [];
      const [a, b] = s.slice(-2);
      if (a.patrimonioCentavos <= 0) return [];
      const bp = Math.round(((b.patrimonioCentavos - a.patrimonioCentavos) / a.patrimonioCentavos) * 10000);
      return Math.abs(bp) >= 500 ? [insight("patrimonio-variacao", { variante: bp > 0 ? "subiu" : "caiu", numeros: { taxaBp: Math.abs(bp), deCentavos: a.patrimonioCentavos, paraCentavos: b.patrimonioCentavos } })] : [];
    },
  }),

  // Dados velhos: com histórico (10 ou mais lançamentos), 5 dias ou mais sem lançar nada. Insight de higiene: todos os outros
  // dependem de o app estar em dia.
  regra("lancamentos-parados", "dinheiro", {
    impacto: 2, acionavel: 5,
    limiares: { minLancamentos: 10, diasSemLancar: 5 },
    avaliar(ctx) {
      const todos = (ctx.d.lancamentos ?? []).filter((l) => l.status !== "cancelado" && l.data <= ctx.hoje);
      if (todos.length < 10) return [];
      const ultimo = todos.reduce((m, l) => (l.data > m ? l.data : m), "");
      const dias = ctx.diasDesde(ultimo);
      return dias >= 5 ? [insight("lancamentos-parados", { numeros: { dias } })] : [];
    },
  }),
];

function grupoBp(ctx, grupo, ym = ctx.ymAnt) {
  const r = ctx.receitaMes(ym);
  if (r <= 0) return null;
  const idsGrupo = (ctx.d.categorias ?? []).filter((c) => c.tipo === "despesa" && c.grupo === grupo).map((c) => c.id);
  return fracaoBp(despesasDoMes(ctx.reais, ym, { categoriaIds: idsGrupo }), r);
}

// Metas financeiras com prazo: o aporte mensal que o prazo exige (progressoMeta) contra a folga média dos 3 meses fechados.
function metasRegras() {
  const calcular = (ctx) => (ctx.d.metas ?? []).filter((m) => m.prazo && ["reserva", "sinking", "objetivo", "independencia"].includes(m.tipo)).map((m) => {
    try { return { meta: m, p: progressoMeta(m, { hoje: ctx.hoje }) }; } catch { return null; }
  }).filter(Boolean);
  return [
    regra("meta-prazo-passou", "dinheiro", {
      impacto: 3, acionavel: 4,
      limiares: { prazoVencidoSemAtingir: true, prazoNoMesAindaNaoChegou: "nao_conta" },
      avaliar: (ctx) => calcular(ctx).filter((x) => x.p.codigo === "prazo_vencido" && x.meta.prazo <= ctx.hoje).slice(0, 1).map((x) => insight("meta-prazo-passou", { alvo: x.meta.id, numeros: { nome: x.meta.nome, faltaCentavos: x.p.faltaCentavos, progressoBp: x.p.progressoBp }, evidencia: { metas: [x.meta.id] } })),
    }),
    regra("meta-ritmo-acima-da-folga", "dinheiro", {
      impacto: 3, acionavel: 4,
      limiares: { aporteSobreFolgaMaiorQue: 1 },
      avaliar(ctx) {
        const folga = ctx.folgaMedia();
        if (folga == null) return [];
        return calcular(ctx).filter((x) => x.p.aporteMensalCentavos != null && x.p.aporteMensalCentavos > Math.max(0, folga)).slice(0, 1)
          .map((x) => insight("meta-ritmo-acima-da-folga", { alvo: x.meta.id, numeros: { nome: x.meta.nome, aporteCentavos: x.p.aporteMensalCentavos, folgaCentavos: Math.max(0, Math.round(folga)), meses: x.p.mesesRestantes }, evidencia: { metas: [x.meta.id] } }));
      },
    }),
    regra("meta-folgada", "dinheiro", {
      impacto: 2, acionavel: 3,
      limiares: { aporteSobreFolgaAte: 0.5 },
      avaliar(ctx) {
        const folga = ctx.folgaMedia();
        if (folga == null || folga <= 0) return [];
        return calcular(ctx).filter((x) => x.p.aporteMensalCentavos != null && x.p.aporteMensalCentavos * 2 <= folga).slice(0, 1)
          .map((x) => insight("meta-folgada", { alvo: x.meta.id, numeros: { nome: x.meta.nome, aporteCentavos: x.p.aporteMensalCentavos, folgaCentavos: Math.round(folga), meses: x.p.mesesRestantes }, evidencia: { metas: [x.meta.id] } }));
      },
    }),
  ];
}
