// Motor de cartão (v2): fatura, vencimento, limite, estorno, pagamento e parcelas.
// Casos numéricos conferidos à mão (e os do plano, docs/plano-v2.md):
//   fech. dia 10: compra 09/03 → fatura 2026-03, 10/03 → 2026-04
//   10000/3 → [3334,3333,3333]; 9999/4 → [2500,2500,2500,2499]; 100/3 → [34,33,33]
//   rotativo 444,89% a.a. (BCB 22022) sobre R$ 1.000 por 30 dias ≈ R$ 149,53 (5,4489^(30/365) − 1)
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import {
  custoAproximadoRotativo, estornarCompra, faturaDaCompra, fechamentoDaFatura, limiteDisponivel, limiteUsado, pagarFatura, resumoDaFatura, vencimentoDaFatura,
} from "../../app/js/v2/cartao.mjs";
import { cancelarParcelasRestantes, dividirEmParcelas, gerarParcelas, parcelasFuturasPorFatura } from "../../app/js/v2/parcelas.mjs";

const A = { id: "cA", nome: "A", diaFechamento: 10, diaVencimento: 17, fechaInclusivo: false, limiteCentavos: 100000, contaPagamentoId: "conta1" };
const B = { id: "cB", nome: "B", diaFechamento: 31, diaVencimento: 7, fechaInclusivo: false, limiteCentavos: 50000, contaPagamentoId: "conta1" };
const contador = () => { let n = 0; return () => `id${++n}`; };
const compra = (id, data, centavos, extra = {}) => ({ id, data, tipo: "despesa", centavos, categoriaId: "mercado", descricao: "", tags: [], cartaoId: "cA", meio: "credito", moeda: "BRL", status: "efetivado", ...extra });

