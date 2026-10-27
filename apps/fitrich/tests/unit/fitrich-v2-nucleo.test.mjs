import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CATEGORIAS_PADRAO, CATEGORIA_FITNESS_ID, ErroEsquema, VERSAO, adicionar, definir, editar, filtrarLancamentos, lancamentosDoMes,
  novoIdPadrao, remover, resumoMes, saldoDaConta, uuidV4Fallback, validar, vazio,
} from "../../app/js/v2/esquema.mjs";
import { precisaDeBackup } from "../../app/js/v2/lembrete-backup.mjs";

// Relógio e ids determinísticos: o teste compara objetos inteiros.
const T0 = "2026-10-05T12:00:00.000Z";
const agora = () => T0;
let seq = 0;
const novoId = () => `id-${++seq}`;
const op = { agora, novoId };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Base com duas contas, um cartão e lançamentos: todo teste parte daqui.
function base() {
  seq = 0;
  let d = vazio({ agora });
  d = adicionar(d, "contas", { id: "cc", nome: "Corrente", tipo: "corrente", moeda: "BRL", saldoInicialCentavos: 100000, dataSaldoInicial: "2026-10-01", arquivada: false }, op);
  d = adicionar(d, "contas", { id: "pp", nome: "Poupança", tipo: "poupanca", moeda: "BRL", saldoInicialCentavos: 0, dataSaldoInicial: "2026-10-01", arquivada: false }, op);
  d = adicionar(d, "cartoes", { id: "cx", nome: "Cartão X", diaFechamento: 10, diaVencimento: 17, fechaInclusivo: false, limiteCentavos: 500000, contaPagamentoId: "cc" }, op);
  return d;
}
const L = (extra) => ({ data: "2026-10-05", tipo: "despesa", centavos: 1000, categoriaId: "cat-mercado", contaId: "cc", moeda: "BRL", meio: "pix", ...extra });

test("vazio nasce na versão 2, válido, com categorias padrão de id fixo e Saúde e fitness entre elas", () => {
  const d = vazio({ agora });
  assert.equal(d.versao, VERSAO);
  assert.deepEqual(validar(d), { ok: true, erros: [] });
  assert.ok(d.categorias.some((c) => c.id === CATEGORIA_FITNESS_ID && c.essencial));
  assert.equal(new Set(CATEGORIAS_PADRAO.map((c) => c.id)).size, CATEGORIAS_PADRAO.length, "id de categoria padrão repetido");
  assert.ok(CATEGORIAS_PADRAO.every((c) => c.tipo === "receita" ? c.grupo === null : ["necessidade", "desejo", "poupanca"].includes(c.grupo)));
  assert.equal(d.meta.criadoEm, T0);
  assert.deepEqual(d.meta.removidos, []);
});

test("UUID v4: 10 mil ids únicos pelo padrão e pelo fallback sem crypto, ambos no formato v4", () => {
  const a = new Set(), b = new Set();
  for (let i = 0; i < 10000; i++) { a.add(novoIdPadrao()); b.add(uuidV4Fallback(undefined)); }
  assert.equal(a.size, 10000); assert.equal(b.size, 10000);
  assert.match([...a][0], UUID); assert.match([...b][0], UUID);
  // fallback com getRandomValues presente mas sem randomUUID (navegador velho)
  const cripto = { getRandomValues: (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = (i * 37 + 11) & 255; return arr; } };
  assert.match(novoIdPadrao(cripto), UUID);
});

test("adicionar não altera o original, preenche id/atualizadoEm/status e mantém lançamentos por data", () => {
  const d0 = base(), copia = structuredClone(d0);
  const d1 = adicionar(d0, "lancamentos", L({ data: "2026-10-07" }), op);
  const d2 = adicionar(d1, "lancamentos", L({ data: "2026-10-02" }), op);
  assert.deepEqual(d0, copia, "o estado antigo foi mexido");
  assert.equal(d0.lancamentos.length, 0);
  assert.deepEqual(d2.lancamentos.map((l) => l.data), ["2026-10-02", "2026-10-07"]);
  const l = d2.lancamentos[1];
  assert.equal(l.id, "id-1"); assert.equal(l.atualizadoEm, T0); assert.equal(l.status, "efetivado"); assert.equal(l.origem, "manual"); assert.deepEqual(l.tags, []);
  assert.equal(d2.meta.atualizadoEm, T0);
  assert.equal(validar(d2).ok, true);
});

