// Investimentos: "rendimento estimado se levado ao vencimento" — SEM marcação a mercado (decisão 10
// do plano: o preço de hoje de um título depende da curva, que o app não tem). Fontes marcadas:
// ✅ oficial, ⚠️ secundária. Dinheiro em centavos, taxas em bp, arredondamento uma vez por período.
import { diasEntre, ehISO } from "../datas.mjs";
import { aaParaAm, arredondar, exigirCentavos, exigirTaxaNaoNegativa, fracaoDeBp, jurosDoPeriodo } from "./taxas.mjs";

// ⚠️ IR regressivo de renda fixa (Lei 11.033/2004, art. 1º): 22,5 % até 180 dias; 20 % de 181 a 360;
// 17,5 % de 361 a 720; 15 % acima de 720. Conferido em fonte secundária na pesquisa, não no texto
// oficial — por isso o ⚠️. Dias CORRIDOS entre aplicação e resgate.
export function aliquotaIrBp(dias) {
  if (!Number.isInteger(dias) || dias < 0) throw new RangeError("dias_invalidos");
  return dias <= 180 ? 2250 : dias <= 360 ? 2000 : dias <= 720 ? 1750 : 1500;
}

// ✅ IOF regressivo (Decreto 6.306/2007, anexo): % do RENDIMENTO tributado por dia corrido desde a
// aplicação; 96 % no 1º dia, 0 a partir do 30º. Índice = dia − 1.
export const IOF_REGRESSIVO_PCT = Object.freeze([96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3, 0]);
export function aliquotaIofPct(dias) {
  if (!Number.isInteger(dias) || dias < 1) throw new RangeError("dias_invalidos");
  return dias >= 30 ? 0 : IOF_REGRESSIVO_PCT[dias - 1];
}

// IOF incide primeiro, sobre o rendimento; o IR incide sobre o que sobrou. Resgate no dia 10 com
// rendimento 50,00: IOF 66 % = 33,00; IR 22,5 % sobre 17,00 = 3,825 → 3,83; líquido 13,17.
// Rendimento zero ou negativo não paga nada. `isentoIR` (LCI/LCA/poupança) zera o IR e mantém o IOF
// (LCI/LCA têm carência que torna o IOF raro na prática — mas a carência NÃO é codificada, é da
// emissão: fica como aviso).
export function tributosDoResgate({ rendimentoCentavos, dias, isentoIR = false }) {
  exigirCentavos(rendimentoCentavos);
  if (rendimentoCentavos <= 0) return { iofCentavos: 0, irCentavos: 0, liquidoCentavos: rendimentoCentavos, aliquotaIofPct: aliquotaIofPct(Math.max(1, dias)), aliquotaIrBp: isentoIR ? 0 : aliquotaIrBp(dias) };
  const iofPct = aliquotaIofPct(dias);
  const iof = arredondar((rendimentoCentavos * iofPct) / 100);
  const baseIr = rendimentoCentavos - iof;
  const irBp = isentoIR ? 0 : aliquotaIrBp(dias);
  const ir = arredondar((baseIr * irBp) / 10000);
  return { iofCentavos: iof, irCentavos: ir, liquidoCentavos: rendimentoCentavos - iof - ir, aliquotaIofPct: iofPct, aliquotaIrBp: irBp };
}

// Rendimento bruto de taxa anual por `dias` corridos: P × ((1+a)^(dias/365) − 1), arredondado uma vez.
// ⚠️ Simplificação declarada: CDI e Selic são cotados em 252 dias úteis; usar dias corridos/365 é o que
// permite estimar sem calendário de feriados e é o que o plano fixa (10.000 a 13,65 % em 365 d → 1.365,00).
export function rendimentoBrutoAnual(principalCentavos, taxaAaBp, dias) {
  exigirCentavos(principalCentavos); exigirTaxaNaoNegativa(taxaAaBp);
  if (!Number.isInteger(dias) || dias < 0) throw new RangeError("dias_invalidos");
  return arredondar(principalCentavos * ((1 + fracaoDeBp(taxaAaBp)) ** (dias / 365) - 1));
}

// ✅ Poupança (Lei 12.703/2012, art. 12 da Lei 8.177/1991): TR + 0,5 % a.m. quando a meta Selic passa
// de 8,5 % a.a.; senão TR + 70 % da Selic mensalizada. Capitaliza por mês (aniversário), arredondando a
// cada mês. Isenta de IR e sem IOF a partir do aniversário — fora do escopo aqui.
export function taxaPoupancaMensal({ selicBp, trMensalBp }) {
  exigirTaxaNaoNegativa(selicBp); exigirTaxaNaoNegativa(trMensalBp);
  const tr = fracaoDeBp(trMensalBp);
  return selicBp > 850 ? { fracao: tr + 0.005, regra: "tr_mais_0_5" } : { fracao: tr + 0.7 * aaParaAm(selicBp), regra: "tr_mais_70pct_selic" };
}
export function rendimentoPoupanca(principalCentavos, meses, indices) {
  exigirCentavos(principalCentavos);
  if (!Number.isInteger(meses) || meses < 0) throw new RangeError("prazo_invalido");
  const { fracao, regra } = taxaPoupancaMensal(indices);
  let saldo = principalCentavos;
  for (let k = 0; k < meses; k++) saldo += jurosDoPeriodo(saldo, fracao);
  return { brutoCentavos: saldo - principalCentavos, liquidoCentavos: saldo - principalCentavos, regra, isentoIR: true };
}

