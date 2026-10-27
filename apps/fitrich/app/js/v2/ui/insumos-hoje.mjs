// Os números da tela Hoje, calculados a partir do documento v2 com os motores existentes (nenhuma regra
// financeira nova aqui: só a montagem dos insumos que `podeGastarHoje` pede e a escolha do alerta).
// Puro: `hoje` chega de fora, nada de DOM. Candidato a migrar para `gastar-hoje.mjs` quando estabilizar.
import { diasEntre, mesDe, somarDias, ultimoDiaDoMes } from "../../datas.mjs";
import { faturaDaCompra, resumoDaFatura, vencimentoDaFatura } from "../cartao.mjs";
import { projetarFluxo } from "../fluxo.mjs";
import { podeGastarHoje } from "../gastar-hoje.mjs";
import { despesasDoMes, receitasDoMes } from "../lancamentos-soma.mjs";
import { progressoMeta } from "../metas.mjs";
import { estadoLimites } from "../orcamento.mjs";
import { proximasOcorrencias } from "../recorrencia.mjs";

const vivo = (l) => l.status !== "cancelado";
const materializada = (lancamentos, rec, data) => lancamentos.some((l) => l.recorrenciaId === rec.id && (l.dataPrevista ?? l.data) === data);

// Receita prevista = recebida no mês + prevista (lançamento `previsto`) + recorrências de receita que
// ainda vão ocorrer até o fim do mês e não viraram lançamento. Fixas restantes = idem para despesa em
// conta. Cartão no mês = o que as faturas que VENCEM neste mês ainda cobram de compras de meses
// anteriores (compra deste mês já conta em "gasto feito": não entra duas vezes). Aportes = PMT das
// metas com prazo. Gasto feito = despesas do mês (conta e cartão, pela data) menos estornos.
export function insumosGastarHoje(d, hoje) {
  const ym = mesDe(hoje), fim = ultimoDiaDoMes(ym), inicio = `${ym}-01`;
  const ls = d.lancamentos.filter(vivo);
  let receita = receitasDoMes(ls, ym) + ls.filter((l) => l.tipo === "receita" && l.status === "previsto" && mesDe(l.data) === ym).reduce((s, l) => s + l.centavos, 0);
  let fixas = ls.filter((l) => l.tipo === "despesa" && l.status === "previsto" && !l.cartaoId && mesDe(l.data) === ym).reduce((s, l) => s + l.centavos, 0);
  for (const rec of d.recorrencias) {
    if (rec.ativa === false || rec.tipo === "transferencia") continue;
    for (const data of proximasOcorrencias(rec, hoje, fim)) {
      if (materializada(ls, rec, data)) continue;
      if (rec.tipo === "receita") receita += rec.centavos;
      else if (!rec.cartaoId) fixas += rec.centavos;
      else { const f = faturaDaCompra(d.cartoes.find((c) => c.id === rec.cartaoId) ?? { diaFechamento: 1 }, data); if (vencimentoDaFatura(d.cartoes.find((c) => c.id === rec.cartaoId), f).slice(0, 7) === ym) fixas += rec.centavos; }
    }
  }
  let cartao = 0;
  for (const c of d.cartoes) {
    const yms = new Set(ls.filter((l) => l.cartaoId === c.id).map((l) => l.fatura ?? faturaDaCompra(c, l.data)));
    for (const f of yms) {
      if (mesDe(vencimentoDaFatura(c, f)) !== ym) continue;
      const r = resumoDaFatura(c, ls, f, hoje);
      if (r.status === "paga") continue;
      const antigas = ls.filter((l) => l.cartaoId === c.id && l.tipo === "despesa" && (l.fatura ?? faturaDaCompra(c, l.data)) === f && l.data < inicio).reduce((s, l) => s + l.centavos, 0);
      cartao += Math.max(0, Math.min(r.restanteCentavos, antigas));
    }
  }
  let aportes = 0;
  for (const m of d.metas) {
    if (!m.prazo || !["reserva", "sinking", "objetivo", "independencia"].includes(m.tipo)) continue;
    try { aportes += progressoMeta(m, { hoje }).aporteMensalCentavos ?? 0; } catch { /* meta sem dado suficiente: não entra */ }
  }
  const gasto = Math.max(0, despesasDoMes(ls, ym));
  const insumos = { receitaPrevistaMes: receita, fixasRestantes: fixas, parcelasCartaoMes: cartao, aportesMetas: aportes, gastoVariavelFeito: gasto };
  const r = podeGastarHoje({ ...insumos, hoje });
  const diasNoMes = diasEntre(inicio, fim) + 1, diaDoMes = diasEntre(inicio, hoje) + 1;
  const base = receita - fixas - cartao - aportes; // o que havia para gastar no mês inteiro
  return { ...r, insumos, fimDoMes: fim, diasNoMes, diaDoMes, pctTempo: Math.round((diaDoMes / diasNoMes) * 100), pctGasto: base > 0 ? Math.min(100, Math.round((gasto / base) * 100)) : null, baseMesCentavos: base };
}