test("adicionar recusa com código: categoria inexistente, tipo da categoria divergente, conta e cartão ao mesmo tempo, coleção desconhecida", () => {
  const d = base();
  const cod = (f) => { try { f(); return null; } catch (e) { assert.ok(e instanceof ErroEsquema); return e.erros.map((x) => x.codigo); } };
  assert.deepEqual(cod(() => adicionar(d, "lancamentos", L({ categoriaId: "cat-nao-existe" }), op)), ["lancamento.categoria_inexistente"]);
  assert.deepEqual(cod(() => adicionar(d, "lancamentos", L({ categoriaId: "cat-salario" }), op)), ["lancamento.categoria_tipo_divergente"]);
  assert.deepEqual(cod(() => adicionar(d, "lancamentos", L({ cartaoId: "cx" }), op)), ["lancamento.conta_ou_cartao"]);
  assert.deepEqual(cod(() => adicionar(d, "lancamentos", L({ contaId: "zz" }), op)), ["lancamento.conta_inexistente"]);
  assert.deepEqual(cod(() => adicionar(d, "lancamentos", L({ centavos: 0 }), op)), ["lancamento.valor_invalido"]);
  assert.deepEqual(cod(() => adicionar(d, "lancamentos", L({ centavos: 12.5 }), op)), ["lancamento.valor_invalido"]);
  assert.deepEqual(cod(() => adicionar(d, "lancamentos", L({ data: "2026-02-31" }), op)), ["lancamento.data_invalida"]);
  assert.deepEqual(cod(() => adicionar(d, "lancamentos", L({ id: "cc" }), op)), ["lancamentos.id_repetido"], "id já usado por uma conta: ids são globais");
  assert.deepEqual(cod(() => adicionar(d, "pneus", { id: "x" }, op)), ["colecao.desconhecida"]);
  assert.deepEqual(cod(() => adicionar(d, "cartoes", { nome: "Y", diaFechamento: 1, diaVencimento: 8, fechaInclusivo: true, contaPagamentoId: "nao" }, op)), ["cartao.conta_pagamento_inexistente"]);
});

test("validar aponta ids repetidos entre coleções diferentes (ids são globais) com o caminho do item", () => {
  const b = base();
  const d = { ...b, lancamentos: [L({ id: "cc", atualizadoEm: T0, status: "efetivado", origem: "manual", tags: [] })] };
  const v = validar(d);
  assert.equal(v.ok, false);
  assert.deepEqual(v.erros, [{ codigo: "lancamentos.id_repetido", caminho: "lancamentos[0]" }]);
});

