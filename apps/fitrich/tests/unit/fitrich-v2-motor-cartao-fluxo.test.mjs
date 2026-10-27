// Fluxo de caixa, "dá para gastar hoje" e orçamento (v2). Casos conferidos à mão:
//   safe-to-spend do plano: (5000 − 1800 − 400 − 500 − 900) / 21 dias = 66,666… → R$ 66,66 (floor)
//   fluxo: saldo 800,00; conta prevista −300,00 em 15/03; fatura 600,00 vence 17/03 → menor saldo −100,00 em 17/03
//   sinking fund: 1.200,00 em 7 meses → ceil(171,4285…) = 171,43 × 7 = 1.200,01 (sobra 0,01)
import assert from "node:assert/strict";
import { test } from "node:test";
import { projetarFluxo, saldoDaConta } from "../../app/js/v2/fluxo.mjs";
import { podeGastarHoje } from "../../app/js/v2/gastar-hoje.mjs";
import { cinquentaTrintaVinte, envelopes, estadoLimites, gastoPorCategoria, sinkingFund } from "../../app/js/v2/orcamento.mjs";

const A = { id: "cA", nome: "A", diaFechamento: 10, diaVencimento: 17, fechaInclusivo: false, limiteCentavos: 100000, contaPagamentoId: "conta1" };
const conta = { id: "conta1", nome: "Corrente", tipo: "corrente", moeda: "BRL", saldoInicialCentavos: 100000, dataSaldoInicial: "2026-03-01", arquivada: false };
const L = (data, tipo, centavos, extra = {}) => ({ id: `${data}-${tipo}-${centavos}`, data, tipo, centavos, categoriaId: "mercado", contaId: "conta1", status: "efetivado", ...extra });
const salario = { id: "sal", nome: "Salário", tipo: "receita", centavos: 500000, categoriaId: "salario", contaId: "conta1", freq: "mensal", intervalo: 1, diaDoMes: 5, ajuste: "ultimoDia", inicio: "2026-01-05", ativa: true };
const cenario = () => ({
  contas: [conta],
  lancamentos: [
    L("2026-03-09", "despesa", 20000),
    L("2026-03-15", "despesa", 30000, { status: "previsto" }),
    L("2026-03-05", "despesa", 60000, { contaId: undefined, cartaoId: "cA", fatura: "2026-03", meio: "credito" }),
    L("2026-03-12", "despesa", 20000, { contaId: undefined, cartaoId: "cA", meio: "credito" }), // fatura 2026-04 derivada da data
  ],
  recorrencias: [salario],
  cartoes: [A],
  hoje: "2026-03-10",
});
const no = (r, data) => r.serie.find((p) => p.data === data).saldoCentavos;

test("saldo da conta: saldo inicial no fecho da data + efetivados depois; previsto e transferência de entrada contam certo", () => {
  const ls = [L("2026-03-01", "despesa", 999), L("2026-03-09", "despesa", 20000), L("2026-03-15", "despesa", 30000, { status: "previsto" }),
    L("2026-03-02", "transferencia", 5000, { contaId: "outra", contaDestinoId: "conta1" }), L("2026-03-03", "receita", 100, { contaId: "outra" })];
  assert.equal(saldoDaConta(conta, ls, "2026-03-10"), 85000, "o lançamento do dia do saldo inicial já está no saldo informado");
});

test("fluxo de 30 dias: compra no cartão sai no VENCIMENTO da fatura, não na compra; menor saldo e primeiro dia negativo saem certos", () => {
  const r = projetarFluxo(cenario());
  assert.equal(r.saldoHojeCentavos, 80000);
  assert.equal(r.serie.length, 31);
  assert.equal(no(r, "2026-03-12"), 80000, "a compra de 12/03 não debitou a conta");
  assert.equal(no(r, "2026-03-15"), 50000);
  assert.equal(no(r, "2026-03-17"), -10000, "fatura 2026-03 (600,00) vence 17/03");
  assert.equal(no(r, "2026-04-05"), 490000, "salário previsto pela recorrência");
  assert.equal(r.menorSaldoCentavos, -10000);
  assert.equal(r.dataDoMenorSaldo, "2026-03-17");
  assert.equal(r.primeiroDiaNegativo, "2026-03-17");
  assert.equal(r.saldoFinalCentavos, 490000, "fatura 2026-04 vence 17/04, fora dos 30 dias");
  assert.deepEqual(r.faturas, [{ cartaoId: "cA", ym: "2026-03", vencimento: "2026-03-17", centavos: 60000 }]);
});

test("fluxo de 60 dias inclui a fatura seguinte e o 2º salário; recorrência já materializada não conta duas vezes", () => {
  const c = cenario();
  assert.equal(projetarFluxo({ ...c, dias: 60 }).saldoFinalCentavos, 970000, "490000 − 20000 (fatura 04) + 500000 (05/05)");
  c.lancamentos.push(L("2026-04-05", "receita", 500000, { status: "previsto", recorrenciaId: "sal" }));
  assert.equal(projetarFluxo(c).saldoFinalCentavos, 490000);
  assert.equal(projetarFluxo({ ...c, dias: 60 }).saldoFinalCentavos, 970000);
});

