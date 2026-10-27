// Motor do PDV (/restaurantes/pdv). Roda por tests/test_restaurantes.py (node --test).
// Cada nome diz o defeito que o teste barra.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../js/motor.mjs";

test("dinheiro em float fecha conta com centavo a mais ou a menos", () => {
  assert.equal(m.brl(10), "R$ 0,10");
  assert.equal(m.brl(123456), "R$ 1.234,56");
  assert.equal(m.brl(-500), "-R$ 5,00");
  assert.equal(m.lerValor("12,50"), 1250);
  assert.equal(m.lerValor("1.234,5"), 123450);
  assert.equal(m.lerValor("R$ 7"), 700);
  assert.equal(m.lerValor("0.1"), 10);
  assert.equal(m.lerValor(""), null, "campo vazio não vira pagamento de zero");
  assert.equal(m.lerValor("abc"), null);
  assert.equal(m.lerValor("1,234"), null, "três casas decimais é digitação errada");
});

test("taxa de serviço cobrada sobre a entrega ou antes do desconto", () => {
  const itens = [{ preco: 5000, qtd: 2 }];
  const mesa = m.totais({ tipo: "mesa", itens, servico: true, desconto: { tipo: "pct", v: 10 } }, { servicoPct: 10 });
  assert.deepEqual(mesa, { subtotal: 10000, desconto: 1000, servico: 900, entrega: 0, total: 9900 });
  const del = m.totais({ tipo: "delivery", itens, servico: true, entrega: 800 }, { servicoPct: 10 });
  assert.equal(del.servico, 1000);
  assert.equal(del.total, 11800, "10% não incide sobre a entrega");
  const semServico = m.totais({ tipo: "balcao", itens, servico: false, entrega: 800 });
  assert.equal(semServico.total, 10000, "entrega só existe no delivery");
});

test("desconto maior que a conta deixa total negativo", () => {
  const t = m.totais({ tipo: "balcao", itens: [{ preco: 1000, qtd: 1 }], desconto: { tipo: "valor", v: 5000 } });
  assert.equal(t.total, 0);
  assert.equal(m.totais({ tipo: "balcao", itens: [{ preco: 1000, qtd: 1 }], desconto: { tipo: "pct", v: 250 } }).total, 0);
});

test("troco de Pix ou cartão acima do total passa despercebido", () => {
  assert.equal(m.conferirPagamentos(5000, [{ forma: "pix", valor: 6000 }]).ok, false);
  const r = m.conferirPagamentos(5000, [{ forma: "credito", valor: 3000 }, { forma: "dinheiro", valor: 5000 }]);
  assert.deepEqual(r, { ok: true, pago: 8000, falta: 0, troco: 3000, quitado: true });
  const parcial = m.conferirPagamentos(5000, [{ forma: "debito", valor: 2000 }]);
  assert.equal(parcial.falta, 3000);
  assert.equal(parcial.quitado, false);
  assert.equal(m.conferirPagamentos(5000, [{ forma: "cheque", valor: 5000 }]).ok, false);
  assert.equal(m.conferirPagamentos(5000, [{ forma: "pix", valor: 10.5 }]).ok, false);
});

test("dividir a conta perde ou inventa centavos", () => {
  const partes = m.dividir(10000, 3);
  assert.deepEqual(partes, [3334, 3333, 3333]);
  assert.equal(partes.reduce((a, b) => a + b, 0), 10000);
  assert.deepEqual(m.dividir(10, 0), [10]);
});

test("CPF ou CNPJ inválido sai na nota", () => {
  assert.equal(m.cpfValido("529.982.247-25"), true);
  assert.equal(m.cpfValido("529.982.247-24"), false);
  assert.equal(m.cpfValido("111.111.111-11"), false);
  assert.equal(m.cnpjValido("11.222.333/0001-81"), true);
  assert.equal(m.cnpjValido("11.222.333/0001-80"), false);
  assert.equal(m.cnpjValido("00000000000000"), false);
});

