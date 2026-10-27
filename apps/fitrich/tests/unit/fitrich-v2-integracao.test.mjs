// Costura entre as 4 áreas do Fitrich v2 (núcleo, cartão, patrimônio, importação). Cada área foi escrita
// contra o schema do plano por um agente diferente; nenhum teste de área prova que o dado de uma passa no
// validador da outra. Este arquivo faz o fluxo inteiro de uma pessoa e exige `validar(d).ok` a cada passo.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { test } from "node:test";
import { adicionar, editar, resumoMes, saldoDaConta, validar, vazio } from "../../app/js/v2/esquema.mjs";
import { importarJSON } from "../../app/js/v2/migracao.mjs";
import { estornarCompra, faturaDaCompra, limiteUsado, pagarFatura, resumoDaFatura } from "../../app/js/v2/cartao.mjs";
import { gerarParcelas } from "../../app/js/v2/parcelas.mjs";
import { confirmarOcorrencia, materializar } from "../../app/js/v2/recorrencia.mjs";
import { projetarFluxo } from "../../app/js/v2/fluxo.mjs";
import { patrimonioLiquido } from "../../app/js/v2/patrimonio.mjs";
import { lerOFX, movimentosDoOFX } from "../../app/js/v2/importar/ofx.mjs";
import { aplicarImportacao, desfazerImportacao, prepararImportacao } from "../../app/js/v2/importar/preview.mjs";

let n = 0;
const novoId = () => `t-${String(++n).padStart(4, "0")}`;
const agora = () => "2026-10-05T12:00:00.000Z";
const digest = (bytes) => webcrypto.subtle.digest("SHA-256", bytes);
const ok = (d, onde) => { const v = validar(d); assert.ok(v.ok, `${onde}: ${JSON.stringify(v.erros)}`); return d; };
const FIX = new URL("../fixtures/", import.meta.url);

function base() {
  let d = vazio({ agora });
  d = adicionar(d, "contas", { nome: "Corrente", tipo: "corrente", moeda: "BRL", saldoInicialCentavos: 500000, dataSaldoInicial: "2026-09-01", arquivada: false }, { novoId, agora });
  const conta = d.contas[0];
  d = adicionar(d, "cartoes", { nome: "Cartão", diaFechamento: 10, diaVencimento: 17, fechaInclusivo: false, limiteCentavos: 300000, contaPagamentoId: conta.id }, { novoId, agora });
  return { d: ok(d, "base"), conta, cartao: d.cartoes[0] };
}
const cat = (d, nome) => d.categorias.find((c) => c.nome.toLowerCase().startsWith(nome.toLowerCase())).id;

test("compra parcelada no cartão gerada pelo motor passa no validador do núcleo e o limite usado fecha", () => {
  let { d, cartao } = base();
  const compra = { id: novoId(), data: "2026-10-05", tipo: "despesa", centavos: 10000, categoriaId: cat(d, "Mercado"), descricao: "TV", tags: [], meio: "credito", moeda: "BRL", cartaoId: cartao.id, status: "efetivado", origem: "manual" };
  const parcelas = gerarParcelas({ compra, cartao, n: 3, novoId });
  assert.deepEqual(parcelas.map((p) => p.centavos), [3334, 3333, 3333]);
  for (const p of parcelas) d = adicionar(d, "lancamentos", p, { novoId, agora });
  ok(d, "3 parcelas");
  assert.equal(faturaDaCompra(cartao, "2026-10-05"), "2026-10");
  assert.equal(limiteUsado(cartao, d.lancamentos, "2026-10-06"), 10000);
});

test("estorno de compra parcelada: parcelas futuras ficam canceladas (não apagadas) e o dado ainda valida", () => {
  let { d, cartao } = base();
  const compra = { id: novoId(), data: "2026-10-05", tipo: "despesa", centavos: 9999, categoriaId: cat(d, "Mercado"), descricao: "Geladeira", tags: [], meio: "credito", moeda: "BRL", cartaoId: cartao.id, status: "efetivado", origem: "manual" };
  const parcelas = gerarParcelas({ compra, cartao, n: 4, novoId });
  for (const p of parcelas) d = adicionar(d, "lancamentos", p, { novoId, agora });
  const r = estornarCompra({ cartao, compra: parcelas[0], lancamentos: d.lancamentos, data: "2026-10-20", novoId, centavos: parcelas[0].centavos, agora });
  // estorno dia 20 com fechamento dia 10 cai na fatura 2026-11: as parcelas 1 (out) e 2 (nov) já foram cobradas; 3 e 4 ficam canceladas.
  assert.equal(r.cancelados.length, 2);
  d = ok({ ...d, lancamentos: r.lancamentos }, "depois do estorno");
  assert.equal(d.lancamentos.length, 5, "nada foi apagado: 4 parcelas + 1 estorno");
  assert.equal(resumoMes(d, "2026-10").estornos, parcelas[0].centavos);
});

test("pagar a fatura é transferência (fora de despesa) e o registro da fatura valida", () => {
  let { d, conta, cartao } = base();
  const compra = { id: novoId(), data: "2026-10-05", tipo: "despesa", centavos: 20000, categoriaId: cat(d, "Mercado"), descricao: "Mercado", tags: [], meio: "credito", moeda: "BRL", cartaoId: cartao.id, status: "efetivado", origem: "manual" };
  d = adicionar(d, "lancamentos", compra, { novoId, agora });
  const r = pagarFatura({ cartao, lancamentos: d.lancamentos, ym: "2026-10", centavos: 20000, data: "2026-10-17", contaId: conta.id, novoId });
  d = adicionar(d, "lancamentos", r.lancamento, { novoId, agora });
  d = adicionar(d, "faturas", r.fatura, { novoId, agora });
  ok(d, "pagamento");
  assert.equal(resumoMes(d, "2026-10").despesas, 20000, "o pagamento não dobra a despesa");
  assert.equal(resumoDaFatura(cartao, d.lancamentos, "2026-10", "2026-10-18").status, "paga");
});