test("transferência: origem ≠ destino, sem categoria, destino existente; e não entra em receita nem despesa", () => {
  const d = base();
  const tr = (extra) => ({ data: "2026-10-05", tipo: "transferencia", centavos: 20000, contaId: "cc", contaDestinoId: "pp", moeda: "BRL", ...extra });
  const codigos = (x) => { try { adicionar(d, "lancamentos", x, op); return []; } catch (e) { return e.erros.map((y) => y.codigo); } };
  assert.deepEqual(codigos(tr({ contaDestinoId: "cc" })), ["lancamento.transferencia_mesma_conta"]);
  assert.deepEqual(codigos(tr({ categoriaId: "cat-mercado" })), ["lancamento.transferencia_com_categoria"]);
  assert.deepEqual(codigos(tr({ contaDestinoId: "nao" })), ["lancamento.conta_destino_inexistente"]);
  // Pagamento de fatura: sai de uma conta e entra num cartão (cartaoId + fatura), sem contaDestinoId.
  assert.ok(codigos(tr({ contaId: undefined, cartaoId: "cx", contaDestinoId: undefined, fatura: "2026-10" })).includes("lancamento.transferencia_sem_conta_origem"), "pagamento sai de uma conta");
  assert.ok(codigos(tr({ cartaoId: "cx", contaDestinoId: undefined })).includes("lancamento.pagamento_sem_fatura"), "pagar cartão exige a fatura");
  assert.ok(codigos(tr({ cartaoId: "cx", fatura: "2026-10" })).includes("lancamento.transferencia_destino_duplo"), "destino é a conta OU o cartão, nunca os dois");
  let e = adicionar(d, "lancamentos", tr(), op);
  e = adicionar(e, "lancamentos", L({ tipo: "receita", categoriaId: "cat-salario", centavos: 500000 }), op);
  e = adicionar(e, "lancamentos", L({ centavos: 30000 }), op);
  const r = resumoMes(e, "2026-10");
  assert.equal(r.receitas, 500000); assert.equal(r.despesas, 30000); assert.equal(r.saldo, 470000);
  assert.equal(r.taxaPoupanca, 94);
});

test("estorno: precisa apontar compra existente do tipo despesa, não maior que ela, e abate a despesa e a categoria no resumo", () => {
  let d = adicionar(base(), "lancamentos", L({ id: "compra", centavos: 10000, data: "2026-10-03" }), op);
  const est = (extra) => ({ data: "2026-10-20", tipo: "estorno", centavos: 4000, refId: "compra", contaId: "cc", moeda: "BRL", ...extra });
  const codigos = (x) => { try { adicionar(d, "lancamentos", x, op); return []; } catch (e) { return e.erros.map((y) => y.codigo); } };
  assert.deepEqual(codigos(est({ refId: "nao" })), ["lancamento.estorno_sem_compra"]);
  assert.deepEqual(codigos(est({ centavos: 10001 })), ["lancamento.estorno_maior_que_compra"]);
  assert.deepEqual(codigos(est({ refId: undefined })), ["lancamento.estorno_sem_ref"]);
  d = adicionar(d, "lancamentos", L({ id: "receita", tipo: "receita", categoriaId: "cat-salario", centavos: 100000 }), op);
  assert.deepEqual(codigos(est({ refId: "receita" })), ["lancamento.estorno_sem_compra"], "estorno de receita não existe");
  d = adicionar(d, "lancamentos", est(), op);
  const r = resumoMes(d, "2026-10");
  assert.equal(r.despesas, 6000); assert.equal(r.estornos, 4000);
  assert.deepEqual(r.porCategoria, [{ categoriaId: "cat-mercado", centavos: 6000 }]);
  // remover a compra com estorno pendurado é recusado (o estorno ficaria órfão)
  assert.throws(() => remover(d, "lancamentos", "compra", op), (e) => e.erros[0].codigo === "lancamentos.em_uso");
});

test("parcelas: grupo completo com soma diferente do total é inválido; n repetido e `de` divergente também", () => {
  const d = base();
  const P = (n, centavos, extra) => L({ id: `p${n}`, centavos, cartaoId: "cx", contaId: undefined, meio: "credito", fatura: "2026-11", atualizadoEm: T0, status: "efetivado", origem: "manual", tags: [], parcela: { grupoId: "g1", n, de: 3, totalCentavos: 10000, ...extra } });
  // 10000/3 → [3334, 3333, 3333] (caso do plano)
  const certo = { ...d, lancamentos: [P(1, 3334), P(2, 3333), P(3, 3333)] };
  assert.equal(validar(certo).ok, true);
  const errado = { ...d, lancamentos: [P(1, 3333), P(2, 3333), P(3, 3333)] };
  assert.deepEqual(validar(errado).erros.map((e) => e.codigo), ["lancamento.parcela_soma_divergente"]);
  const repetido = { ...d, lancamentos: [P(1, 3334), { ...P(1, 3333), id: "p1b" }] };
  assert.deepEqual(validar(repetido).erros.map((e) => e.codigo), ["lancamento.parcela_n_repetido"]);
  const diverge = { ...d, lancamentos: [P(1, 3334), P(2, 3333, { de: 4 })] };
  assert.deepEqual(validar(diverge).erros.map((e) => e.codigo), ["lancamento.parcela_grupo_divergente"]);
  const incompleto = { ...d, lancamentos: [P(1, 3334), P(2, 3333)] };
  assert.equal(validar(incompleto).ok, true, "grupo incompleto (parcela apagada) não é erro");
  assert.deepEqual(validar({ ...d, lancamentos: [P(1, 3334, { n: 4 })] }).erros.map((e) => e.codigo), ["lancamento.parcela_invalida"]);
});

