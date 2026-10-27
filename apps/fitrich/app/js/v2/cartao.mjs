// Cartão de crédito como objeto de primeira classe: fatura, fechamento, vencimento, limite,
// estorno e pagamento. Tudo puro: `hoje` chega de fora e nenhum lançamento recebido é mutado
// (as funções devolvem cópias novas), para a camada de dados decidir o que gravar.
//
// Vocabulário: a fatura "AAAA-MM" é a que FECHA nesse mês. Compra antes do dia de fechamento
// entra nela; no dia do fechamento ou depois cai na seguinte (`fechaInclusivo` inverte o
// empate: a compra feita no dia do fechamento ainda entra). Dia de fechamento que não existe
// no mês (31 em fevereiro) vira o último dia do mês, como o banco faz.
//
// O que NÃO está aqui de propósito: pagamento mínimo e juros do rotativo da pessoa. Desde a
// Res. CMN 4.655/2018 o mínimo é definido por cada instituição, e a taxa é a do contrato dela;
// o app só mostra um custo aproximado com a MÉDIA de mercado (BCB), rotulado como tal.
import { diasEntre, mesDe, somarMeses, ultimoDiaDoMes } from "../datas.mjs";

const arredondar = (x) => Math.sign(x) * Math.round(Math.abs(x)); // half-up sobre o módulo: Math.round(-2.5) daria -2

function diaNoMes(ym, dia) {
  const ultimo = ultimoDiaDoMes(ym);
  const d = Math.min(dia, Number(ultimo.slice(8, 10)));
  return `${ym}-${String(d).padStart(2, "0")}`;
}

export function fechamentoDaFatura(cartao, ym) {
  return diaNoMes(ym, cartao.diaFechamento);
}

// Vencimento depois do fechamento no mesmo mês (fecha 10, vence 17); se o dia de vencimento não vem
// depois do de fechamento (fecha 25, vence 5), a fatura vence no mês seguinte.
export function vencimentoDaFatura(cartao, ym) {
  const mes = cartao.diaVencimento > cartao.diaFechamento ? ym : somarMeses(ym, 1);
  return diaNoMes(mes, cartao.diaVencimento);
}

export function faturaDaCompra(cartao, dataISO) {
  const ym = mesDe(dataISO);
  const fechamento = fechamentoDaFatura(cartao, ym);
  const entra = cartao.fechaInclusivo ? dataISO <= fechamento : dataISO < fechamento;
  return entra ? ym : somarMeses(ym, 1);
}

// Fatura em que um lançamento conta: a gravada nele, ou a derivada da data da compra.
export const faturaDoLancamento = (cartao, l) => l.fatura ?? faturaDaCompra(cartao, l.data);

const doCartao = (cartao, l) => l.cartaoId === cartao.id && l.status !== "cancelado";
const ehCompra = (l) => l.tipo === "despesa";
const ehPagamento = (l) => l.tipo === "transferencia"; // transferência de uma conta para o cartão = pagamento de fatura

function somaDaFatura(cartao, lancamentos, ym) {
  let compras = 0, estornos = 0, pago = 0;
  const itens = [];
  for (const l of lancamentos) {
    if (!doCartao(cartao, l) || faturaDoLancamento(cartao, l) !== ym) continue;
    if (ehCompra(l)) { compras += l.centavos; itens.push(l); }
    else if (l.tipo === "estorno") { estornos += l.centavos; itens.push(l); }
    else if (ehPagamento(l)) pago += l.centavos;
  }
  return { compras, estornos, pago, itens, total: compras - estornos };
}

export function resumoDaFatura(cartao, lancamentos, ym, hoje) {
  const fechamento = fechamentoDaFatura(cartao, ym);
  const vencimento = vencimentoDaFatura(cartao, ym);
  const { compras, estornos, pago, itens, total } = somaDaFatura(cartao, lancamentos, ym);
  const restante = Math.max(0, total - pago);
  const aberta = faturaDaCompra(cartao, hoje);
  let status;
  if (ym > aberta) status = "futura";
  else if (ym === aberta) status = "aberta";
  else if (restante === 0) status = "paga";
  else if (hoje > vencimento) status = "vencida";
  else status = "fechada";
  return {
    ym, fechamento, vencimento, status,
    totalCentavos: total, comprasCentavos: compras, estornosCentavos: estornos, pagoCentavos: pago, restanteCentavos: restante,
    diasParaFechar: diasEntre(hoje, fechamento), // negativo = já fechou
    diasParaVencer: diasEntre(hoje, vencimento), // negativo = já venceu
    parcelas: itens.filter((l) => l.parcela),
    itens: itens.length,
  };
}

// Limite comprometido = fatura aberta + fechadas ainda não pagas + parcelas e compras em faturas futuras.
// A fechada não paga entra porque o banco só libera o limite quando o pagamento cai.
export function limiteUsado(cartao, lancamentos, hoje) {
  const aberta = faturaDaCompra(cartao, hoje);
  const faturas = new Set();
  for (const l of lancamentos) if (doCartao(cartao, l)) faturas.add(faturaDoLancamento(cartao, l));
  let usado = 0;
  for (const ym of faturas) {
    const { total, pago } = somaDaFatura(cartao, lancamentos, ym);
    usado += ym >= aberta ? total - pago : Math.max(0, total - pago);
  }
  return usado;
}