test("nenhum módulo do v2 fala com a rede (fetch/XHR/beacon) nem usa 'estourou'", () => {
  const pasta = new URL("../../app/js/v2/", import.meta.url);
  const arquivos = readdirSync(pasta).filter((f) => f.endsWith(".mjs"));
  assert.ok(arquivos.length >= 7, "os 7 módulos da área 2 existem");
  for (const f of arquivos) {
    const texto = readFileSync(new URL(f, pasta), "utf8");
    for (const proibido of ["fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "document.", "window.", "estourou", "estourar"]) assert.ok(!texto.includes(proibido), `${f} contém ${proibido}`);
  }
});

test("compra antes do dia de fechamento cai na fatura do mês; no dia ou depois cai na seguinte (fechaInclusivo inverte o empate)", () => {
  assert.equal(faturaDaCompra(A, "2026-03-09"), "2026-03");
  assert.equal(faturaDaCompra(A, "2026-03-10"), "2026-04");
  assert.equal(faturaDaCompra({ ...A, fechaInclusivo: true }, "2026-03-10"), "2026-03");
  assert.equal(faturaDaCompra({ ...A, fechaInclusivo: true }, "2026-03-11"), "2026-04");
  assert.equal(faturaDaCompra(A, "2026-12-15"), "2027-01", "vira o ano");
});

test("fechamento dia 31 em fevereiro vira 28 (ou 29 no bissexto) e o vencimento menor que o fechamento vai para o mês seguinte", () => {
  assert.equal(fechamentoDaFatura(B, "2026-02"), "2026-02-28");
  assert.equal(fechamentoDaFatura(B, "2028-02"), "2028-02-29");
  assert.equal(faturaDaCompra(B, "2026-02-27"), "2026-02");
  assert.equal(faturaDaCompra(B, "2026-02-28"), "2026-03", "no dia do fechamento ajustado já é a próxima");
  assert.equal(vencimentoDaFatura(B, "2026-02"), "2026-03-07");
  assert.equal(vencimentoDaFatura(B, "2026-12"), "2027-01-07", "vencimento vira o ano");
  assert.equal(vencimentoDaFatura(A, "2026-03"), "2026-03-17");
  assert.equal(vencimentoDaFatura({ ...A, diaVencimento: 10 }, "2026-03"), "2026-04-10", "vencer no dia do fechamento é impossível: vai para o mês seguinte");
});

const base = () => [compra("c1", "2026-03-05", 10000), compra("c2", "2026-03-12", 5000), { id: "e1", data: "2026-03-08", tipo: "estorno", centavos: 2000, categoriaId: "mercado", cartaoId: "cA", fatura: "2026-03", refId: "c1", status: "efetivado" }];

test("resumo da fatura: total = compras − estornos; status futura → aberta → fechada → vencida/paga conforme o dia", () => {
  const ls = base();
  const aberta = resumoDaFatura(A, ls, "2026-03", "2026-03-08");
  assert.equal(aberta.status, "aberta");
  assert.equal(aberta.totalCentavos, 8000);
  assert.equal(aberta.comprasCentavos, 10000);
  assert.equal(aberta.diasParaFechar, 2);
  assert.equal(aberta.diasParaVencer, 9);
  assert.equal(aberta.itens, 2, "a compra de 12/03 é da fatura seguinte");
  assert.equal(resumoDaFatura(A, ls, "2026-04", "2026-03-08").status, "futura");
  const fechada = resumoDaFatura(A, ls, "2026-03", "2026-03-12");
  assert.equal(fechada.status, "fechada");
  assert.equal(fechada.diasParaFechar, -2);
  assert.equal(fechada.diasParaVencer, 5);
  assert.equal(resumoDaFatura(A, ls, "2026-03", "2026-03-18").status, "vencida");
  assert.equal(resumoDaFatura(A, [], "2026-03", "2026-03-18").status, "paga", "fatura zerada fechada não fica vencida");
});

test("pagar a fatura é transferência, não despesa: parcial deixa 'parcial', o resto fecha em 'paga' e excedente aparece", () => {
  const novoId = contador();
  const ls = base();
  const p1 = pagarFatura({ cartao: A, lancamentos: ls, ym: "2026-03", centavos: 3000, data: "2026-03-15", novoId });
  assert.equal(p1.lancamento.tipo, "transferencia");
  assert.equal(p1.lancamento.contaId, "conta1");
  assert.equal(p1.fatura.status, "parcial");
  assert.equal(p1.fatura.pagoCentavos, 3000);
  const ls2 = [...ls, p1.lancamento];
  const r = resumoDaFatura(A, ls2, "2026-03", "2026-03-16");
  assert.equal(r.pagoCentavos, 3000);
  assert.equal(r.restanteCentavos, 5000);
  assert.equal(r.comprasCentavos, 10000, "o pagamento não entrou como compra");
  const p2 = pagarFatura({ cartao: A, lancamentos: ls2, ym: "2026-03", centavos: 6000, data: "2026-03-16", novoId });
  assert.equal(p2.fatura.status, "paga");
  assert.equal(p2.excedenteCentavos, 1000);
  assert.equal(resumoDaFatura(A, [...ls2, p2.lancamento], "2026-03", "2026-03-20").status, "paga");
  assert.throws(() => pagarFatura({ cartao: A, lancamentos: ls, ym: "2026-03", centavos: 0, data: "2026-03-16", novoId }), RangeError);
});

test("limite usado = fatura aberta + fechada não paga + parcelas futuras; pagar a fechada libera limite", () => {
  const novoId = contador();
  const parcelas = gerarParcelas({ compra: compra("c3", "2026-03-12", 30000), cartao: A, n: 3, novoId });
  const ls = [...base(), ...parcelas];
  assert.equal(limiteUsado(A, ls, "2026-03-08"), 43000, "aberta 2026-03 (8000) + 2026-04 (5000) + 3×10000");
  assert.equal(limiteUsado(A, ls, "2026-03-12"), 43000, "2026-03 fechou sem pagar: continua comprometendo");
  assert.equal(limiteDisponivel(A, ls, "2026-03-12"), 57000);
  const pago = pagarFatura({ cartao: A, lancamentos: ls, ym: "2026-03", centavos: 8000, data: "2026-03-15", novoId }).lancamento;
  assert.equal(limiteUsado(A, [...ls, pago], "2026-03-16"), 35000);
  assert.equal(limiteUsado(B, ls, "2026-03-16"), 0, "lançamentos de outro cartão não contam");
});

test("estorno de compra parcelada: devolve as parcelas já cobradas na fatura do estorno e CANCELA (sem apagar) as restantes", () => {
  const novoId = contador();
  const c = compra("c3", "2026-03-12", 30000);
  const parcelas = gerarParcelas({ compra: c, cartao: A, n: 3, novoId }); // faturas 2026-04, 05, 06
  const ls = [...base(), ...parcelas];
  const r = estornarCompra({ cartao: A, compra: parcelas[0], lancamentos: ls, data: "2026-05-05", novoId });
  assert.equal(r.estorno.tipo, "estorno");
  assert.equal(r.estorno.fatura, "2026-05");
  assert.equal(r.estorno.centavos, 20000, "parcelas 1 e 2 já cobradas");
  assert.equal(r.estorno.refId, parcelas[0].id);
  assert.deepEqual(r.cancelados, [parcelas[2].id]);
  assert.equal(r.lancamentos.length, ls.length + 1, "nada foi apagado");
  const cancelada = r.lancamentos.find((l) => l.id === parcelas[2].id);
  assert.equal(cancelada.status, "cancelado");
  assert.equal(cancelada.canceladoPor, r.estorno.id);
  assert.equal(ls.find((l) => l.id === parcelas[2].id).status, "efetivado", "a lista original não foi mutada");
  assert.equal(resumoDaFatura(A, r.lancamentos, "2026-05", "2026-05-05").totalCentavos, -10000, "parcela 2 (10000) − estorno (20000): crédito");
  assert.equal(resumoDaFatura(A, r.lancamentos, "2026-06", "2026-05-05").totalCentavos, 0, "parcela cancelada não cobra");
  assert.throws(() => estornarCompra({ cartao: A, compra: parcelas[0], lancamentos: ls, data: "2026-05-05", novoId, centavos: 20001 }), RangeError, "não devolve mais do que cobrou");
});

test("estorno de compra à vista reduz a fatura em que entrou; estorno parcial é permitido", () => {
  const novoId = contador();
  const ls = [compra("c1", "2026-03-05", 10000)];
  const total = estornarCompra({ cartao: A, compra: ls[0], lancamentos: ls, data: "2026-03-20", novoId });
  assert.equal(total.estorno.centavos, 10000);
  assert.equal(total.estorno.fatura, "2026-04", "o banco devolveu depois do fechamento: crédito na fatura seguinte");
  assert.deepEqual(total.cancelados, []);
  const parcial = estornarCompra({ cartao: A, compra: ls[0], lancamentos: ls, data: "2026-03-06", novoId, centavos: 2500 });
  assert.equal(resumoDaFatura(A, parcial.lancamentos, "2026-03", "2026-03-07").totalCentavos, 7500);
});

test("custo do rotativo é só aproximado pela média de mercado e vem rotulado; nunca calcula mínimo nem a taxa da pessoa", () => {
  const r = custoAproximadoRotativo(100000, 44489, 30);
  assert.equal(r.custoCentavos, 14953);
  assert.equal(r.taxaPeriodoBp, 1495);
  assert.equal(r.fonte, "media_mercado");
  assert.equal(custoAproximadoRotativo(100000, 10000, 365).custoCentavos, 100000, "100% a.a. por um ano dobra");
  assert.equal(custoAproximadoRotativo(0, 44489).custoCentavos, 0);
  assert.throws(() => custoAproximadoRotativo(-1, 44489), RangeError);
  const texto = readFileSync(new URL("../../app/js/v2/cartao.mjs", import.meta.url), "utf8");
  assert.ok(!/export function (pagamentoMinimo|jurosRotativo)/.test(texto));
});

test("dividir em parcelas: resto nas primeiras, soma sempre fecha, N=1 devolve o total, N=0 e negativo são inválidos", () => {
  assert.deepEqual(dividirEmParcelas(10000, 3), [3334, 3333, 3333]);
  assert.deepEqual(dividirEmParcelas(9999, 4), [2500, 2500, 2500, 2499]);
  assert.deepEqual(dividirEmParcelas(100, 3), [34, 33, 33]);
  assert.deepEqual(dividirEmParcelas(500, 1), [500]);
  assert.deepEqual(dividirEmParcelas(0, 3), [0, 0, 0]);
  for (let total = 1; total <= 200; total++) for (let n = 1; n <= 13; n++) {
    const p = dividirEmParcelas(total, n);
    assert.equal(p.reduce((s, x) => s + x, 0), total, `${total}/${n} soma`);
    assert.ok(p[0] - p[p.length - 1] <= 1, `${total}/${n} diferença máxima de 1 centavo`);
    assert.ok(p.every((x, i) => i === 0 || x <= p[i - 1]), `${total}/${n} não cresce`);
  }
  assert.throws(() => dividirEmParcelas(100, 0), RangeError);
  assert.throws(() => dividirEmParcelas(100, 2.5), RangeError);
  assert.throws(() => dividirEmParcelas(-100, 2), RangeError);
  assert.throws(() => dividirEmParcelas(100.5, 2), RangeError);
});

test("12x atravessando dezembro: uma parcela por fatura consecutiva, mesma data de compra, grupo e numeração", () => {
  const novoId = contador();
  const ps = gerarParcelas({ compra: compra("c9", "2026-05-20", 120000), cartao: A, n: 12, novoId });
  assert.equal(ps.length, 12);
  assert.deepEqual(ps.map((p) => p.fatura), ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05"]);
  assert.ok(ps.every((p) => p.centavos === 10000 && p.data === "2026-05-20" && p.status === "efetivado" && p.parcela.grupoId === "c9" && p.parcela.de === 12));
  assert.deepEqual(ps.map((p) => p.parcela.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(new Set(ps.map((p) => p.id)).size, 12, "ids únicos");
  assert.equal(gerarParcelas({ compra: compra("c9", "2026-05-20", 120000), cartao: A, n: 1, novoId })[0].parcela.de, 1);
  assert.throws(() => gerarParcelas({ compra: compra("c9", "2026-05-20", 120000), cartao: A, n: 0, novoId }), RangeError);
});

test("parcelas futuras agrupadas por fatura e vencimento, da fatura aberta em diante; cancelar restantes marca só as depois do mês", () => {
  const novoId = contador();
  const ps = gerarParcelas({ compra: compra("c9", "2026-05-20", 120000), cartao: A, n: 12, novoId });
  const fut = parcelasFuturasPorFatura(A, ps, "2026-12-01");
  assert.deepEqual(fut.map((f) => f.ym), ["2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05"]);
  assert.equal(fut[0].vencimento, "2026-12-17");
  assert.equal(fut[1].vencimento, "2027-01-17");
  assert.ok(fut.every((f) => f.centavos === 10000 && f.parcelas === 1));
  const canceladas = cancelarParcelasRestantes(ps, { grupoId: "c9", depoisDeYm: "2027-02", motivoId: "e9" });
  assert.equal(canceladas.filter((l) => l.status === "cancelado").length, 3);
  assert.ok(canceladas.filter((l) => l.status === "cancelado").every((l) => l.canceladoPor === "e9" && l.fatura > "2027-02"));
  assert.deepEqual(parcelasFuturasPorFatura(A, canceladas, "2026-12-01").map((f) => f.ym), ["2026-12", "2027-01", "2027-02"]);
});
