import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.js";

const ORIGEM = "https://loja.exemplo.test";
const ADMIN = "chave-admin-de-teste-0123456789";
const PAGAR = "token-pagar-de-teste-0123456789";

function criarKV() {
  const m = new Map();
  return {
    m,
    get: async (k) => m.get(k) ?? null,
    put: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k),
    list: async ({ prefix = "" } = {}) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
  };
}

let env, pagar, pagos;
const realFetch = globalThis.fetch;
beforeEach(() => {
  pagar = []; pagos = new Set();
  env = { ESTADO: criarKV(), SESSAO_SEGREDO: "segredo-de-sessao-so-para-teste", ADMIN_TOKEN: ADMIN, PAGAR_URL: "https://pagar.exemplo.test", PAGAR_TOKEN: PAGAR, ASSETS: { fetch: async () => new Response("asset") } };
  // Provedor de pagamento de mentira: cria link, e diz se o ref foi pago.
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.host !== "pagar.exemplo.test") return realFetch(url, init);
    assert.equal(init.headers.authorization, `Bearer ${PAGAR}`);
    if (u.pathname === "/api/links" && init.method === "POST") {
      const corpo = JSON.parse(init.body);
      pagar.push(corpo);
      if (pagar.falhar) return new Response("{}", { status: 502 });
      return new Response(JSON.stringify({ id: "l1", url: `https://pagar.exemplo.test/p/l1`, ...corpo }), { status: 201 });
    }
    const m = u.pathname.match(/^\/api\/links\/ref\/(.+)$/);
    if (m) return pagos.has(decodeURIComponent(m[1])) ? new Response(JSON.stringify({ pago: true })) : new Response(JSON.stringify({ pago: false }));
    return new Response("{}", { status: 404 });
  };
});