test("chave de acesso da NFC-e com tamanho, modelo ou dígito errado", () => {
  // DV desta chave de 43 dígitos conferido por uma conta independente (módulo 11 em Python).
  assert.equal(m.dvChave("5206043300991100250655012000000780026730161"), 5);
  const chave = m.chaveAcesso({ uf: "RS", data: new Date(2026, 9, 18), cnpj: "11.222.333/0001-81", serie: 1, numero: 42, codigo: 12345678 });
  assert.equal(chave.length, 44);
  assert.equal(chave.slice(0, 2), "43");
  assert.equal(chave.slice(2, 6), "2610");
  assert.equal(chave.slice(20, 22), "65", "modelo 65 = NFC-e");
  assert.equal(Number(chave[43]), m.dvChave(chave.slice(0, 43)));
  assert.equal(m.chaveEmBlocos("12345678"), "1234 5678");
  assert.throws(() => m.chaveAcesso({ uf: "XX", data: new Date(), cnpj: "1", serie: 1, numero: 1, codigo: 1 }));
});

test("formas de pagamento sem código tPag da nota", () => {
  for (const f of Object.keys(m.FORMAS)) assert.match(m.TPAG[f], /^\d{2}$/, f);
});

test("caixa fecha sem descontar o troco ou a sangria", () => {
  const caixa = { fundo: 20000, movs: [{ tipo: "sangria", valor: 5000 }, { tipo: "suprimento", valor: 1000 }] };
  const vendas = [
    { total: 4500, pagamentos: [{ forma: "dinheiro", valor: 5000 }], troco: 500, itens: [] },
    { total: 3000, pagamentos: [{ forma: "pix", valor: 3000 }], troco: 0, itens: [] },
  ];
  const r = m.resumoCaixa(caixa, vendas);
  assert.equal(r.esperadoDinheiro, 20000 - 5000 + 1000 + 5000 - 500);
  assert.equal(r.porForma.pix, 3000);
  assert.equal(r.vendido, 7500);
});

test("relatório soma errado ou ordena os mais vendidos ao contrário", () => {
  const vendas = [
    { tipo: "mesa", total: 10000, servico: 900, nfce: { chave: "x" }, itens: [{ nome: "A", preco: 1000, qtd: 1 }, { nome: "B", preco: 500, qtd: 3 }] },
    { tipo: "delivery", total: 2000, servico: 0, itens: [{ nome: "B", preco: 500, qtd: 1 }] },
  ];
  const r = m.relatorio(vendas);
  assert.equal(r.n, 2);
  assert.equal(r.total, 12000);
  assert.equal(r.ticketMedio, 6000);
  assert.equal(r.servico, 900);
  assert.equal(r.notas, 1);
  assert.deepEqual(r.maisVendidos.map((i) => [i.nome, i.qtd]), [["B", 4], ["A", 1]]);
  assert.equal(r.porTipo.delivery, 2000);
  assert.equal(m.relatorio([]).ticketMedio, 0);
});

test("item mandado duas vezes para a cozinha ou bebida indo para a cozinha", () => {
  const c = { itens: [
    { uid: "1", nome: "Risoto", qtd: 3, enviado: 1, obs: "sem sal" },
    { uid: "2", nome: "Refrigerante", qtd: 2, cozinha: false },
    { uid: "3", nome: "Pudim", qtd: 1, enviado: 1 },
  ] };
  assert.deepEqual(m.pendentesCozinha(c), [{ uid: "1", nome: "Risoto", qtd: 2, obs: "sem sal" }]);
});

test("tributos aproximados (Lei 12.741) ignoram o percentual do item", () => {
  assert.equal(m.tributosAproximados([{ preco: 10000, qtd: 1 }, { preco: 1000, qtd: 2, tributosPct: 30 }], 10), 1000 + 600);
});

test("cardápio de exemplo com item sem NCM, CFOP ou preço em centavos", () => {
  const ids = new Set();
  for (const i of m.CARDAPIO_EXEMPLO.itens) {
    assert.match(i.ncm, /^\d{8}$/, i.nome);
    assert.match(i.cfop, /^5\d{3}$/, i.nome);
    assert.ok(Number.isInteger(i.preco) && i.preco > 0, i.nome);
    assert.ok(m.CARDAPIO_EXEMPLO.categorias.includes(i.cat), i.nome);
    assert.ok(!ids.has(i.id), `id repetido ${i.id}`);
    ids.add(i.id);
  }
});