test("recorrência no cartão cai na fatura (vencimento), previsto atrasado cai hoje, transferência e conta arquivada ficam de fora", () => {
  const c = cenario();
  c.recorrencias.push({ id: "stream", nome: "Streaming", tipo: "despesa", centavos: 3000, categoriaId: "lazer", cartaoId: "cA", freq: "mensal", intervalo: 1, diaDoMes: 1, inicio: "2026-01-01", ativa: true });
  const r60 = projetarFluxo({ ...c, dias: 60 });
  assert.equal(r60.saldoFinalCentavos, 967000, "01/04 → fatura 2026-04 (vence 17/04); 01/05 → fatura 2026-05 vence 17/05, fora");
  assert.equal(no(r60, "2026-04-01"), no(r60, "2026-03-31"), "não saiu da conta no dia 1º");
  c.lancamentos.push(L("2026-03-01", "despesa", 5000, { status: "previsto" }));
  c.lancamentos.push(L("2026-03-20", "transferencia", 99999, { status: "previsto", contaDestinoId: "conta2" }));
  c.contas.push({ ...conta, id: "arq", saldoInicialCentavos: 1, arquivada: true });
  const r = projetarFluxo(c);
  assert.equal(r.serie[0].saldoCentavos, 75000, "previsto de 01/03 ainda não pago pesa no dia 0");
  assert.equal(r.saldoFinalCentavos, 485000, "transferência e conta arquivada não entram; o streaming de 01/04 está na fatura 04, que vence 17/04, fora dos 30 dias");
});

test("fluxo só aceita 30, 60 ou 90 dias", () => {
  assert.throws(() => projetarFluxo({ ...cenario(), dias: 45 }), RangeError);
  assert.equal(projetarFluxo({ ...cenario(), dias: 90 }).serie.length, 91);
});

test("dá para gastar hoje: caso do plano (R$ 66,66 por dia com 21 dias), último dia do mês, valor negativo com flag, meses de 28/29/30/31 dias", () => {
  const plano = podeGastarHoje({ receitaPrevistaMes: 500000, fixasRestantes: 180000, parcelasCartaoMes: 40000, aportesMetas: 50000, gastoVariavelFeito: 90000, hoje: "2026-10-11" });
  assert.equal(plano.diasRestantes, 21);
  assert.equal(plano.porDiaCentavos, 6666);
  assert.equal(plano.disponivelMesCentavos, 140000);
  assert.equal(plano.codigo, "ok");
  assert.equal(plano.acimaDoLimite, false);
  const ultimo = podeGastarHoje({ receitaPrevistaMes: 500000, fixasRestantes: 180000, hoje: "2026-10-31" });
  assert.equal(ultimo.diasRestantes, 1);
  assert.equal(ultimo.porDiaCentavos, 320000);
  const neg = podeGastarHoje({ receitaPrevistaMes: 100000, fixasRestantes: 150000, hoje: "2026-10-11" });
  assert.equal(neg.porDiaCentavos, -2381, "floor de −2380,95");
  assert.equal(neg.acimaDoLimite, true);
  assert.equal(neg.codigo, "acima_do_limite");
  assert.deepEqual(["2026-02-01", "2028-02-01", "2026-04-01", "2026-01-01"].map((hoje) => podeGastarHoje({ receitaPrevistaMes: 1, hoje }).diasRestantes), [28, 29, 30, 31]);
  const zero = podeGastarHoje({ hoje: "2026-10-11" });
  assert.equal(zero.codigo, "sem_receita");
  assert.equal(zero.porDiaCentavos, 0);
  assert.throws(() => podeGastarHoje({ receitaPrevistaMes: -1, hoje: "2026-10-11" }), RangeError);
  assert.throws(() => podeGastarHoje({ receitaPrevistaMes: 10.5, hoje: "2026-10-11" }), RangeError);
});

const G = (data, centavos, categoriaId = "lazer", extra = {}) => ({ id: `${data}${centavos}${categoriaId}`, data, tipo: "despesa", centavos, categoriaId, contaId: "conta1", status: "efetivado", ...extra });