// Um alerta só, nesta prioridade: fatura vencendo (≤ 7 dias ou vencida, com saldo), categoria que passou
// do limite, saldo negativo previsto nos próximos 30 dias. null = tudo certo.
export function alertaHoje(d, hoje) {
  const ls = d.lancamentos.filter(vivo);
  for (const c of d.cartoes) {
    const yms = [...new Set(ls.filter((l) => l.cartaoId === c.id).map((l) => l.fatura ?? faturaDaCompra(c, l.data)))].sort();
    for (const f of yms) {
      const r = resumoDaFatura(c, ls, f, hoje);
      if ((r.status === "fechada" || r.status === "vencida") && r.restanteCentavos > 0 && r.diasParaVencer <= 7) return { tipo: "fatura", cartaoId: c.id, cartao: c.nome, ym: f, vencimento: r.vencimento, centavos: r.restanteCentavos, dias: r.diasParaVencer, vencida: r.status === "vencida" };
    }
  }
  const limites = estadoLimites({ lancamentos: ls, ym: mesDe(hoje), limites: d.orcamento?.limites ?? {} }).filter((x) => x.estado === "passou");
  if (limites.length) { const x = limites[0]; return { tipo: "limite", categoriaId: x.categoriaId, gasto: x.gastoCentavos, limite: x.limiteCentavos, acima: x.gastoCentavos - x.limiteCentavos }; }
  if (d.contas.some((c) => !c.arquivada)) {
    const fluxo = projetarFluxo({ contas: d.contas, lancamentos: ls, recorrencias: d.recorrencias, cartoes: d.cartoes, hoje, dias: 30 });
    if (fluxo.primeiroDiaNegativo) return { tipo: "saldo_negativo", data: fluxo.primeiroDiaNegativo, menor: fluxo.menorSaldoCentavos, dataMenor: fluxo.dataDoMenorSaldo };
  }
  return null;
}

// Próximos compromissos (fatura, recorrência de despesa, previsto) nos próximos `dias`, mais perto primeiro.
export function proximosVencimentos(d, hoje, { dias = 14, limite = 3 } = {}) {
  const ate = somarDias(hoje, dias), ls = d.lancamentos.filter(vivo), itens = [];
  for (const c of d.cartoes) {
    const yms = new Set(ls.filter((l) => l.cartaoId === c.id).map((l) => l.fatura ?? faturaDaCompra(c, l.data)));
    for (const f of yms) {
      const r = resumoDaFatura(c, ls, f, hoje);
      if (r.restanteCentavos > 0 && r.vencimento >= hoje && r.vencimento <= ate) itens.push({ tipo: "fatura", nome: c.nome, data: r.vencimento, centavos: r.restanteCentavos });
    }
  }
  for (const rec of d.recorrencias) {
    if (rec.ativa === false || rec.tipo !== "despesa") continue;
    for (const data of proximasOcorrencias(rec, hoje, ate)) if (!materializada(ls, rec, data)) itens.push({ tipo: "recorrencia", nome: rec.nome, data, centavos: rec.centavos });
  }
  for (const l of ls) if (l.tipo === "despesa" && l.status === "previsto" && l.data >= hoje && l.data <= ate) itens.push({ tipo: "previsto", nome: l.descricao, data: l.data, centavos: l.centavos });
  return itens.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : b.centavos - a.centavos)).slice(0, limite);
}