test("saldo da conta: saldo inicial + receitas − despesas ± transferências, só efetivados, até a data pedida", () => {
  let d = base();
  d = adicionar(d, "lancamentos", L({ data: "2026-09-30", centavos: 99999 }), op); // antes do saldo inicial: já estava refletido
  d = adicionar(d, "lancamentos", L({ data: "2026-10-01", tipo: "receita", categoriaId: "cat-salario", centavos: 300000 }), op);
  d = adicionar(d, "lancamentos", L({ data: "2026-10-03", centavos: 50000 }), op);
  d = adicionar(d, "lancamentos", { data: "2026-10-04", tipo: "transferencia", centavos: 100000, contaId: "cc", contaDestinoId: "pp", moeda: "BRL" }, op);
  d = adicionar(d, "lancamentos", L({ data: "2026-10-06", centavos: 7000, status: "previsto" }), op);
  d = adicionar(d, "lancamentos", L({ data: "2026-10-06", centavos: 2500, cartaoId: "cx", contaId: undefined, meio: "credito" }), op);
  // 100000 + 300000 − 50000 − 100000 = 250000
  assert.equal(saldoDaConta(d, "cc", "2026-10-31"), 250000);
  assert.equal(saldoDaConta(d, "pp", "2026-10-31"), 100000);
  assert.equal(saldoDaConta(d, "cc", "2026-10-02"), 400000, "corte na data");
  assert.equal(saldoDaConta(d, "cc", "2026-10-31", { incluirPrevistos: true }), 243000);
  assert.equal(saldoDaConta(d, "nao", "2026-10-31"), null);
});

test("resumoMes: outra moeda fica de fora, previsto fica de fora por padrão, sem receita a taxa é null", () => {
  let d = adicionar(base(), "contas", { id: "usd", nome: "Dólar", tipo: "corrente", moeda: "USD", saldoInicialCentavos: 0, dataSaldoInicial: "2026-01-01", arquivada: false }, op);
  d = adicionar(d, "lancamentos", L({ centavos: 1000 }), op);
  d = adicionar(d, "lancamentos", L({ centavos: 777, contaId: "usd", moeda: "USD" }), op);
  d = adicionar(d, "lancamentos", L({ centavos: 500, status: "previsto" }), op);
  assert.equal(resumoMes(d, "2026-10").despesas, 1000);
  assert.equal(resumoMes(d, "2026-10", { moeda: "USD" }).despesas, 777);
  assert.equal(resumoMes(d, "2026-10", { incluirPrevistos: true }).despesas, 1500);
  assert.equal(resumoMes(d, "2026-10").taxaPoupanca, null);
  assert.equal(lancamentosDoMes(d, "2026-09").length, 0);
});

