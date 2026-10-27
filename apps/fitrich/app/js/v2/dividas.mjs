// Dívidas: Price, tabela de amortização, CET por bisseção, avalanche × bola de neve e "quitar ou
// investir". Tudo em centavos inteiros e bp inteiros; juros arredondados uma vez por período.
// As funções devolvem códigos e números — a frase é da UI.
import { aaParaAm, amParaAa, arredondar, bpDeFracao, exigirCentavos, exigirPrazo, exigirTaxaNaoNegativa, fracaoDeBp, jurosDoPeriodo } from "./taxas.mjs";

// Parcela Price: PMT = P·i / (1 − (1+i)^−n). Com i = 0 vira P/n. 1000,00 a 2 % em 12x → 94,56.
export function parcelaPrice(principalCentavos, taxaMensalBp, n) {
  exigirCentavos(principalCentavos); exigirTaxaNaoNegativa(taxaMensalBp); exigirPrazo(n);
  const i = fracaoDeBp(taxaMensalBp);
  if (i === 0) return arredondar(principalCentavos / n);
  return arredondar((principalCentavos * i) / (1 - (1 + i) ** -n));
}

// Tabela Price em centavos. Juros do período = round(saldo × i); amortização = parcela − juros; a
// ÚLTIMA parcela é saldo + juros, para zerar exatamente (o arredondamento de cada período deixa
// resto de centavos, e esse resto vai para a última parcela em vez de sumir).
export function tabelaPrice(principalCentavos, taxaMensalBp, n) {
  const parcelaCentavos = parcelaPrice(principalCentavos, taxaMensalBp, n);
  const i = fracaoDeBp(taxaMensalBp);
  const parcelas = [];
  let saldo = principalCentavos, totalPago = 0, totalJuros = 0;
  for (let k = 1; k <= n; k++) {
    const juros = jurosDoPeriodo(saldo, i);
    const parcela = k === n ? saldo + juros : parcelaCentavos;
    const amortizacao = parcela - juros;
    saldo -= amortizacao;
    totalPago += parcela; totalJuros += juros;
    parcelas.push({ n: k, parcelaCentavos: parcela, jurosCentavos: juros, amortizacaoCentavos: amortizacao, saldoCentavos: saldo });
  }
  return { parcelaCentavos, parcelas, totalPagoCentavos: totalPago, totalJurosCentavos: totalJuros };
}

// Valor presente de um fluxo de parcelas [{ mes, centavos }] à taxa mensal `i` (fração).
const valorPresente = (parcelas, i) => parcelas.reduce((s, p) => s + p.centavos / (1 + i) ** p.mes, 0);

// CET (Res. CMN 3.517/2007): a taxa que iguala o valor efetivamente recebido ao valor presente de
// tudo que se paga. Recebido líquido = liberado − tarifas − IOF cobrados na contratação; parcelas
// podem ser lista [{ mes, centavos }] ou (parcelaCentavos, n) mensais a partir do mês 1.
// Bisseção em [0, 1000 % a.m.]: a função PV é monótona decrescente em i, então converge sempre que
// o total pago supera o recebido; se não supera, não há juro (CET 0) ou o fluxo não faz sentido.
export function cet({ valorLiberadoCentavos, tarifasCentavos = 0, iofCentavos = 0, parcelas, parcelaCentavos, n }) {
  exigirCentavos(valorLiberadoCentavos); exigirCentavos(tarifasCentavos); exigirCentavos(iofCentavos);
  const fluxo = parcelas ?? Array.from({ length: exigirPrazo(n) }, (_, k) => ({ mes: k + 1, centavos: exigirCentavos(parcelaCentavos) }));
  if (!fluxo.length) throw new RangeError("prazo_invalido");
  const recebido = valorLiberadoCentavos - tarifasCentavos - iofCentavos;
  if (recebido <= 0) throw new RangeError("valor_liberado_invalido");
  const totalPago = fluxo.reduce((s, p) => s + p.centavos, 0);
  if (totalPago <= recebido) return { mensalBp: 0, anualBp: 0, mensal: 0, anual: 0, codigo: totalPago === recebido ? "sem_juros" : "paga_menos_que_recebe" };
  let lo = 0, hi = 10;
  for (let k = 0; k < 200; k++) {
    const meio = (lo + hi) / 2;
    if (valorPresente(fluxo, meio) > recebido) lo = meio; else hi = meio;
  }
  const mensal = (lo + hi) / 2, anual = amParaAa(mensal);
  return { mensalBp: bpDeFracao(mensal), anualBp: bpDeFracao(anual), mensal, anual, codigo: "ok" };
}

const METODOS = { avalanche: (a, b) => b.taxaMensalBp - a.taxaMensalBp || a.saldo - b.saldo, bolaDeNeve: (a, b) => a.saldo - b.saldo || b.taxaMensalBp - a.taxaMensalBp };