// ✅ Tesouro Direto (B3): custódia 0,20 % a.a. sobre o valor, pro rata por dias corridos; no Tesouro
// Selic não incide sobre os primeiros R$ 10.000,00 por investidor — aqui aplicado por título, o que
// SUBESTIMA a taxa de quem tem vários (aviso `custodia_isencao_por_investidor`).
export const CUSTODIA_TESOURO_AA_BP = 20;
export const ISENCAO_CUSTODIA_SELIC_CENTAVOS = 1_000_000;
export function custodiaTesouro(principalCentavos, dias, { produto } = {}) {
  exigirCentavos(principalCentavos);
  if (!Number.isInteger(dias) || dias < 0) throw new RangeError("dias_invalidos");
  const base = produto === "tesouro_selic" ? Math.max(0, principalCentavos - ISENCAO_CUSTODIA_SELIC_CENTAVOS) : principalCentavos;
  return arredondar(base * fracaoDeBp(CUSTODIA_TESOURO_AA_BP) * (dias / 365));
}

// Taxa anual efetiva do investimento (schema `investimentos`): indexador + percentual/spread.
//   cdi:       cdi × percentualBp/10⁴ (+ taxaBp)      ex.: 100 % do CDI, 110 % do CDI
//   selic:     selic + taxaBp                           (Tesouro Selic ≈ Selic + 0,0x %)
//   ipca:      composto: (1+ipca)(1+taxaBp) − 1         (Tesouro IPCA+, CDB IPCA+)
//   prefixado: taxaBp
// Índice do snapshot = "média BCB, não a sua" — e, no IPCA, é o passado projetado para a frente.
export function taxaAnualDoInvestimento(inv, indices) {
  const spread = fracaoDeBp(exigirTaxaNaoNegativa(inv.taxaBp ?? 0));
  const avisos = [];
  let fracao;
  switch (inv.indexador) {
    case "cdi": fracao = fracaoDeBp(indices.cdiBp) * fracaoDeBp(inv.percentualBp ?? 10000) + spread; avisos.push("indice_media_bcb_nao_o_seu"); break;
    case "selic": fracao = fracaoDeBp(indices.selicBp) + spread; avisos.push("indice_media_bcb_nao_o_seu"); break;
    case "ipca": fracao = (1 + fracaoDeBp(indices.ipca12Bp)) * (1 + spread) - 1; avisos.push("ipca_passado_projetado"); break;
    case "prefixado": fracao = spread; break;
    default: throw new RangeError("indexador_invalido");
  }
  return { fracao, bp: Math.round(fracao * 10000), avisos };
}

// Estimativa "se levado ao vencimento": bruto pela taxa anual, custódia (Tesouro), IOF e IR sobre o
// bruto. Sem vencimento, estima até `hoje`. Poupança segue a própria regra mensal.
// CDB 100 % CDI, 10.000 por 365 d: bruto 1.365,00; IR 17,5 % → 238,875 → 238,88 half-up; líquido 1.126,12.
export function rendimentoAteVencimento(inv, indices, { hoje } = {}) {
  const fim = inv.vencimento ?? hoje;
  if (!ehISO(inv.aplicacao) || !ehISO(fim)) throw new RangeError("data_invalida");
  const dias = diasEntre(inv.aplicacao, fim);
  if (dias < 0) throw new RangeError("vencimento_antes_da_aplicacao");
  const principal = exigirCentavos(inv.aporteCentavos);
  const avisos = ["sem_marcacao_a_mercado", "estimativa_nao_promessa"];
  if (!inv.vencimento) avisos.push("sem_vencimento_estimado_ate_hoje");
  if (inv.produto === "poupanca") {
    const r = rendimentoPoupanca(principal, Math.floor(dias / 30), indices);
    return { dias, brutoCentavos: r.brutoCentavos, iofCentavos: 0, irCentavos: 0, custodiaCentavos: 0, liquidoCentavos: r.liquidoCentavos, taxaAnualBp: null, avisos: [...avisos, "poupanca_rende_no_aniversario"] };
  }
  const taxa = taxaAnualDoInvestimento(inv, indices);
  avisos.push(...taxa.avisos);
  const bruto = rendimentoBrutoAnual(principal, taxa.bp, dias);
  const custodia = /^tesouro/.test(inv.produto ?? "") ? custodiaTesouro(principal, dias, { produto: inv.produto }) : 0;
  if (inv.produto === "tesouro_selic") avisos.push("custodia_isencao_por_investidor");
  const trib = dias === 0 ? { iofCentavos: 0, irCentavos: 0 } : tributosDoResgate({ rendimentoCentavos: bruto, dias, isentoIR: Boolean(inv.isentoIR) });
  if (inv.isentoIR) avisos.push("lci_lca_carencia_nao_calculada");
  if (inv.produto === "fundo") avisos.push("come_cotas_nao_calculado");
  return { dias, brutoCentavos: bruto, iofCentavos: trib.iofCentavos, irCentavos: trib.irCentavos, custodiaCentavos: custodia, liquidoCentavos: bruto - trib.iofCentavos - trib.irCentavos - custodia, taxaAnualBp: taxa.bp, avisos };
}