test("limites: 79% ok, 80% atenção, 100% atenção, 101% 'passou' (nunca 'estourou'); estorno abate, transferência não conta, limite zero não divide", () => {
  const est = (c) => estadoLimites({ lancamentos: [G("2026-10-02", c)], ym: "2026-10", limites: { lazer: 10000 } })[0];
  assert.equal(est(7900).estado, "ok");
  assert.equal(est(8000).estado, "atencao");
  assert.equal(est(10000).estado, "atencao");
  assert.equal(est(10100).estado, "passou");
  assert.equal(est(10100).restanteCentavos, -100);
  const ls = [G("2026-10-02", 9000), { ...G("2026-10-03", 2000), tipo: "estorno", refId: "x" }, { ...G("2026-10-04", 50000), tipo: "transferencia", contaDestinoId: "c2" },
    G("2026-10-05", 100, "lazer", { status: "cancelado" }), G("2026-09-30", 99999)];
  const r = estadoLimites({ lancamentos: ls, ym: "2026-10", limites: { lazer: 10000, mercado: 0 } });
  assert.equal(r[0].gastoCentavos, 7000);
  assert.equal(r[0].pct, 70);
  assert.equal(r[1].estado, "sem_limite");
  assert.equal(r[1].pct, null);
  assert.deepEqual(gastoPorCategoria(ls, "2026-10"), { lazer: 7000 });
});

test("envelopes com rollover: sobra e falta passam para o mês seguinte (negativo permitido); sem rollover é só o limite", () => {
  const ls = [G("2026-08-10", 30000), G("2026-09-10", 60000), G("2026-10-10", 10000)];
  const env = (ym, rollover = true) => envelopes({ lancamentos: ls, ym, limites: { lazer: 50000 }, rollover, inicioYm: "2026-08" })[0];
  assert.equal(env("2026-08").saldoCentavos, 20000);
  assert.equal(env("2026-09").rolloverCentavos, 20000);
  assert.equal(env("2026-09").saldoCentavos, 10000);
  assert.equal(env("2026-10").saldoCentavos, 50000);
  assert.equal(env("2026-10", false).saldoCentavos, 40000);
  const devendo = envelopes({ lancamentos: [...ls, G("2026-09-11", 30000)], ym: "2026-10", limites: { lazer: 50000 }, inicioYm: "2026-08" })[0];
  assert.equal(devendo.rolloverCentavos, -20000, "setembro gastou 90000 com 70000 disponíveis");
  assert.equal(devendo.saldoCentavos, 20000);
});

test("50/30/20 por grupo de categoria em basis points; desejo acima de 30% 'passou', poupança abaixo de 20% 'abaixo', sem receita bp null", () => {
  const categorias = [{ id: "moradia", grupo: "necessidade" }, { id: "lazer", grupo: "desejo" }, { id: "aporte", grupo: "poupanca" }, { id: "salario", grupo: "necessidade", tipo: "receita" }];
  const ls = [L("2026-10-05", "receita", 500000, { categoriaId: "salario" }), G("2026-10-06", 200000, "moradia"), G("2026-10-07", 200000, "lazer"), G("2026-10-08", 50000, "aporte"),
    { ...G("2026-10-09", 70000, "lazer"), tipo: "transferencia", contaDestinoId: "c2" }];
  const r = cinquentaTrintaVinte({ lancamentos: ls, ym: "2026-10", categorias });
  assert.equal(r.receitaCentavos, 500000);
  assert.deepEqual([r.necessidade.bp, r.desejo.bp, r.poupanca.bp], [4000, 4000, 2000]);
  assert.deepEqual([r.necessidade.estado, r.desejo.estado, r.poupanca.estado], ["ok", "passou", "ok"]);
  assert.equal(r.poupanca.centavos, 100000, "o aporte explícito (50000) + o que sobrou (50000)");
  const pouca = cinquentaTrintaVinte({ lancamentos: ls, ym: "2026-10", categorias, receitaCentavos: 450000 });
  assert.equal(pouca.poupanca.estado, "abaixo");
  assert.equal(cinquentaTrintaVinte({ lancamentos: [], ym: "2026-10", categorias }).desejo.bp, null);
  assert.equal(cinquentaTrintaVinte({ lancamentos: [], ym: "2026-10", categorias }).desejo.estado, "sem_receita");
});

test("sinking fund: aporte arredondado para cima com a sobra à mostra; vence este mês guarda tudo agora; já tem o valor dá aporte zero", () => {
  const r = sinkingFund({ alvoCentavos: 120000, vencimento: "2027-05-10", hoje: "2026-10-05" });
  assert.equal(r.mesesAteVencer, 7);
  assert.equal(r.aporteCentavos, 17143);
  assert.equal(r.sobraCentavos, 1);
  assert.equal(r.concluida, false);
  const agora = sinkingFund({ alvoCentavos: 120000, atualCentavos: 20000, vencimento: "2026-10-20", hoje: "2026-10-05" });
  assert.equal(agora.mesesAteVencer, 1);
  assert.equal(agora.aporteCentavos, 100000);
  const pronto = sinkingFund({ alvoCentavos: 120000, atualCentavos: 130000, vencimento: "2027-05-10", hoje: "2026-10-05" });
  assert.equal(pronto.aporteCentavos, 0);
  assert.equal(pronto.concluida, true);
  assert.equal(sinkingFund({ alvoCentavos: 100, vencimento: "2026-01-10", hoje: "2026-10-05" }).vencido, true);
  assert.throws(() => sinkingFund({ alvoCentavos: 10.5, vencimento: "2027-05-10", hoje: "2026-10-05" }), RangeError);
});
