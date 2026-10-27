// Fluxo de caixa projetado (30/60/90 dias): saldo das contas hoje + o que está previsto entrar −
// o que está previsto sair, dia a dia. O número útil não é a curva, é o menor saldo e a data dele
// (e o primeiro dia em que ficaria negativo): é isso que evita o cheque especial.
//
// Regras: compra no cartão NÃO sai da conta na data da compra; sai na data de VENCIMENTO da fatura
// (compras e parcelas somadas por fatura). Previsto atrasado (data ≤ hoje e ainda não confirmado)
// conta no dia 0: a conta não desaparece por não ter sido paga. Transferência entre contas próprias
// é neutra no total e é ignorada. Recorrência que já foi materializada (lançamento previsto com
// `recorrenciaId` na data) não conta duas vezes.
import { diasEntre, somarDias, somarMeses } from "../datas.mjs";
import { faturaDaCompra, resumoDaFatura, vencimentoDaFatura } from "./cartao.mjs";
import { proximasOcorrencias } from "./recorrencia.mjs";

const vivo = (l) => l.status !== "cancelado";

// Saldo de uma conta em `hoje`: saldo inicial (fecho do dia `dataSaldoInicial`) + efetivados depois dele.
// O núcleo tem a versão oficial desta conta; esta é a mínima para o fluxo não depender de importar dali.
export function saldoDaConta(conta, lancamentos, hoje) {
  let s = conta.saldoInicialCentavos ?? 0;
  const desde = conta.dataSaldoInicial ?? "0000-00-00";
  for (const l of lancamentos) {
    if (!vivo(l) || l.status !== "efetivado" || l.data <= desde || l.data > hoje) continue;
    if (l.contaId === conta.id) {
      if (l.tipo === "receita") s += l.centavos;
      else if (l.tipo === "despesa" || l.tipo === "transferencia") s -= l.centavos;
      else if (l.tipo === "estorno") s += l.centavos;
    } else if (l.contaDestinoId === conta.id && l.tipo === "transferencia") s += l.centavos;
  }
  return s;
}

export function projetarFluxo({ contas = [], lancamentos = [], recorrencias = [], cartoes = [], hoje, dias = 30 }) {
  if (![30, 60, 90].includes(dias)) throw new RangeError("dias precisa ser 30, 60 ou 90");
  const ate = somarDias(hoje, dias);
  const entradas = new Array(dias + 1).fill(0), saidas = new Array(dias + 1).fill(0);
  const noDia = (data, centavos, ehEntrada) => {
    if (data > ate) return;
    const i = Math.max(0, diasEntre(hoje, data)); // atrasado cai em hoje
    if (ehEntrada) entradas[i] += centavos; else saidas[i] += centavos;
  };

  const ativas = contas.filter((c) => !c.arquivada);
  const saldoHoje = ativas.reduce((s, c) => s + saldoDaConta(c, lancamentos, hoje), 0);
  const idsContas = new Set(ativas.map((c) => c.id));

  // 1. Previstos em conta (receitas e despesas); transferências não mexem no total.
  for (const l of lancamentos) {
    if (!vivo(l) || l.status !== "previsto" || l.cartaoId || !idsContas.has(l.contaId)) continue;
    if (l.tipo === "receita") noDia(l.data, l.centavos, true);
    else if (l.tipo === "despesa") noDia(l.data, l.centavos, false);
  }

  // 2. Faturas de cartão na data de vencimento: fechadas não pagas, aberta e futuras dentro da janela.
  const faturasNaJanela = [];
  for (const cartao of cartoes) {
    const aberta = faturaDaCompra(cartao, hoje);
    const yms = new Set([somarMeses(aberta, -1), aberta]);
    for (const l of lancamentos) if (l.cartaoId === cartao.id && vivo(l)) yms.add(l.fatura ?? faturaDaCompra(cartao, l.data));
    for (const ym of [...yms].sort()) {
      const venc = vencimentoDaFatura(cartao, ym);
      if (venc > ate) continue;
      const r = resumoDaFatura(cartao, lancamentos, ym, hoje);
      let extra = 0; // recorrências no cartão que ainda não viraram lançamento
      for (const rec of recorrencias) {
        if (rec.cartaoId !== cartao.id) continue;
        const ja = new Set(lancamentos.filter((l) => l.recorrenciaId === rec.id).map((l) => l.data));
        for (const d of proximasOcorrencias(rec, somarDias(hoje, 1), ate)) if (!ja.has(d) && faturaDaCompra(cartao, d) === ym) extra += rec.centavos;
      }
      const valor = r.restanteCentavos + extra;
      if (valor <= 0) continue;
      noDia(venc, valor, false);
      faturasNaJanela.push({ cartaoId: cartao.id, ym, vencimento: venc, centavos: valor });
    }
  }

  // 3. Recorrências em conta ainda não materializadas.
  for (const rec of recorrencias) {
    if (rec.cartaoId || !idsContas.has(rec.contaId)) continue;
    const ja = new Set(lancamentos.filter((l) => l.recorrenciaId === rec.id).map((l) => l.data));
    for (const d of proximasOcorrencias(rec, somarDias(hoje, 1), ate)) {
      if (ja.has(d)) continue;
      if (rec.tipo === "receita") noDia(d, rec.centavos, true);
      else if (rec.tipo === "despesa") noDia(d, rec.centavos, false);
    }
  }

  const serie = [];
  let saldo = saldoHoje, menor = Infinity, dataMenor = hoje, primeiroNegativo = null;
  for (let i = 0; i <= dias; i++) {
    saldo += entradas[i] - saidas[i];
    const data = somarDias(hoje, i);
    serie.push({ data, saldoCentavos: saldo, entradasCentavos: entradas[i], saidasCentavos: saidas[i] });
    if (saldo < menor) { menor = saldo; dataMenor = data; }
    if (saldo < 0 && primeiroNegativo === null) primeiroNegativo = data;
  }
  return { hoje, dias, saldoHojeCentavos: saldoHoje, saldoFinalCentavos: saldo, menorSaldoCentavos: menor, dataDoMenorSaldo: dataMenor, primeiroDiaNegativo: primeiroNegativo, serie, faturas: faturasNaJanela };
}