test("recorrência materializada e confirmada vira lançamento válido e entra no fluxo de caixa", () => {
  let { d, conta } = base();
  const rec = { id: novoId(), nome: "Aluguel", tipo: "despesa", centavos: 150000, categoriaId: cat(d, "Moradia"), contaId: conta.id, freq: "mensal", intervalo: 1, diaDoMes: 5, ajuste: "ultimoDia", inicio: "2026-10-05", ativa: true };
  d = adicionar(d, "recorrencias", rec, { novoId, agora });
  for (const l of materializar(rec, "2026-12-31", novoId, { agora: agora() })) d = adicionar(d, "lancamentos", l, { novoId, agora });
  ok(d, "previstos");
  assert.equal(d.lancamentos.filter((l) => l.status === "previsto").length, 3);
  const f = projetarFluxo({ contas: d.contas, lancamentos: d.lancamentos, recorrencias: d.recorrencias, cartoes: d.cartoes, hoje: "2026-10-05", dias: 90 });
  assert.ok(Number.isInteger(f.menorSaldoCentavos));
  const primeiro = d.lancamentos.find((l) => l.status === "previsto");
  const lista = confirmarOcorrencia(d.lancamentos, primeiro.id, { data: "2026-10-06", centavos: 150000, agora: agora() });
  ok({ ...d, lancamentos: lista }, "confirmado");
});

test("importar OFX real-sintético: o lançamento criado passa no validador, reimportar dá 0 novos e desfazer restaura", async () => {
  let { d, conta } = base();
  const arquivo = readFileSync(new URL("extrato-sgml-cp1252.ofx", FIX));
  const movs = movimentosDoOFX(lerOFX(arquivo));
  const p = await prepararImportacao({ arquivo: { nome: "extrato.ofx", bytes: arquivo }, movimentos: movs, dados: d, dono: { contaId: conta.id }, regras: [], novoId, agora, digest });
  assert.ok(p.preview.novos.length > 0);
  // categoria nula: o importador deixa sem categoria quando nenhuma regra casa; o schema precisa aceitar o lançamento importado.
  const antes = d;
  d = aplicarImportacao(d, p);
  ok(d, "depois de importar");
  const p2 = await prepararImportacao({ arquivo: { nome: "extrato.ofx", bytes: arquivo }, movimentos: movs, dados: d, dono: { contaId: conta.id }, regras: [], novoId, agora, digest });
  assert.equal(p2.preview.novos.length, 0, "reimportar o mesmo arquivo não cria nada");
  const volta = desfazerImportacao(d, p.importacao.id);
  assert.deepEqual(volta.lancamentos, antes.lancamentos);
});

test("v1 → v2 → patrimônio e saldo: um backup v1 de hoje importa, valida e calcula", () => {
  const v1 = JSON.stringify({ versao: 1, prox: 4, perfil: { sexo: "m", alturaCm: 180 }, metas: { pesoKg: 76, treinosSemana: 3, poupancaPct: 20, reservaAlvo: 3000000, reservaAtual: 900000 }, orcamento: { Lazer: 40000 }, pesos: [{ id: 1, data: "2026-10-01", kg: 80 }], medidas: [], treinos: [{ id: 2, data: "2026-10-02", tipo: "Musculação", minutos: 50, esforco: 3 }], lancamentos: [{ id: 3, data: "2026-10-03", tipo: "receita", centavos: 600000, categoria: "Salário", descricao: "" }] });
  const r = importarJSON(v1, { agora });
  assert.ok(r.ok, JSON.stringify(r));
  ok(r.dados, "migrado");
  const c = r.dados.contas[0];
  assert.equal(saldoDaConta(r.dados, c.id, "2026-10-31"), 600000);
  const pl = patrimonioLiquido(r.dados, { saldosPorConta: { [c.id]: saldoDaConta(r.dados, c.id, "2026-10-31") } });
  assert.equal(pl.ativos, 600000);
});

test("editar um lançamento importado não perde a origem e continua válido", async () => {
  let { d, conta } = base();
  d = adicionar(d, "lancamentos", { data: "2026-10-02", tipo: "despesa", centavos: 4500, categoriaId: cat(d, "Mercado"), descricao: "feira", contaId: conta.id, meio: "pix", moeda: "BRL", origem: "importacao", fitid: "F1" }, { novoId, agora });
  const id = d.lancamentos[0].id;
  d = editar(d, "lancamentos", id, { centavos: 5000 }, { agora });
  assert.equal(d.lancamentos[0].origem, "importacao");
  ok(d, "editado");
});

test("lançamento importado sem categoria vale e aparece no resumo como pendente; manual sem categoria continua recusado", () => {
  let { d, conta } = base();
  const item = { data: "2026-10-02", tipo: "despesa", centavos: 3200, categoriaId: null, descricao: "PADARIA X", contaId: conta.id, meio: "pix", moeda: "BRL" };
  const importado = adicionar(d, "lancamentos", { ...item, origem: "importacao", fitid: "F9" }, { novoId, agora });
  ok(importado, "importado sem categoria");
  assert.deepEqual(resumoMes(importado, "2026-10").porCategoria, [{ categoriaId: "sem-categoria", centavos: 3200 }]);
  assert.throws(() => adicionar(d, "lancamentos", { ...item, origem: "manual" }, { novoId, agora }), /sem_categoria/);
});
