import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.js";
import { catalogoParaAgente } from "./src/agente.js";

const ORIGEM = "https://loja.exemplo.test";

function criarKV() {
  const m = new Map();
  return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v), delete: async (k) => void m.delete(k), list: async ({ prefix = "" } = {}) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }) };
}
const prod = (id, extra = {}) => ({ id, nome: `Produto ${id}`, categoria: "Mochilas", descricao: "", preco: 10000, preco_antigo: null, fotos: [`https://cdn.test/${id}.jpg`], estoque: 5, variacoes: [], destaque: false, ativo: true, origem: { loja: "loja-exemplo", sku: id.toUpperCase() }, ...extra });
const CLIENTE = { cliente: { nome: "Maria Silva", whatsapp: "47999999999" }, entrega: { cep: "89000000", rua: "Rua A", numero: "10", bairro: "Centro", cidade: "Blumenau", uf: "SC" } };

let env, cobrancas;
const realFetch = globalThis.fetch;
beforeEach(() => {
  cobrancas = [];
  env = { ESTADO: criarKV(), SESSAO_SEGREDO: "segredo-de-sessao-so-para-teste", ADMIN_TOKEN: "chave-admin-de-teste-0123456789", PAGAR_URL: "https://pagar.exemplo.test", PAGAR_TOKEN: "token-pagar-de-teste-0123456789", ASSETS: { fetch: async () => new Response("asset") } };
  env.ESTADO.m.set("catalogo", JSON.stringify(Object.fromEntries(["a", "b", "c"].map((i) => [i, prod(i)]))));
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.host !== "pagar.exemplo.test") return realFetch(url, init);
    if (u.pathname === "/api/links" && init.method === "POST") { const c = JSON.parse(init.body); cobrancas.push(c); return new Response(JSON.stringify({ url: `https://pagar.exemplo.test/p/${cobrancas.length}`, ...c }), { status: 201 }); }
    return new Response(JSON.stringify({ pago: false }));
  };
});
const chamar = (caminho, init = {}) => worker.fetch(new Request(ORIGEM + caminho, init), env);
const comprar = (corpo, cab = {}) => chamar("/api/agente/pedidos", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "1.2.3.4", ...cab }, body: JSON.stringify(corpo) });

test("o agente baixaria a loja inteira de uma vez, sem página nem limite", () => {
  const catalogo = Object.fromEntries(Array.from({ length: 120 }, (_, i) => [`p${String(i).padStart(3, "0")}`, prod(`p${String(i).padStart(3, "0")}`)]));
  const p1 = catalogoParaAgente(catalogo, { limite: 9999 });
  assert.equal(p1.produtos.length, 50, "limite máximo");
  const p2 = catalogoParaAgente(catalogo, { limite: 50, depois: p1.depois });
  assert.equal(p2.produtos[0].id, "p050");
  assert.equal(catalogoParaAgente(catalogo, { limite: 50, depois: "p099" }).depois, null);
});

test("o agente veria preço em reais com ponto flutuante, estoque exato", () => {
  const [p] = catalogoParaAgente({ a: prod("a", { estoque: 3 }) }, {}).produtos;
  assert.equal(p.preco_centavos, 10000);
  assert.equal(p.moeda, "BRL");
  assert.deepEqual(Object.keys(p).filter((k) => ["estoque", "preco"].includes(k)), []);
});

test("produto esgotado ou desativado apareceria para o agente comprar", () => {
  const c = { a: prod("a"), b: prod("b", { estoque: 0 }), c: prod("c", { ativo: false }) };
  assert.deepEqual(catalogoParaAgente(c, {}).produtos.map((p) => p.id), ["a"]);
});

test("a busca do agente erraria por acento e maiúscula", () => {
  const c = { a: prod("a", { nome: "Máscara de Solda" }) };
  assert.equal(catalogoParaAgente(c, { q: "MASCARA" }).produtos.length, 1);
  assert.equal(catalogoParaAgente(c, { q: "lanterna" }).produtos.length, 0);
});

test("o agente comprando devolveria o link sem dizer quem paga, ou cobraria o preço errado", async () => {
  const r = await comprar({ itens: [{ id: "a", qtd: 2 }], ...CLIENTE }, { "x-agent-name": "assistente-da-maria" });
  assert.equal(r.status, 201);
  const j = await r.json();
  assert.equal(j.total_centavos, 20000);
  assert.equal(j.pagamento.tipo, "link_de_pagamento");
  assert.match(j.pagamento.url, /^https:\/\/pagar\.exemplo\.test\/p\//);
  assert.equal(cobrancas[0].valor, 20000);
  const pedido = JSON.parse(env.ESTADO.m.get(`pedido:${j.pedido}`));
  assert.equal(pedido.agente, "assistente-da-maria", "o pedido precisa registrar quem comprou");
});

test("repetir o pedido com a mesma Idempotency-Key criaria duas cobranças", async () => {
  const corpo = { itens: [{ id: "a", qtd: 1 }], ...CLIENTE };
  const a = await (await comprar(corpo, { "idempotency-key": "tentativa-1" })).json();
  const rb = await comprar(corpo, { "idempotency-key": "tentativa-1" });
  assert.equal(rb.status, 200);
  assert.deepEqual(await rb.json(), a);
  assert.equal(cobrancas.length, 1);
});

test("outro agente adivinhando a Idempotency-Key receberia o pedido de alguém", async () => {
  const corpo = { itens: [{ id: "a", qtd: 1 }], ...CLIENTE };
  const a = await (await comprar(corpo, { "idempotency-key": "k1" })).json();
  const b = await (await comprar(corpo, { "idempotency-key": "k1", "cf-connecting-ip": "9.9.9.9" })).json();
  assert.notEqual(b.pedido, a.pedido);
});

test("Idempotency-Key com lixo viraria chave do KV", async () => {
  const r = await comprar({ itens: [{ id: "a", qtd: 1 }], ...CLIENTE }, { "idempotency-key": "x y/../z" });
  assert.equal(r.status, 400);
  assert.equal(cobrancas.length, 0);
});

test("pedido do agente para produto esgotado cobraria mesmo assim", async () => {
  env.ESTADO.m.set("catalogo", JSON.stringify({ a: prod("a", { estoque: 1 }) }));
  const r = await comprar({ itens: [{ id: "a", qtd: 5 }], ...CLIENTE });
  assert.equal(r.status, 400);
  assert.equal(cobrancas.length, 0);
});

test("o pedido de agente aceitaria formulário de outro site (sem application/json)", async () => {
  const r = await chamar("/api/agente/pedidos", { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" });
  assert.equal(r.status, 415);
});

test("o descritor do agente prometeria pagamento autônomo que não existe", async () => {
  const d = await (await chamar("/api/agente")).json();
  assert.equal(d.pagamento.autonomo, false);
  assert.equal(d.moeda, "BRL");
});