test("editar mantém o id, atualiza atualizadoEm, revalida e não altera o original; estorno não pode apontar para si", () => {
  let d = adicionar(base(), "lancamentos", L({ id: "a", descricao: "feira" }), op);
  const copia = structuredClone(d);
  const depois = () => "2026-10-06T00:00:00.000Z";
  const e = editar(d, "lancamentos", "a", { centavos: 2000, descricao: "feira grande" }, { agora: depois });
  assert.deepEqual(d, copia);
  assert.equal(e.lancamentos[0].centavos, 2000); assert.equal(e.lancamentos[0].id, "a"); assert.equal(e.lancamentos[0].atualizadoEm, depois());
  assert.throws(() => editar(d, "lancamentos", "a", { categoriaId: "zz" }), (x) => x.erros[0].codigo === "lancamento.categoria_inexistente");
  assert.throws(() => editar(d, "lancamentos", "nao", {}), (x) => x.erros[0].codigo === "lancamentos.inexistente");
  assert.throws(() => editar(d, "lancamentos", "a", { tipo: "estorno", refId: "a", categoriaId: undefined }), (x) => x.erros[0].codigo === "lancamento.estorno_sem_compra");
  const c = editar(d, "contas", "cc", { nome: "Conta principal" });
  assert.equal(c.contas.find((x) => x.id === "cc").nome, "Conta principal");
  const p = definir(d, "perfil", { idioma: "en" });
  assert.equal(p.perfil.idioma, "en"); assert.equal(d.perfil.idioma, "pt-BR");
});

test("remover deixa tombstone em meta.removidos e recusa apagar conta, cartão ou categoria em uso", () => {
  let d = adicionar(base(), "lancamentos", L({ id: "a" }), op);
  const r = remover(d, "lancamentos", "a", op);
  assert.equal(r.lancamentos.length, 0);
  assert.deepEqual(r.meta.removidos, [{ id: "a", colecao: "lancamentos", removidoEm: T0 }]);
  assert.equal(d.lancamentos.length, 1, "original intacto");
  assert.equal(validar(r).ok, true);
  for (const [col, id] of [["contas", "cc"], ["categorias", "cat-mercado"]]) assert.throws(() => remover(d, col, id, op), (e) => e.erros[0].codigo === `${col}.em_uso`, col);
  assert.equal(remover(d, "contas", "pp", op).contas.length, 1, "pp não tem lançamento nem cartão: pode sair");
  const semLanc = remover(d, "lancamentos", "a", op);
  assert.throws(() => remover(semLanc, "contas", "cc", op), (e) => e.erros[0].codigo === "contas.em_uso", "cc ainda paga o cartão cx");
  assert.equal(remover(remover(semLanc, "cartoes", "cx", op), "contas", "cc", op).contas.length, 1);
  assert.throws(() => remover(d, "lancamentos", "zz", op), (e) => e.erros[0].codigo === "lancamentos.inexistente");
  assert.equal(remover(d, "categorias", "cat-pet", op).categorias.length, d.categorias.length - 1);
});

test("filtrar lançamentos: texto sem acento, categoria, conta (origem ou destino), período, tipo, tag, status", () => {
  let d = base();
  d = adicionar(d, "lancamentos", L({ id: "1", data: "2026-10-01", descricao: "Açaí da esquina", tags: ["lanche"] }), op);
  d = adicionar(d, "lancamentos", L({ id: "2", data: "2026-10-10", descricao: "Uber", categoriaId: "cat-transporte", status: "previsto" }), op);
  d = adicionar(d, "lancamentos", { id: "3", data: "2026-10-15", tipo: "transferencia", centavos: 100, contaId: "cc", contaDestinoId: "pp", moeda: "BRL" }, op);
  const ids = (f) => filtrarLancamentos(d, f).map((l) => l.id);
  assert.deepEqual(ids({ texto: "acai" }), ["1"]);
  assert.deepEqual(ids({ texto: "LANCHE" }), ["1"], "tag também é buscada");
  assert.deepEqual(ids({ categoriaId: "cat-transporte" }), ["2"]);
  assert.deepEqual(ids({ contaId: "pp" }), ["3"]);
  assert.deepEqual(ids({ contaId: "cc" }), ["1", "2", "3"]);
  assert.deepEqual(ids({ de: "2026-10-05", ate: "2026-10-12" }), ["2"]);
  assert.deepEqual(ids({ tipo: "transferencia" }), ["3"]);
  assert.deepEqual(ids({ status: "previsto" }), ["2"]);
  assert.deepEqual(ids({}), ["1", "2", "3"]);
});