// Simula a quitação mês a mês: (1) juros do mês sobre cada saldo, arredondados; (2) mínimos pagos
// (limitados ao saldo); (3) a sobra do orçamento vai TODA para o alvo da vez — maior juro (avalanche)
// ou menor saldo (bola de neve). Em empate de critério, o outro critério desempata.
// Códigos: ok | ja_quitada | orcamento_insuficiente (orçamento < Σ mínimos) | nao_converge.
export function simularQuitacao(dividas, orcamentoCentavos, metodo = "avalanche", { maxMeses = 600 } = {}) {
  // `metodo` pode ser uma função de comparação (a, b) sobre { saldo, taxaMensalBp, minimo }: é como o híbrido
  // do plano entra sem copiar a simulação.
  const ordem = typeof metodo === "function" ? metodo : METODOS[metodo];
  if (!ordem) throw new RangeError("metodo_invalido");
  exigirCentavos(orcamentoCentavos);
  const ds = dividas.map((d) => ({ id: d.id, saldo: exigirCentavos(d.saldoCentavos), taxaMensalBp: exigirTaxaNaoNegativa(d.taxaMensalBp), i: fracaoDeBp(d.taxaMensalBp), minimo: exigirCentavos(d.parcelaMinimaCentavos ?? 0) }));
  if (ds.every((d) => d.saldo <= 0)) return { codigo: "ja_quitada", meses: 0, jurosCentavos: 0, pagoCentavos: 0, cronograma: [] };
  const minimos = ds.reduce((s, d) => s + Math.min(d.minimo, d.saldo), 0);
  if (orcamentoCentavos < minimos) return { codigo: "orcamento_insuficiente", faltamCentavos: minimos - orcamentoCentavos, meses: null, jurosCentavos: null, pagoCentavos: null, cronograma: [] };
  let meses = 0, juros = 0, pago = 0;
  const cronograma = [];
  while (ds.some((d) => d.saldo > 0)) {
    if (++meses > maxMeses) return { codigo: "nao_converge", meses: null, jurosCentavos: null, pagoCentavos: null, cronograma };
    let disponivel = orcamentoCentavos;
    const pagamentos = {};
    for (const d of ds) if (d.saldo > 0) { const j = jurosDoPeriodo(d.saldo, d.i); d.saldo += j; juros += j; }
    for (const d of ds) if (d.saldo > 0) { const pg = Math.min(d.minimo, d.saldo, disponivel); d.saldo -= pg; disponivel -= pg; pagamentos[d.id] = pg; }
    for (const d of ds.filter((x) => x.saldo > 0).sort(ordem)) {
      if (disponivel <= 0) break;
      const pg = Math.min(d.saldo, disponivel); d.saldo -= pg; disponivel -= pg; pagamentos[d.id] = (pagamentos[d.id] ?? 0) + pg;
    }
    const pagoMes = orcamentoCentavos - disponivel;
    pago += pagoMes;
    cronograma.push({ mes: meses, pagamentos, pagoCentavos: pagoMes, saldos: Object.fromEntries(ds.map((d) => [d.id, d.saldo])) });
  }
  return { codigo: "ok", meses, jurosCentavos: juros, pagoCentavos: pago, cronograma };
}

// Os dois métodos lado a lado. Avalanche nunca paga mais juros que bola de neve; quando a menor
// dívida também é a de maior juro os dois coincidem (`empate`) — e aí a escolha é só psicológica.
export function compararMetodos(dividas, orcamentoCentavos, opcoes) {
  const avalanche = simularQuitacao(dividas, orcamentoCentavos, "avalanche", opcoes);
  const bolaDeNeve = simularQuitacao(dividas, orcamentoCentavos, "bolaDeNeve", opcoes);
  if (avalanche.codigo !== "ok" || bolaDeNeve.codigo !== "ok") return { avalanche, bolaDeNeve, codigo: avalanche.codigo !== "ok" ? avalanche.codigo : bolaDeNeve.codigo };
  const economiaJurosCentavos = bolaDeNeve.jurosCentavos - avalanche.jurosCentavos;
  return { avalanche, bolaDeNeve, economiaJurosCentavos, mesesDiferenca: bolaDeNeve.meses - avalanche.meses, codigo: economiaJurosCentavos === 0 && bolaDeNeve.meses === avalanche.meses ? "empate" : "avalanche_economiza" };
}

// Quitar a dívida ou investir a sobra? Compara o juro da dívida com o rendimento LÍQUIDO de um
// CDB a 100 % do CDI (IR de 22,5 %, a alíquota mais alta, por prudência): 13,65 % a.a. → 1,072 %
// a.m. bruto → 0,831 % a.m. líquido. Quase toda dívida de consumo perde para isso de longe.
// Exceção que vale mais que a conta: sem reserva de emergência, quitar tudo deixa a pessoa sem
// colchão e a próxima surpresa volta para o rotativo. `reservaCompleta: false` vira aviso.
export function quitarOuInvestir(taxaDividaMensalBp, indices, { irBp = 2250, percentualCdiBp = 10000, reservaCompleta = true, margemBp = 5 } = {}) {
  exigirTaxaNaoNegativa(taxaDividaMensalBp);
  const bruto = aaParaAm(indices.cdiBp) * fracaoDeBp(percentualCdiBp);
  const liquidoBp = bpDeFracao(bruto * (1 - fracaoDeBp(irBp)));
  const diferencaBp = taxaDividaMensalBp - liquidoBp;
  const recomendacao = Math.abs(diferencaBp) <= margemBp ? "indiferente" : diferencaBp > 0 ? "quitar" : "investir";
  const avisos = ["rendimento_media_bcb_nao_o_seu"];
  if (!reservaCompleta) avisos.unshift("nao_zere_a_reserva");
  return { recomendacao, taxaDividaMensalBp, rendimentoLiquidoMensalBp: liquidoBp, rendimentoBrutoMensalBp: bpDeFracao(bruto), diferencaBp, avisos };
}