const pedir = (caminho, { metodo = "GET", corpo, cookie, origem = ORIGEM, ip = "1.1.1.1" } = {}) =>
  worker.fetch(new Request(`${ORIGEM}${caminho}`, {
    method: metodo,
    headers: { ...(corpo !== undefined ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...(origem ? { origin: origem } : {}), "cf-connecting-ip": ip },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), env);

const PRODUTO = { nome: "Camiseta Onda", categoria: "Camisetas", preco: 8990, fotos: ["https://img.exemplo.test/a.jpg"], estoque: 5, variacoes: ["P", "M"], destaque: true };
const CLIENTE = { nome: "Maria da Silva", whatsapp: "47999990000", email: "m@exemplo.com" };
const ENTREGA = { cep: "88000-000", rua: "Rua das Ondas", numero: "10", cidade: "Florianópolis", uf: "sc" };

async function entrarComoDono() {
  const r = await pedir("/api/admin/entrar", { metodo: "POST", corpo: { chave: ADMIN } });
  assert.equal(r.status, 200);
  return r.headers.get("set-cookie").split(";")[0];
}
async function comProduto(extra = {}) {
  const cookie = await entrarComoDono();
  const r = await pedir("/api/admin/produtos/camiseta-onda", { metodo: "PUT", corpo: { ...PRODUTO, ...extra }, cookie });
  assert.equal(r.status, 200, await r.clone().text());
  return cookie;
}
const comprar = (itens, extra = {}) => pedir("/api/pedido", { metodo: "POST", corpo: { itens, cliente: CLIENTE, entrega: ENTREGA, ...extra } });

test("a vitrine mostra só produto ativo e nunca o número exato do estoque", async () => {
  const cookie = await comProduto();
  await pedir("/api/admin/produtos/escondida", { metodo: "PUT", corpo: { ...PRODUTO, nome: "Escondida", ativo: false }, cookie });
  const v = await (await pedir("/api/loja")).json();
  assert.deepEqual(v.produtos.map((p) => p.id), ["camiseta-onda"]);
  assert.equal(v.produtos[0].disponivel, true);
  assert.equal("estoque" in v.produtos[0], false);
});

test("o preço vem do catálogo: o preço e o frete que o navegador manda são ignorados", async () => {
  const cookie = await comProduto();
  await pedir("/api/admin/config", { metodo: "PUT", corpo: { nome: "Loja Teste", whatsapp: "", frete_centavos: 1500, frete_gratis_acima: null, aviso: "" }, cookie });
  const r = await comprar([{ id: "camiseta-onda", variacao: "M", qtd: 2, preco: 1, nome: "grátis" }], { total: 1, frete: 0 });
  assert.equal(r.status, 201);
  const corpo = await r.json();
  assert.equal(corpo.total, 8990 * 2 + 1500);
  assert.equal(pagar.length, 1);
  assert.equal(pagar[0].valor, 8990 * 2 + 1500);
  assert.equal(pagar[0].ref, `loja-${corpo.pedido}`);
  assert.match(pagar[0].retorno, new RegExp(`^${ORIGEM}/obrigado.html\\?p=${corpo.pedido}$`));
});

test("frete grátis acima do valor configurado", async () => {
  const cookie = await comProduto();
  await pedir("/api/admin/config", { metodo: "PUT", corpo: { nome: "Loja", frete_centavos: 1500, frete_gratis_acima: 15000 }, cookie });
  assert.equal((await (await comprar([{ id: "camiseta-onda", variacao: "P", qtd: 1 }])).json()).total, 8990 + 1500);
  assert.equal((await (await comprar([{ id: "camiseta-onda", variacao: "P", qtd: 2 }])).json()).total, 8990 * 2);
});

test("pedido inválido é recusado antes de qualquer cobrança", async () => {
  await comProduto({ estoque: 3 });
  const casos = [
    [[], {}], // carrinho vazio
    [[{ id: "nao-existe", variacao: "P", qtd: 1 }], {}],
    [[{ id: "camiseta-onda", qtd: 1 }], {}], // falta o tamanho
    [[{ id: "camiseta-onda", variacao: "GG", qtd: 1 }], {}], // tamanho que não existe
    [[{ id: "camiseta-onda", variacao: "P", qtd: 4 }], {}], // acima do estoque
    [[{ id: "camiseta-onda", variacao: "P", qtd: 2 }, { id: "camiseta-onda", variacao: "M", qtd: 2 }], {}], // estoque somado entre tamanhos
    [[{ id: "camiseta-onda", variacao: "P", qtd: 1.5 }], {}],
    [[{ id: "camiseta-onda", variacao: "P", qtd: 1 }], { entrega: { ...ENTREGA, cep: "123" } }],
    [[{ id: "camiseta-onda", variacao: "P", qtd: 1 }], { cliente: { ...CLIENTE, whatsapp: "12" } }],
  ];
  for (const [itens, extra] of casos) assert.equal((await comprar(itens, extra)).status, 400, JSON.stringify([itens, extra]));
  assert.equal(pagar.length, 0);
});

test("pedido de outro site (sem JSON da mesma origem) é recusado", async () => {
  await comProduto();
  const r = await pedir("/api/pedido", { metodo: "POST", corpo: { itens: [] }, origem: "https://outro.test" });
  assert.equal(r.status, 403);
});

test("20 pedidos por minuto por IP: depois disso 429", async () => {
  await comProduto({ estoque: null });
  let ultimo;
  for (let i = 0; i < 21; i++) ultimo = await comprar([{ id: "camiseta-onda", variacao: "P", qtd: 1 }]);
  assert.equal(ultimo.status, 429);
});

test("cobrança que falha cancela o pedido, devolve 502 e ele não aparece para o dono", async () => {
  const cookie = await comProduto();
  pagar.falhar = true;
  const r = await comprar([{ id: "camiseta-onda", variacao: "P", qtd: 1 }]);
  assert.equal(r.status, 502);
  const lista = await (await pedir("/api/admin/pedidos", { cookie })).json();
  assert.deepEqual(lista.pedidos, []);
});

test("pagou: o pedido vira pago uma vez só e baixa o estoque uma vez só", async () => {
  const cookie = await comProduto({ estoque: 5 });
  const { pedido } = await (await comprar([{ id: "camiseta-onda", variacao: "P", qtd: 2 }])).json();
  assert.equal((await (await pedir(`/api/pedido/${pedido}`)).json()).pedido.estado, "aguardando_pagamento");
  pagos.add(`loja-${pedido}`);
  assert.equal((await (await pedir(`/api/pedido/${pedido}`)).json()).pedido.estado, "pago");
  await pedir(`/api/pedido/${pedido}`);
  await pedir("/api/admin/pedidos", { cookie });
  const produtos = (await (await pedir("/api/admin/produtos", { cookie })).json()).produtos;
  assert.equal(produtos[0].estoque, 3);
});

test("a página pública do pedido não mostra endereço, telefone nem e-mail", async () => {
  await comProduto();
  const { pedido } = await (await comprar([{ id: "camiseta-onda", variacao: "P", qtd: 1 }])).json();
  const texto = await (await pedir(`/api/pedido/${pedido}`)).text();
  for (const dado of ["47999990000", "Rua das Ondas", "m@exemplo.com", "Maria da Silva"]) assert.ok(!texto.includes(dado), dado);
  assert.equal((await pedir(`/api/pedido/${"0".repeat(32)}`)).status, 404);
});

test("painel: sem sessão é 401 em tudo, e a chave errada não entra", async () => {
  for (const [c, m] of [["/api/admin/produtos", "GET"], ["/api/admin/pedidos", "GET"], ["/api/admin/config", "GET"]]) assert.equal((await pedir(c, { metodo: m })).status, 401);
  assert.equal((await pedir("/api/admin/entrar", { metodo: "POST", corpo: { chave: "errada" } })).status, 401);
});

test("painel fechado quando falta ADMIN_TOKEN (ou ele é curto): ninguém entra, nem com chave vazia", async () => {
  for (const t of [undefined, "", "curta"]) {
    env.ADMIN_TOKEN = t;
    assert.equal((await pedir("/api/admin/entrar", { metodo: "POST", corpo: { chave: t ?? "" } })).status, 503);
  }
});

test("10 tentativas de chave por IP a cada 10 minutos: depois disso 429, mesmo com a chave certa", async () => {
  for (let i = 0; i < 10; i++) await pedir("/api/admin/entrar", { metodo: "POST", corpo: { chave: "errada" }, ip: "9.9.9.9" });
  assert.equal((await pedir("/api/admin/entrar", { metodo: "POST", corpo: { chave: ADMIN }, ip: "9.9.9.9" })).status, 429);
});

test("o cookie do painel é HttpOnly, Secure e SameSite", async () => {
  const r = await pedir("/api/admin/entrar", { metodo: "POST", corpo: { chave: ADMIN } });
  const c = r.headers.get("set-cookie");
  assert.match(c, /HttpOnly/); assert.match(c, /Secure/); assert.match(c, /SameSite=Lax/);
});

test("escrita do painel de outro site é recusada, mesmo com o cookie", async () => {
  const cookie = await entrarComoDono();
  assert.equal((await pedir("/api/admin/produtos/x", { metodo: "PUT", corpo: PRODUTO, cookie, origem: "https://outro.test" })).status, 403);
  assert.equal((await pedir("/api/admin/produtos/x", { metodo: "DELETE", cookie, origem: "https://outro.test" })).status, 403);
});

test("produto inválido não entra: foto http, preço antigo menor, código com barra, preço fracionado", async () => {
  const cookie = await entrarComoDono();
  const ruins = [{ fotos: ["http://x.test/a.jpg"] }, { preco_antigo: 100 }, { preco: 99.5 }, { preco: 50 }, { nome: "" }, { estoque: -1 }, { fotos: ["javascript:alert(1)"] }];
  for (const r of ruins) assert.equal((await pedir("/api/admin/produtos/ok", { metodo: "PUT", corpo: { ...PRODUTO, ...r }, cookie })).status, 400, JSON.stringify(r));
  assert.equal((await pedir("/api/admin/produtos/a%2Fb", { metodo: "PUT", corpo: PRODUTO, cookie })).status, 404);
  assert.deepEqual((await (await pedir("/api/admin/produtos", { cookie })).json()).produtos, []);
});

test("enviar só vale para pedido pago; pedido encerrado não muda mais", async () => {
  const cookie = await comProduto();
  const { pedido } = await (await comprar([{ id: "camiseta-onda", variacao: "P", qtd: 1 }])).json();
  const mudar = (estado, rastreio) => pedir(`/api/admin/pedidos/${pedido}`, { metodo: "POST", corpo: { estado, rastreio }, cookie });
  assert.equal((await mudar("enviado")).status, 409);
  assert.equal((await mudar("pago")).status, 400);
  pagos.add(`loja-${pedido}`);
  await pedir("/api/admin/pedidos", { cookie });
  const ok = await mudar("enviado", "BR123456789<script>");
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).pedido.rastreio, "BR123456789script");
  assert.equal((await mudar("cancelado")).status, 409);
});

test("nenhuma resposta devolve a chave do painel nem o token do provedor de pagamento", async () => {
  const cookie = await comProduto();
  const { pedido } = await (await comprar([{ id: "camiseta-onda", variacao: "P", qtd: 1 }])).json();
  const textos = [];
  for (const c of ["/api/loja", `/api/pedido/${pedido}`, "/api/admin/pedidos", "/api/admin/config", "/api/admin/produtos"]) textos.push(await (await pedir(c, { cookie })).text());
  for (const t of textos) { assert.ok(!t.includes(ADMIN)); assert.ok(!t.includes(PAGAR)); }
});