export function limiteDisponivel(cartao, lancamentos, hoje) {
  return cartao.limiteCentavos - limiteUsado(cartao, lancamentos, hoje);
}

// Estorno de uma compra (à vista ou parcelada). O lançamento `estorno` entra na fatura da data em
// que o banco devolveu o dinheiro e aponta a compra por `refId`. Numa compra parcelada, as parcelas
// já cobradas (fatura ≤ a do estorno) são o valor devolvido; as que ainda viriam são MARCADAS como
// `status: "cancelado"` (nunca apagadas: o histórico tem de explicar por que a parcela sumiu).
// `centavos` permite estorno parcial. Devolve a lista nova e o que mudou.
// `agora` (função ou ISO) carimba `atualizadoEm` no estorno e nas parcelas canceladas: o merge por arquivo
// decide por esse carimbo, e como esta função devolve a lista inteira (sem passar por `adicionar`/`editar`)
// o carimbo tem de vir daqui.
export function estornarCompra({ cartao, compra, lancamentos, data, novoId, centavos, agora = null }) {
  const t = typeof agora === "function" ? agora() : agora;
  const ymEstorno = faturaDaCompra(cartao, data);
  const grupo = compra.parcela?.grupoId;
  const irmas = grupo ? lancamentos.filter((l) => l.parcela?.grupoId === grupo && l.status !== "cancelado") : [compra];
  const cobradas = irmas.filter((l) => faturaDoLancamento(cartao, l) <= ymEstorno);
  const restantes = irmas.filter((l) => faturaDoLancamento(cartao, l) > ymEstorno);
  const devolvido = cobradas.reduce((s, l) => s + l.centavos, 0);
  const valor = centavos ?? devolvido;
  if (!Number.isInteger(valor) || valor < 0 || valor > devolvido) throw new RangeError("estorno maior que o cobrado ou inválido");
  const id = novoId();
  const estorno = {
    id, data, tipo: "estorno", centavos: valor, categoriaId: compra.categoriaId, descricao: compra.descricao ?? "", tags: compra.tags ?? [],
    cartaoId: cartao.id, fatura: ymEstorno, meio: "credito", moeda: compra.moeda ?? "BRL", status: "efetivado", refId: compra.id, origem: "manual",
    ...(t ? { atualizadoEm: t } : {}),
  };
  const canceladas = new Set(restantes.map((l) => l.id));
  const lista = lancamentos.map((l) => (canceladas.has(l.id) ? { ...l, status: "cancelado", canceladoPor: id, ...(t ? { atualizadoEm: t } : {}) } : l));
  lista.push(estorno);
  return { estorno, cancelados: [...canceladas], lancamentos: lista };
}

// Pagamento (parcial ou total) de uma fatura: transferência da conta para o cartão. Não é despesa
// (a despesa foi a compra), então não entra em categoria nem em orçamento. Devolve o lançamento e o
// registro da fatura para `faturas` (só o que não é derivável: quanto já foi pago).
export function pagarFatura({ cartao, lancamentos, ym, centavos, data, contaId, novoId }) {
  if (!Number.isInteger(centavos) || centavos <= 0) throw new RangeError("pagamento precisa ser inteiro positivo em centavos");
  const { total, pago } = somaDaFatura(cartao, lancamentos, ym);
  const lancamento = {
    id: novoId(), data, tipo: "transferencia", centavos, categoriaId: null, descricao: "", tags: [],
    contaId: contaId ?? cartao.contaPagamentoId, cartaoId: cartao.id, fatura: ym, meio: "outro", moeda: "BRL", status: "efetivado", origem: "manual",
  };
  const pagoCentavos = pago + centavos;
  return {
    lancamento,
    fatura: { cartaoId: cartao.id, ym, status: pagoCentavos >= total ? "paga" : "parcial", pagoCentavos, pagamentoLancId: lancamento.id },
    excedenteCentavos: Math.max(0, pagoCentavos - total), // pagou a mais: vira crédito na fatura seguinte, decisão da UI
  };
}

// Custo aproximado de deixar `saldoCentavos` no rotativo por `dias`, pela taxa anual MÉDIA de mercado
// (BCB SGS 22022, em basis points, vinda do snapshot de índices). Não é a taxa da pessoa: o rótulo
// `fonte: "media_mercado"` tem de ir para a tela junto com o número.
export function custoAproximadoRotativo(saldoCentavos, taxaAnualBpMedia, dias = 30) {
  if (!Number.isInteger(saldoCentavos) || saldoCentavos < 0) throw new RangeError("saldo em centavos inteiros, não negativo");
  const fator = Math.pow(1 + taxaAnualBpMedia / 10000, dias / 365) - 1;
  return { custoCentavos: arredondar(saldoCentavos * fator), taxaPeriodoBp: arredondar(fator * 10000), dias, fonte: "media_mercado" };
}