test("validar: orçamento com categoria de receita ou inexistente, perfil sem idioma, meta sem data, coleção que não é lista", () => {
  const d = base();
  assert.deepEqual(validar({ ...d, orcamento: { metodo: "limites", rollover: false, limites: { "cat-salario": 100 } } }).erros.map((e) => e.codigo), ["orcamento.categoria_inexistente"]);
  assert.deepEqual(validar({ ...d, orcamento: { metodo: "limites", rollover: false, limites: { "cat-lazer": 0 } } }).erros.map((e) => e.codigo), ["orcamento.limite_invalido"]);
  assert.deepEqual(validar({ ...d, perfil: { sexo: "", alturaCm: null, moedaPadrao: "BRL" } }).erros.map((e) => e.codigo), ["perfil.invalido"]);
  assert.deepEqual(validar({ ...d, meta: { criadoEm: "ontem" } }).erros.map((e) => e.codigo), ["meta.invalida"]);
  assert.deepEqual(validar({ ...d, pesos: null }).erros, [{ codigo: "colecao.nao_lista", caminho: "pesos" }]);
  assert.deepEqual(validar({ ...d, versao: 1 }).erros.map((e) => e.codigo), ["dados.versao_diferente"]);
  assert.deepEqual(validar(null).erros.map((e) => e.codigo), ["dados.nao_objeto"]);
  const m = adicionar(d, "metas", { nome: "Peso", tipo: "peso", alvo: 75.5 }, op);
  assert.equal(validar(m).ok, true);
  assert.throws(() => adicionar(d, "metas", { nome: "Reserva", tipo: "reserva", alvo: 100.5 }, op), (e) => e.erros[0].codigo === "meta.alvo_invalido");
  assert.throws(() => adicionar(d, "pesos", { data: "2026-10-05", kg: 10 }, op), (e) => e.erros[0].codigo === "peso.fora_da_faixa");
  assert.throws(() => adicionar(d, "treinos", { data: "2026-10-05", tipo: "Yoga", minutos: 30 }, op), (e) => e.erros[0].codigo === "treino.tipo_invalido");
});

test("lembrete de backup nas fronteiras: 30 dias não, 31 sim; 50 registros não, 51 sim; WebKit 5 não, 6 sim; nunca fez só conta com registro", () => {
  const b = (dias, registros, webkit = false) => precisaDeBackup({ ultimoBackupEm: "2026-09-01T10:00:00Z", registrosDesdeBackup: registros, hoje: `2026-${dias >= 30 ? "10" : "09"}-${String(dias >= 30 ? dias - 29 : dias + 1).padStart(2, "0")}`, webkitNaoInstalado: webkit });
  assert.deepEqual(b(30, 0).codigos, []);
  assert.deepEqual(b(31, 0).codigos, ["backup.mais_de_30_dias"]);
  assert.deepEqual(b(1, 50).codigos, []);
  assert.deepEqual(b(1, 51).codigos, ["backup.mais_de_50_registros"]);
  assert.deepEqual(b(5, 0, true).codigos, []);
  assert.deepEqual(b(6, 0, true).codigos, ["backup.webkit_mais_de_5_dias"]);
  assert.deepEqual(b(31, 51, true).codigos, ["backup.mais_de_30_dias", "backup.webkit_mais_de_5_dias", "backup.mais_de_50_registros"]);
  assert.equal(precisaDeBackup({ ultimoBackupEm: null, registrosDesdeBackup: 0, hoje: "2026-10-05" }).precisa, false);
  assert.deepEqual(precisaDeBackup({ ultimoBackupEm: null, registrosDesdeBackup: 1, hoje: "2026-10-05" }).codigos, ["backup.nunca_feito"]);
  assert.equal(b(31, 0).dias, 31);
});
