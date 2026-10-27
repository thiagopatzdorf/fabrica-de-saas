// node --test worker.test.mjs
// Cada teste tem o nome da falha que ele impede. O Stripe é simulado: nenhum teste toca a rede.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import worker from "./worker.js";
import { assinar, agora, decifrar } from "./src/sessao.js";
import { formEncode, verificarAssinatura } from "./src/stripe.js";
import { validar } from "./src/links.js";
import { registrar } from "./src/webhook.js";
import { paraCentavos } from "./site/dinheiro.js";

const SEGREDO = "segredo-de-teste-da-sessao";
const TOKEN = "token-da-api-" + "com-mais-de-vinte-caracteres";
const ORIGEM = "https://pagar.exemplo";
const CHAVE = "rk_live_" + "a1B2c3D4e5F6g7H8i9J0k1L2";
const CHAVE_TESTE = "rk_test_" + "a1B2c3D4e5F6g7H8i9J0k1L2";
const WHSEC = "whsec_" + "x".repeat(32);

function kv() {
  const m = new Map();
  return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } };
}
// ASSETS de teste = a pasta site/ de verdade, para a marca (marca.json e PNGs) ser a que vai ao ar.
const novoEnv = (extra = {}) => ({ SESSAO_SEGREDO: SEGREDO, PAGAR_TOKEN: TOKEN, ESTADO: kv(), ASSETS: { fetch: async (rq) => { try { return new Response(readFileSync(new URL("./site" + new URL(rq.url).pathname, import.meta.url))); } catch { return new Response("asset"); } } }, ...extra });
const real = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = real; });

// Stripe falso: guarda cada chamada (método, caminho, corpo decodificado) e responde como o de verdade.
// Falhas controláveis: recusa (tudo 401), semWebhook, semSessao (permissão), semMarca (recusa branding_settings), semArquivos.
function stripeFalso({ recusa = null, semWebhook = false, semSessao = false, semMarca = false, semArquivos = false, semPreco = false, semParcelas = false } = {}) {
  const chamadas = [];
  let n = 0;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const form = init.body instanceof FormData;
    const corpo = form ? { purpose: init.body.get("purpose"), nome: init.body.get("file")?.name } : init.body ? Object.fromEntries(new URLSearchParams(String(init.body))) : Object.fromEntries(u.searchParams);
    chamadas.push({ metodo: init.method || "GET", host: u.host, caminho: u.pathname, corpo, cab: init.headers });
    const ok = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
    const erro = (m, s) => ok({ error: { message: m } }, s);
    const live = String(init.headers?.authorization).includes("_live_");
    if (recusa) return ok({ error: { message: recusa, code: "api_key_invalid" } }, 401);
    if (u.host === "files.stripe.com") return semArquivos ? erro("This key does not have the required permissions for files", 403) : ok({ id: `file_${++n}` });
    if (u.pathname === "/v1/payment_links" && (init.method || "GET") === "GET") return ok({ data: [] });
    if (u.pathname === "/v1/prices" && (init.method || "GET") === "GET") return ok({ data: [] });
    if (u.pathname === "/v1/prices") return semPreco ? erro("The provided key does not have the required permissions for this endpoint (Prices: Write)", 403) : ok({ id: `price_${++n}`, livemode: live });
    if (u.pathname === "/v1/payment_links") return ok({ id: `plink_${++n}`, url: `https://buy.stripe.com/test_${n}`, livemode: live });
    if (u.pathname === "/v1/checkout/sessions") {
      if (semSessao) return erro("The provided key does not have the required permissions for this endpoint (Checkout Sessions: Write)", 403);
      if (semMarca && Object.keys(corpo).some((k) => k.startsWith("branding_settings"))) return erro("Invalid branding_settings", 400);
      if (semParcelas && Object.keys(corpo).some((k) => k.includes("[installments]"))) return erro("Installments are not supported for this account", 400);
      return ok({ id: `cs_${++n}`, url: `https://checkout.stripe.com/c/pay/cs_${n}`, livemode: live });
    }
    if (/^\/v1\/checkout\/sessions\/cs_\d+\/expire$/.test(u.pathname)) return ok({ status: "expired" });
    if (u.pathname === "/v1/webhook_endpoints") return semWebhook ? ok({ error: { message: "sem permissão para webhook_endpoints" } }, 403) : ok({ id: "we_1", secret: WHSEC });
    throw new Error("Stripe não simulado: " + u.host + u.pathname);
  };
  return chamadas;
}
const post = (c, corpo, h = {}) => new Request(ORIGEM + c, { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(corpo) });
const get = (c, h = {}) => new Request(ORIGEM + c, { headers: h });
const comToken = { authorization: `Bearer ${TOKEN}` };
const convite = (extra = {}) => assinar({ c: "instalar", id: "conv-" + Math.random().toString(36).slice(2), exp: agora() + 3600, ...extra }, SEGREDO);

async function ligado(env, chave = CHAVE) {
  stripeFalso();
  const r = await worker.fetch(post("/api/configurar", { convite: await convite(), chave }), env);
  assert.equal(r.status, 200, await r.clone().text());
  return r.json();
}
const assinatura = (corpo, whsec = WHSEC, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac("sha256", whsec).update(`${t}.${corpo}`).digest("hex")}`;
const evento = (tipo, sessao = {}, extra = {}) => ({ id: "evt_" + Math.random().toString(36).slice(2), type: tipo, created: Math.floor(Date.now() / 1000), livemode: true,
  data: { object: { id: "cs_1", object: "checkout.session", payment_status: "paid", amount_total: 15000, currency: "brl", mode: "payment", payment_link: "plink_x", customer_details: { email: "joao@exemplo.com", name: "João" }, ...sessao } }, ...extra });
const enviar = (env, ev, whsec = WHSEC) => { const c = JSON.stringify(ev); return worker.fetch(new Request(ORIGEM + "/webhook/stripe", { method: "POST", headers: { "stripe-signature": assinatura(c, whsec) }, body: c }), env); };

/* ---------------- acesso ---------------- */

test("a API abriria sem token, com token errado, ou com um token curto demais para ser segredo", async () => {
  const env = novoEnv();
  assert.equal((await worker.fetch(get("/api/links"), env)).status, 401);
  assert.equal((await worker.fetch(get("/api/links", { authorization: "Bearer errado" }), env)).status, 401);
  assert.equal((await worker.fetch(get("/api/pagamentos", { authorization: `Bearer ${TOKEN}x` }), env)).status, 401);
  assert.equal((await worker.fetch(get("/api/links", { authorization: "Bearer curto" }), novoEnv({ PAGAR_TOKEN: "curto" }))).status, 401);
  assert.equal((await worker.fetch(get("/api/links"), novoEnv({ PAGAR_TOKEN: "" }))).status, 401, "sem PAGAR_TOKEN a API tem de ficar fechada");
  assert.equal((await worker.fetch(get("/api/links", comToken), env)).status, 200);
});

test("o status público entregaria a chave ou o segredo do webhook", async () => {
  const env = novoEnv();
  await ligado(env);
  const t = await (await worker.fetch(get("/api/status"), env)).text();
  assert.deepEqual(JSON.parse(t), { stripe: true, modo: "live", webhook: true });
  assert.ok(!t.includes(CHAVE) && !t.includes(WHSEC));
});

/* ---------------- configurar (entrega da chave) ---------------- */

test("a chave do Stripe ficaria legível no KV, ou voltaria na resposta", async () => {
  const env = novoEnv();
  stripeFalso();
  const r = await worker.fetch(post("/api/configurar", { convite: await convite(), chave: CHAVE }), env);
  const corpo = await r.text();
  assert.deepEqual(JSON.parse(corpo), { ok: true, modo: "live", webhook: "criado", marca: "ok", sessoes: "ok" });
  assert.ok(!corpo.includes(CHAVE) && !corpo.includes(WHSEC));
  for (const [k, v] of env.ESTADO.m) assert.ok(!String(v).includes(CHAVE) && !String(v).includes(WHSEC), `texto claro em ${k}`);
  const cfg = await decifrar(env.ESTADO.m.get("cfg:stripe"), SEGREDO, "stripe");
  assert.deepEqual([cfg.chave, cfg.whsec, cfg.modo], [CHAVE, WHSEC, "live"]);
});

test("o mesmo link de configuração serviria duas vezes, ou depois de vencido, ou sem assinatura", async () => {
  const env = novoEnv();
  stripeFalso();
  const c = await convite();
  assert.equal((await worker.fetch(post("/api/configurar", { convite: c, chave: CHAVE }), env)).status, 200);
  assert.equal((await worker.fetch(post("/api/configurar", { convite: c, chave: CHAVE }), env)).status, 403, "uso único");
  assert.equal((await worker.fetch(post("/api/configurar", { convite: await convite({ exp: agora() - 1 }), chave: CHAVE }), env)).status, 403, "vencido");
  assert.equal((await worker.fetch(post("/api/configurar", { convite: c.replace(/\.[^.]+$/, ".falsa"), chave: CHAVE }), env)).status, 403, "assinatura falsa");
  assert.equal((await worker.fetch(post("/api/configurar", { convite: await convite({ c: "outro" }), chave: CHAVE }), env)).status, 403, "convite de outra finalidade");
  assert.equal((await worker.fetch(post("/api/configurar", { chave: CHAVE }), env)).status, 403, "sem convite");
});

test("texto qualquer ou chave que o Stripe recusa seria guardado como se fosse a chave", async () => {
  const env = novoEnv();
  stripeFalso();
  assert.equal((await worker.fetch(post("/api/configurar", { convite: await convite(), chave: "abc" }), env)).status, 400);
  stripeFalso({ recusa: "Invalid API Key provided" });
  const r = await worker.fetch(post("/api/configurar", { convite: await convite(), chave: CHAVE }), env);
  assert.equal(r.status, 400); assert.match((await r.json()).erro, /Stripe recusou/);
  assert.equal(env.ESTADO.m.has("cfg:stripe"), false, "nada guardado");
});

test("sem permissão de webhook a chave seria perdida em vez de guardada com o aviso", async () => {
  const env = novoEnv();
  stripeFalso({ semWebhook: true });
  const r = await (await worker.fetch(post("/api/configurar", { convite: await convite(), chave: CHAVE }), env)).json();
  assert.match(r.webhook, /^falhou/);
  assert.equal((await (await worker.fetch(get("/api/status"), env)).json()).webhook, false);
  stripeFalso();
  const manual = await (await worker.fetch(post("/api/configurar", { convite: await convite(), chave: CHAVE, whsec: WHSEC }), env)).json();
  assert.equal(manual.webhook, "informado");
});

test("trocar a chave guardada criaria outro webhook (e duplicaria cada pagamento), ou formulário de outro site configuraria", async () => {
  const env = novoEnv();
  await ligado(env);
  const chamadas = stripeFalso();
  const r = await (await worker.fetch(post("/api/configurar", { convite: await convite(), chave: CHAVE }), env)).json();
  assert.equal(r.webhook, "mantido");
  assert.ok(!chamadas.some((c) => c.caminho === "/v1/webhook_endpoints"));
  const semJson = new Request(ORIGEM + "/api/configurar", { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" });
  assert.equal((await worker.fetch(semJson, env)).status, 403);
  const deFora = new Request(ORIGEM + "/api/configurar", { method: "POST", headers: { "content-type": "application/json", origin: "https://mal.exemplo" }, body: "{}" });
  assert.equal((await worker.fetch(deFora, env)).status, 403);
});

test("chave de teste e chave real se misturariam: o modo guardado tem de seguir a chave", async () => {
  const env = novoEnv();
  assert.equal((await ligado(env, CHAVE_TESTE)).modo, "test");
  assert.equal((await ligado(novoEnv(), CHAVE)).modo, "live");
});

/* ---------------- links ---------------- */

test("sem o Stripe ligado a API fingiria criar um link", async () => {
  const r = await worker.fetch(post("/api/links", { descricao: "Site", valor: 15000 }, comToken), novoEnv());
  assert.equal(r.status, 409);
});

test("valor fixo viraria preço em reais errado, ou o link curto não abriria o checkout do Stripe", async () => {
  const env = novoEnv();
  await ligado(env);
  const chamadas = stripeFalso();
  const r = await worker.fetch(post("/api/links", { descricao: "Site institucional", valor: 15000 }, comToken), env);
  assert.equal(r.status, 201);
  const l = await r.json();
  assert.match(l.url, /^https:\/\/pagar\.exemplo\/p\/[2-9a-km-np-z]{8}$/);
  assert.match(l.price, /^price_/);
  const price = chamadas.find((c) => c.caminho === "/v1/prices").corpo;
  assert.deepEqual([price.currency, price.unit_amount, price["product_data[name]"]], ["brl", "15000", "Site institucional"]);
  assert.equal(price["recurring[interval]"], undefined);
  assert.ok(!chamadas.some((c) => c.caminho === "/v1/payment_links"), "criar não usa mais Payment Link");
  assert.ok(!chamadas.some((c) => c.caminho === "/v1/checkout/sessions"), "a sessão só nasce quando alguém abre o link");
  const ir = await worker.fetch(get(new URL(l.url).pathname), env);
  assert.equal(ir.status, 303); assert.match(ir.headers.get("location"), /^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_/);
  assert.equal(ir.headers.get("referrer-policy"), "no-referrer");
});

test("valor livre mandaria um valor fixo, e mensal com valor livre seria aceito", async () => {
  const env = novoEnv();
  await ligado(env);
  const chamadas = stripeFalso();
  const r = await worker.fetch(post("/api/links", { descricao: "Contribuição", livre: true, minimo: 1000, valor: 5000 }, comToken), env);
  assert.equal(r.status, 201);
  const p = chamadas.find((c) => c.caminho === "/v1/prices").corpo;
  assert.equal(p.unit_amount, undefined, "valor livre não pode ter valor fixo");
  assert.deepEqual([p["custom_unit_amount[enabled]"], p["custom_unit_amount[minimum]"], p["custom_unit_amount[preset]"]], ["true", "1000", "5000"]);
  assert.equal((await worker.fetch(post("/api/links", { descricao: "Plano", livre: true, recorrente: "month" }, comToken), env)).status, 400);
});

test("mensal cobraria uma vez só", async () => {
  const env = novoEnv();
  await ligado(env);
  const chamadas = stripeFalso();
  assert.equal((await worker.fetch(post("/api/links", { descricao: "Hospedagem", valor: 9900, recorrente: "month" }, comToken), env)).status, 201);
  assert.equal(chamadas.find((c) => c.caminho === "/v1/prices").corpo["recurring[interval]"], "month");
});

test("valor quebrado, negativo, em texto ou absurdo chegaria ao Stripe", () => {
  for (const valor of [0, 99, 150.5, -100, "15000", 5_000_001, null, undefined]) assert.ok(validar({ descricao: "Site", valor }).erro, `valor ${valor} passou`);
  assert.ok(validar({ descricao: "Si", valor: 15000 }).erro, "descrição curta");
  assert.ok(validar({ descricao: "x".repeat(121), valor: 15000 }).erro);
  assert.ok(validar({ descricao: "Site", valor: 15000, retorno: "http://inseguro.exemplo" }).erro, "retorno sem https");
  assert.ok(validar({ descricao: "Site", valor: 15000, retorno: "javascript:alert(1)" }).erro);
  assert.ok(validar({ descricao: "Site", valor: 15000, ref: "tem espaço" }).erro);
  assert.ok(validar({ descricao: "Site", valor: 15000, recorrente: "week" }).erro);
  assert.ok(validar({ descricao: "Site", livre: true, minimo: 5000, maximo: 1000 }).erro);
  assert.ok(validar({ descricao: "Site", valor: 15000, ref: "pedido-123", retorno: "https://site.exemplo/obrigado" }).ok);
});

test("o mesmo pedido pagaria dois links (o cliente clica duas vezes e vê dois checkouts)", async () => {
  const env = novoEnv();
  await ligado(env);
  const chamadas = stripeFalso();
  const a = await worker.fetch(post("/api/links", { descricao: "Pedido 123", valor: 20000, ref: "pedido-123" }, comToken), env);
  const b = await worker.fetch(post("/api/links", { descricao: "Pedido 123", valor: 20000, ref: "pedido-123" }, comToken), env);
  assert.deepEqual([a.status, b.status], [201, 200]);
  const [la, lb] = [await a.json(), await b.json()];
  assert.equal(la.id, lb.id); assert.equal(lb.repetido, true);
  assert.equal(chamadas.filter((c) => c.caminho === "/v1/prices").length, 1);
});

test("falha do Stripe deixaria um link curto que não leva a lugar nenhum", async () => {
  const env = novoEnv();
  await ligado(env);
  stripeFalso({ recusa: "Your account cannot currently make live charges" });
  const r = await worker.fetch(post("/api/links", { descricao: "Site", valor: 15000 }, comToken), env);
  assert.equal(r.status, 502); assert.match((await r.json()).erro, /Stripe recusou/);
  assert.deepEqual((await (await worker.fetch(get("/api/links", comToken), env)).json()).links, []);
  assert.equal((await worker.fetch(get("/p/22222222"), env)).status, 404);
});

test("o alfabeto dos ids e o validador discordariam e um link criado daria 404 (já aconteceu com a letra i)", async () => {
  const { novoId, idValido } = await import("./src/links.js");
  for (let i = 0; i < 3000; i++) { const id = novoId(); assert.ok(idValido(id), id); }
  for (const c of "23456789abcdefghijkmnpqrstuvwxyz") assert.ok(idValido(c.repeat(8)), c);
  for (const c of "01lo ABC-") assert.ok(!idValido(c.repeat(8)), `"${c}" não pode ser aceito`);
});

test("id inventado ou com caracteres estranhos redirecionaria ou quebraria", async () => {
  const env = novoEnv();
  for (const id of ["abc", "22222222", "..%2Fapi%2Flinks", "ABCDEFGH", "2222222%00"]) assert.equal((await worker.fetch(get(`/p/${id}`), env)).status, 404, id);
});

/* ---------------- webhook ---------------- */

test("webhook sem assinatura, com assinatura de outro segredo ou repetido de horas atrás seria aceito", async () => {
  const env = novoEnv();
  await ligado(env);
  const corpo = JSON.stringify(evento("checkout.session.completed"));
  const sem = await worker.fetch(new Request(ORIGEM + "/webhook/stripe", { method: "POST", body: corpo }), env);
  assert.equal(sem.status, 400);
  const outro = await worker.fetch(new Request(ORIGEM + "/webhook/stripe", { method: "POST", headers: { "stripe-signature": assinatura(corpo, "whsec_outro") }, body: corpo }), env);
  assert.equal(outro.status, 400);
  const velho = await worker.fetch(new Request(ORIGEM + "/webhook/stripe", { method: "POST", headers: { "stripe-signature": assinatura(corpo, WHSEC, Math.floor(Date.now() / 1000) - 3600) }, body: corpo }), env);
  assert.equal(velho.status, 400, "replay");
  const adulterado = await worker.fetch(new Request(ORIGEM + "/webhook/stripe", { method: "POST", headers: { "stripe-signature": assinatura(corpo) }, body: corpo.replace("15000", "1") }), env);
  assert.equal(adulterado.status, 400, "corpo alterado depois de assinado");
  assert.equal((await worker.fetch(get("/webhook/stripe"), env)).status, 405);
  assert.equal((await (await worker.fetch(get("/api/pagamentos", comToken), env)).json()).pagamentos.length, 0);
});

test("webhook com Stripe ainda não ligado aceitaria qualquer assinatura", async () => {
  const c = JSON.stringify(evento("checkout.session.completed"));
  const r = await worker.fetch(new Request(ORIGEM + "/webhook/stripe", { method: "POST", headers: { "stripe-signature": assinatura(c) }, body: c }), novoEnv());
  assert.equal(r.status, 400);
});

test("pagamento aprovado não apareceria na lista, ou o mesmo evento reenviado contaria duas vezes", async () => {
  const env = novoEnv();
  await ligado(env);
  stripeFalso();
  const l = await (await worker.fetch(post("/api/links", { descricao: "Site", valor: 15000 }, comToken), env)).json();
  const ev = evento("checkout.session.completed", { payment_link: null, metadata: { pagar_id: l.id } });
  assert.equal((await enviar(env, ev)).status, 200);
  assert.equal((await enviar(env, ev)).status, 200);
  const { pagamentos } = await (await worker.fetch(get("/api/pagamentos", comToken), env)).json();
  assert.equal(pagamentos.length, 1);
  assert.deepEqual([pagamentos[0].status, pagamentos[0].valor, pagamentos[0].link, pagamentos[0].email, pagamentos[0].modo], ["pago", 15000, l.id, "joao@exemplo.com", "live"]);
});

test("Pix aguardando contaria como dinheiro recebido, ou o evento atrasado desfaria um pagamento já confirmado", async () => {
  const env = novoEnv();
  await ligado(env);
  await enviar(env, evento("checkout.session.completed", { payment_status: "unpaid" }));
  const status = async () => (await (await worker.fetch(get("/api/pagamentos", comToken), env)).json()).pagamentos[0].status;
  assert.equal(await status(), "aguardando");
  await enviar(env, evento("checkout.session.async_payment_succeeded"));
  assert.equal(await status(), "pago");
  await enviar(env, evento("checkout.session.completed", { payment_status: "unpaid" }));
  assert.equal(await status(), "pago", "evento atrasado não rebaixa");
});

test("Pix que expirou ficaria como aguardando para sempre", async () => {
  const env = novoEnv();
  await ligado(env);
  await enviar(env, evento("checkout.session.completed", { payment_status: "unpaid" }));
  await enviar(env, evento("checkout.session.async_payment_failed", { payment_status: "unpaid" }));
  assert.equal((await (await worker.fetch(get("/api/pagamentos", comToken), env)).json()).pagamentos[0].status, "falhou");
});

test("evento que não é de pagamento, ou pagamento de um link que não é nosso, quebraria o webhook", async () => {
  const env = novoEnv();
  await ligado(env);
  const ign = await (await enviar(env, evento("customer.created"))).json();
  assert.equal(ign.ignorado, true);
  const r = await enviar(env, evento("checkout.session.completed", { payment_link: null, id: "cs_avulso" }));
  assert.equal(r.status, 200);
  assert.equal((await (await worker.fetch(get("/api/pagamentos", comToken), env)).json()).pagamentos[0].link, null);
});

test("assinatura mensal e dados do pagador se perderiam no registro", async () => {
  const env = novoEnv();
  await ligado(env);
  await enviar(env, evento("checkout.session.completed", { mode: "subscription", id: "cs_sub" }));
  const p = (await (await worker.fetch(get("/api/pagamentos", comToken), env)).json()).pagamentos[0];
  assert.deepEqual([p.assinatura, p.nome], [true, "João"]);
});

/* ---------------- peças ---------------- */

test("formulário do Stripe com colchetes aninhados e lista sairia errado", () => {
  const f = Object.fromEntries(formEncode({ currency: "brl", product_data: { name: "A & B" }, line_items: [{ price: "p", quantity: 1 }], vazio: undefined, nulo: null, recurring: undefined }));
  assert.deepEqual(f, { currency: "brl", "product_data[name]": "A & B", "line_items[0][price]": "p", "line_items[0][quantity]": "1" });
});

test("a assinatura aceitaria v1 inválida, tolerância estourada ou segredo vazio", async () => {
  const c = "{}", t = 1_700_000_000, boa = createHmac("sha256", WHSEC).update(`${t}.${c}`).digest("hex");
  assert.equal(await verificarAssinatura(c, `t=${t},v1=${boa}`, WHSEC, { agora: t }), true);
  assert.equal(await verificarAssinatura(c, `t=${t},v1=${"0".repeat(64)},v1=${boa}`, WHSEC, { agora: t }), true, "rotação: basta um v1 bater");
  assert.equal(await verificarAssinatura(c, `t=${t},v1=${"0".repeat(64)}`, WHSEC, { agora: t }), false);
  assert.equal(await verificarAssinatura(c, `t=${t},v1=${boa}`, WHSEC, { agora: t + 301 }), false);
  assert.equal(await verificarAssinatura(c, `t=${t},v1=${boa}`, "", { agora: t }), false);
  assert.equal(await verificarAssinatura(c, "", WHSEC, { agora: t }), false);
  assert.equal(await verificarAssinatura(c, `v1=${boa}`, WHSEC, { agora: t }), false, "sem t");
});

test("reais viraria centavos com ponto flutuante errado (0,29 vira 28)", () => {
  assert.equal(paraCentavos("150"), 15000); assert.equal(paraCentavos("150,5"), 15050); assert.equal(paraCentavos("1.234,56"), 123456);
  assert.equal(paraCentavos("R$ 0,29"), 29); assert.equal(paraCentavos("0,07"), 7); assert.equal(paraCentavos("19,90"), 1990);
  for (const ruim of ["", "abc", "1,234", "-5", "1e3", "12,3,4", null]) assert.equal(paraCentavos(ruim), null, String(ruim));
});


test("HTML dinâmico, script ou estilo embutido ou CSP frouxa deixariam a chave do Stripe exposta a injeção", () => {
  const site = new URL("./site/", import.meta.url);
  for (const f of readdirSync(site).filter((n) => n.endsWith(".js"))) assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(readFileSync(new URL(f, site), "utf8")), `${f} injeta HTML`);
  for (const f of readdirSync(site).filter((n) => n.endsWith(".html"))) {
    const html = readFileSync(new URL(f, site), "utf8");
    assert.ok(!/<script(?![^>]*\ssrc=)/.test(html) && !/\sstyle=|\son[a-z]+=/.test(html), `${f}: script/estilo embutido`);
  }
  const h = readFileSync(new URL("_headers", site), "utf8");
  assert.match(h, /script-src 'self'/); assert.match(h, /frame-ancestors 'none'/);
  assert.match(readFileSync(new URL("configurar.html", site), "utf8"), /name="referrer" content="no-referrer"/, "o convite iria no Referer");
});

test("rota que não é da API cairia no Worker em vez de ir para os arquivos estáticos", async () => {
  assert.equal(await (await worker.fetch(get("/novo"), novoEnv())).text(), "asset");
});

test("campo ou formulário com hidden continuaria na tela porque display:grid vence o atributo (já aconteceu)", () => {
  assert.match(readFileSync(new URL("./site/estilo.css", import.meta.url), "utf8"), /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
});

/* ---------------- checkout com a marca (a cada abertura de /p/<id>) ---------------- */
import { LIMITE_POR_MINUTO, VERSAO_MARCA } from "./src/checkout.js";

async function comLink(corpo = { descricao: "Contribua com o projeto", livre: true, minimo: 100 }, opcoes = {}) {
  const env = novoEnv();
  await ligado(env);
  stripeFalso();
  const l = await (await worker.fetch(post("/api/links", corpo, comToken), env)).json();
  const chamadas = stripeFalso(opcoes);
  return { env, l, chamadas, abrir: () => worker.fetch(get(new URL(l.url).pathname), env) };
}
const sessoes = (chamadas) => chamadas.filter((c) => c.metodo === "POST" && c.caminho === "/v1/checkout/sessions");

test("o checkout abriria sem o símbolo, o nome e as cores configurados em marca.json", async () => {
  const { chamadas, abrir } = await comLink();
  const r = await abrir();
  assert.equal(r.status, 303);
  const [s] = sessoes(chamadas);
  const m = JSON.parse(readFileSync(new URL("./site/marca/marca.json", import.meta.url), "utf8"));
  assert.equal(s.corpo["branding_settings[display_name]"], m.nome);
  assert.equal(s.corpo["branding_settings[background_color]"], m.fundo);
  assert.equal(s.corpo["branding_settings[button_color]"], m.botao);
  assert.equal(s.corpo["branding_settings[border_style]"], m.bordas);
  assert.equal(s.corpo["branding_settings[icon][type]"], "file"); assert.match(s.corpo["branding_settings[icon][file]"], /^file_/);
  assert.equal(s.corpo["branding_settings[logo][type]"], "file"); assert.match(s.corpo["branding_settings[logo][file]"], /^file_/);
  assert.notEqual(s.corpo["branding_settings[icon][file]"], s.corpo["branding_settings[logo][file]"]);
  assert.equal(String(s.cab["stripe-version"]), VERSAO_MARCA, "branding_settings só existe nesta versão da API ou mais nova");
});

const PARCELAS = "payment_method_options[card][installments][enabled]";

test("pagamento único abriria o checkout sem oferecer parcelamento no cartão", async () => {
  const { chamadas, abrir } = await comLink({ descricao: "Pedido da loja", valor: 30000 });
  await abrir();
  assert.equal(sessoes(chamadas)[0].corpo[PARCELAS], "true");
});

test("assinatura mensal pediria parcelamento, que o Stripe não aceita em recorrência", async () => {
  const { chamadas, abrir } = await comLink({ descricao: "Hospedagem", valor: 9900, recorrente: "month" });
  await abrir();
  assert.equal(sessoes(chamadas)[0].corpo[PARCELAS], undefined);
});

test("conta que recusa parcelamento ainda abre o checkout, com a marca, sem parcelar", async () => {
  const { chamadas, abrir } = await comLink({ descricao: "Pedido da loja", valor: 30000 }, { semParcelas: true });
  const r = await abrir();
  assert.equal(r.status, 303);
  assert.match(r.headers.get("location"), /^https:\/\/checkout\.stripe\.com\//);
  const todas = sessoes(chamadas);
  assert.equal(todas.at(-1).corpo[PARCELAS], undefined);
  assert.ok(todas.at(-1).corpo["branding_settings[display_name]"], "perder o parcelamento não pode custar a marca");
});

test("a sessão mandaria o pagador para um lugar sem volta, ou perderia a ligação com o link", async () => {
  const { l, chamadas, abrir } = await comLink({ descricao: "Hospedagem", valor: 9900, recorrente: "month", ref: "pedido-9", retorno: "https://site.exemplo/obrigado" });
  await abrir();
  const s = sessoes(chamadas)[0].corpo;
  assert.deepEqual([s.mode, s["line_items[0][price]"], s["line_items[0][quantity]"], s.locale], ["subscription", l.price, "1", "pt-BR"]);
  assert.deepEqual([s["metadata[pagar_id]"], s["metadata[ref]"], s["subscription_data[metadata][pagar_id]"]], [l.id, "pedido-9", l.id]);
  assert.equal(s.success_url, "https://site.exemplo/obrigado");
  assert.equal(s.cancel_url, `${ORIGEM}/cancelado`);
  const { chamadas: c2, abrir: ab2 } = await comLink({ descricao: "Contribuição", valor: 2000 });
  await ab2();
  const u = sessoes(c2)[0].corpo;
  assert.equal(u.mode, "payment"); assert.equal(u.success_url, `${ORIGEM}/obrigado`); assert.equal(u["subscription_data[metadata][pagar_id]"], undefined);
});

test("duas pessoas abrindo o mesmo link dividiriam uma sessão (a segunda veria 'já concluída')", async () => {
  const { chamadas, abrir } = await comLink();
  const a = (await abrir()).headers.get("location"), b = (await abrir()).headers.get("location");
  assert.notEqual(a, b);
  assert.equal(sessoes(chamadas).length, 2);
});

test("os arquivos da marca subiriam ao Stripe a cada clique em vez de uma vez só", async () => {
  const env = novoEnv();
  const naConfiguracao = stripeFalso();
  await worker.fetch(post("/api/configurar", { convite: await convite(), chave: CHAVE }), env);
  assert.deepEqual(naConfiguracao.filter((c) => c.host === "files.stripe.com").map((c) => c.corpo.purpose).sort(), ["business_icon", "business_logo"], "sobem ao configurar");
  stripeFalso();
  const l = await (await worker.fetch(post("/api/links", { descricao: "Doação", livre: true }, comToken), env)).json();
  const nasAberturas = stripeFalso();
  for (let i = 0; i < 3; i++) await worker.fetch(get(new URL(l.url).pathname), env);
  assert.equal(nasAberturas.filter((c) => c.host === "files.stripe.com").length, 0, "abrir o link não sobe arquivo de novo");
  assert.equal(sessoes(nasAberturas).length, 3);
});

test("trocar o PNG da marca no repositório continuaria usando o arquivo velho do Stripe", async () => {
  const { env, chamadas, abrir } = await comLink();
  for (const k of [...env.ESTADO.m.keys()].filter((k) => k.startsWith("arq:"))) env.ESTADO.m.delete(k); // como se o sha256 tivesse mudado
  await abrir();
  assert.deepEqual(chamadas.filter((c) => c.host === "files.stripe.com").map((c) => c.corpo.purpose).sort(), ["business_icon", "business_logo"]);
});

test("a marca recusada impediria o pagamento (pagar vale mais que a marca)", async () => {
  const { chamadas, abrir } = await comLink(undefined, { semMarca: true });
  const r = await abrir();
  assert.equal(r.status, 303, "tem de abrir mesmo assim");
  const tentativas = sessoes(chamadas);
  assert.equal(tentativas.length, 2);
  assert.ok(Object.keys(tentativas[0].corpo).some((k) => k.startsWith("branding_settings")));
  assert.ok(!Object.keys(tentativas[1].corpo).some((k) => k.startsWith("branding_settings")), "a segunda tentativa vai sem marca");
});

test("o envio da marca falhando (sem permissão de Files) impediria o pagamento", async () => {
  const { env, chamadas, abrir } = await comLink(undefined, { semArquivos: true });
  for (const k of [...env.ESTADO.m.keys()].filter((k) => k.startsWith("arq:"))) env.ESTADO.m.delete(k); // força novo envio
  assert.equal((await abrir()).status, 303);
  assert.ok(!Object.keys(sessoes(chamadas)[0].corpo).some((k) => k.startsWith("branding_settings")));
});

test("arquivo da marca ausente no site derrubaria a abertura do link", async () => {
  const { env, chamadas, abrir } = await comLink();
  env.ASSETS = { fetch: async () => new Response("não existe", { status: 404 }) };
  assert.equal((await abrir()).status, 303);
  assert.ok(!Object.keys(sessoes(chamadas)[0].corpo).some((k) => k.startsWith("branding_settings")));
});

test("o Stripe recusar a sessão deixaria o pagador numa tela quebrada em vez de uma mensagem", async () => {
  const { abrir } = await comLink(undefined, { semSessao: true });
  const r = await abrir();
  assert.equal(r.status, 502);
  const t = await r.text();
  assert.match(t, /Tente de novo/); assert.ok(!t.includes("Checkout Sessions: Write"), "a mensagem do Stripe não vai para o pagador");
});

test("link antigo (criado como Payment Link) pararia de abrir, ou nunca ganharia a marca", async () => {
  const env = novoEnv();
  await ligado(env);
  env.ESTADO.m.set("link:3bgbvrdw", JSON.stringify({ id: "3bgbvrdw", url: `${ORIGEM}/p/3bgbvrdw`, stripe_url: "https://buy.stripe.com/antigo", stripe_link: "plink_velho", descricao: "Contribua", valor: null, livre: true, minimo: 100, maximo: null, recorrente: null, ref: null, modo: "live" }));
  env.ESTADO.m.set("plink:plink_velho", "3bgbvrdw");
  const chamadas = stripeFalso();
  const r = await worker.fetch(get("/p/3bgbvrdw"), env);
  assert.equal(r.status, 303); assert.match(r.headers.get("location"), /checkout\.stripe\.com/);
  const price = chamadas.find((c) => c.caminho === "/v1/prices" && c.metodo === "POST");
  assert.equal(price.corpo["custom_unit_amount[enabled]"], "true", "o preço do link antigo é recriado do que está guardado");
  assert.match(JSON.parse(env.ESTADO.m.get("link:3bgbvrdw")).price, /^price_/, "o preço fica guardado: só cria uma vez");
  const c2 = stripeFalso(); await worker.fetch(get("/p/3bgbvrdw"), env);
  assert.ok(!c2.some((c) => c.caminho === "/v1/prices"), "segunda abertura não cria preço de novo");
  // sem permissão de sessão, o link antigo volta ao Payment Link que sempre teve
  stripeFalso({ semSessao: true });
  const volta = await worker.fetch(get("/p/3bgbvrdw"), env);
  assert.equal(volta.status, 303); assert.equal(volta.headers.get("location"), "https://buy.stripe.com/antigo");
});

test("link antigo ficaria sem abrir quando a chave não consegue criar o preço (chave restrita ainda não atualizada)", async () => {
  const env = novoEnv();
  await ligado(env);
  env.ESTADO.m.set("link:3bgbvrdw", JSON.stringify({ id: "3bgbvrdw", stripe_url: "https://buy.stripe.com/antigo", descricao: "Contribua", livre: true, minimo: 100, valor: null, maximo: null, recorrente: null, ref: null }));
  stripeFalso({ semPreco: true, semSessao: true });
  const r = await worker.fetch(get("/p/3bgbvrdw"), env);
  assert.equal(r.status, 303); assert.equal(r.headers.get("location"), "https://buy.stripe.com/antigo");
  // link novo não tem para onde voltar: mostra o aviso em vez de redirecionar para lugar nenhum
  env.ESTADO.m.set("link:4bgbvrdw", JSON.stringify({ id: "4bgbvrdw", descricao: "Novo", valor: 500 }));
  assert.equal((await worker.fetch(get("/p/4bgbvrdw"), env)).status, 502);
});

test("um robô abrindo o link sem parar encheria o painel do Stripe de sessões", async () => {
  const { abrir, chamadas } = await comLink();
  let ultimo;
  for (let i = 0; i < LIMITE_POR_MINUTO + 5; i++) ultimo = await abrir();
  assert.equal(ultimo.status, 429);
  assert.equal(sessoes(chamadas).length, LIMITE_POR_MINUTO);
});

test("link sem o Stripe ligado, ou inexistente, apareceria como erro cru", async () => {
  const env = novoEnv();
  env.ESTADO.m.set("link:22222222", JSON.stringify({ id: "22222222", descricao: "x", valor: 500 }));
  const r = await worker.fetch(get("/p/22222222"), env);
  assert.equal(r.status, 503); assert.match(await r.text(), /ainda não está ativo/);
  assert.equal((await worker.fetch(get("/p/33333333"), env)).status, 404);
});

test("pagamento de link novo e de link antigo se perderiam do registro (ids diferentes)", async () => {
  const env = novoEnv();
  await ligado(env);
  env.ESTADO.m.set("plink:plink_velho", "aaaaaaaa");
  await enviar(env, evento("checkout.session.completed", { id: "cs_novo", payment_link: null, metadata: { pagar_id: "bbbbbbbb" } }));
  await enviar(env, evento("checkout.session.completed", { id: "cs_velho", payment_link: "plink_velho" }));
  await enviar(env, evento("checkout.session.completed", { id: "cs_lixo", payment_link: null, metadata: { pagar_id: "../../x" } }));
  const p = Object.fromEntries((await (await worker.fetch(get("/api/pagamentos", comToken), env)).json()).pagamentos.map((x) => [x.sessao, x.link]));
  assert.deepEqual(p, { cs_novo: "bbbbbbbb", cs_velho: "aaaaaaaa", cs_lixo: null });
});

/* ---------------- configurar prova o que a chave consegue ---------------- */

test("a chave sem permissão de Checkout Sessions seria aceita em silêncio e o primeiro pagador descobriria", async () => {
  const env = novoEnv();
  stripeFalso({ semSessao: true, semArquivos: true });
  const r = await (await worker.fetch(post("/api/configurar", { convite: await convite(), chave: CHAVE }), env)).json();
  assert.equal(r.ok, true, "a chave fica guardada");
  assert.match(r.sessoes, /^falhou: .*Checkout Sessions/); assert.match(r.marca, /^falhou: /);
});

test("a prova de configuração deixaria uma sessão de R$ 1 aberta na conta do dono", async () => {
  const env = novoEnv();
  const chamadas = stripeFalso();
  await worker.fetch(post("/api/configurar", { convite: await convite(), chave: CHAVE }), env);
  const criadas = sessoes(chamadas);
  assert.equal(criadas.length, 1);
  assert.equal(criadas[0].corpo["line_items[0][price_data][unit_amount]"], "100");
  assert.ok(chamadas.some((c) => /\/v1\/checkout\/sessions\/cs_\d+\/expire$/.test(c.caminho)), "a sessão de teste é expirada na hora");
});

/* ---------------- os arquivos da marca ---------------- */

test("marca.json apontando para arquivo que não existe, grande demais ou fora do tamanho que o Stripe aceita", () => {
  const raiz = new URL("./site", import.meta.url);
  const m = JSON.parse(readFileSync(new URL("./site/marca/marca.json", import.meta.url), "utf8"));
  for (const cor of [m.fundo, m.botao]) assert.match(cor, /^#[0-9A-Fa-f]{6}$/);
  assert.ok(["rectangular", "pill", "rounded"].includes(m.bordas));
  assert.ok(m.nome.length >= 2);
  for (const [campo, quadrado] of [["icone", true], ["logo", false]]) {
    const png = readFileSync(new URL("." + m[campo], new URL("./site/", import.meta.url)));
    assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], `${campo}: tem de ser PNG`);
    const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    assert.ok(png.length < 512 * 1024, `${campo}: ${png.length} bytes passa de 512 KB`);
    assert.ok(w >= 128 && h >= 128, `${campo}: ${w}x${h} é menor que 128x128`);
    if (quadrado) assert.equal(w, h, "o ícone é quadrado");
  }
  assert.ok(raiz);
});

test("assinatura com mês grátis entraria sem cartão ou cobraria já na primeira abertura", async () => {
  const { chamadas, abrir } = await comLink({ descricao: "Plano mensal", valor: 10000, recorrente: "month", teste_dias: 30 });
  await abrir();
  const s = sessoes(chamadas)[0].corpo;
  assert.equal(s["subscription_data[trial_period_days]"], "30");
  assert.equal(s.payment_method_collection, "always", "sem cartão obrigatório o 2º mês falha");
  const { chamadas: c2, abrir: ab2 } = await comLink({ descricao: "Hospedagem", valor: 9900, recorrente: "month" });
  await ab2();
  const u = sessoes(c2)[0].corpo;
  assert.equal(u["subscription_data[trial_period_days]"], undefined);
  assert.equal(u.payment_method_collection, undefined);
});

test("teste_dias em pagamento único, fora de 1 a 90 ou quebrado chegaria ao Stripe", () => {
  assert.ok(validar({ descricao: "Site", valor: 15000, teste_dias: 30 }).erro, "teste sem assinatura");
  for (const t of [0, 91, 1.5, "30", -1]) assert.ok(validar({ descricao: "Plano", valor: 10000, recorrente: "month", teste_dias: t }).erro, `teste_dias ${t} passou`);
  assert.equal(validar({ descricao: "Plano", valor: 10000, recorrente: "month", teste_dias: 30 }).ok.teste_dias, 30);
});

test("cadastro com mês grátis apareceria como pago e o cliente ganharia acesso sem ter cartão confirmado", async () => {
  const env = novoEnv();
  const ev = { id: "evt_trial", type: "checkout.session.completed", livemode: false, created: 1760000000,
    data: { object: { id: "cs_t1", mode: "subscription", payment_status: "no_payment_required", customer: "cus_1", subscription: "sub_1", currency: "brl", amount_total: 0, metadata: {}, customer_details: { email: "a@b.com" } } } };
  const r = await registrar(env, ev);
  assert.equal(r.registrado.status, "em_teste");
  assert.deepEqual([r.registrado.cliente, r.registrado.assinatura_id], ["cus_1", "sub_1"]);
});

test("pedido pago de um sistema externo não seria visto por ref, ou Pix aguardando liberaria a publicação", async () => {
  const env = novoEnv();
  await ligado(env);
  stripeFalso();
  const ref = "pg-" + "ab".repeat(16);
  const link = await (await worker.fetch(post("/api/links", { descricao: "Site X", valor: 100, ref }, comToken), env)).json();
  const ver = async () => (await worker.fetch(get("/api/links/ref/" + ref, comToken), env)).json();
  assert.equal((await ver()).pago, false);
  assert.equal((await worker.fetch(get("/api/links/ref/" + ref), env)).status, 401, "sem token não consulta");
  const r = await worker.fetch(get("/r/" + ref), env);
  assert.equal(r.status, 303, "/r/<ref> abre o checkout");
  assert.equal((await worker.fetch(get("/r/pg-" + "cd".repeat(16)), env)).status, 404);
  await enviar(env, evento("checkout.session.completed", { payment_status: "unpaid", payment_link: null, metadata: { pagar_id: link.id } }));
  assert.equal((await ver()).pago, false, "Pix aguardando não é pago");
  await enviar(env, evento("checkout.session.async_payment_succeeded", { payment_link: null, metadata: { pagar_id: link.id } }));
  assert.equal((await ver()).pago, true);
});

/* ---------------- ciclo da assinatura ---------------- */

const evAss = (tipo, ass = {}, extra = {}) => ({ id: "evt_" + Math.random().toString(36).slice(2), type: tipo, created: Math.floor(Date.now() / 1000), livemode: true,
  data: { object: { id: "sub_1", object: "subscription", customer: "cus_1", status: "trialing", trial_end: 1763000000, cancel_at_period_end: false, metadata: { pagar_id: "qhych6qw" }, ...ass } }, ...extra });
const estadoDe = async (env, query = "") => (await (await worker.fetch(get("/api/assinaturas" + query, comToken), env)).json()).assinaturas;

test("cancelamento ou cartão recusado deixariam a empresa com acesso", async () => {
  const env = novoEnv();
  await ligado(env);
  await enviar(env, evAss("customer.subscription.created", { status: "trialing" }));
  assert.equal((await estadoDe(env))[0].acesso, true, "em teste tem acesso");
  await enviar(env, evAss("customer.subscription.updated", { status: "active" }));
  assert.equal((await estadoDe(env))[0].acesso, true, "pagando tem acesso");
  for (const status of ["past_due", "unpaid", "incomplete", "incomplete_expired", "paused", "canceled"]) {
    await enviar(env, evAss("customer.subscription.updated", { status }, { created: Math.floor(Date.now() / 1000) + 5 }));
    assert.equal((await estadoDe(env))[0].acesso, false, `${status} não pode ter acesso`);
  }
});

test("assinatura apagada no Stripe continuaria valendo pelo status do último evento", async () => {
  const env = novoEnv();
  await ligado(env);
  await enviar(env, evAss("customer.subscription.deleted", { status: "active" }));
  const [a] = await estadoDe(env);
  assert.deepEqual([a.status, a.acesso], ["canceled", false]);
});

test("evento atrasado reabriria o acesso de quem já cancelou", async () => {
  const env = novoEnv();
  await ligado(env);
  const t = Math.floor(Date.now() / 1000);
  await enviar(env, evAss("customer.subscription.deleted", { status: "canceled" }, { created: t }));
  await enviar(env, evAss("customer.subscription.updated", { status: "active" }, { created: t - 60 }));
  const [a] = await estadoDe(env);
  assert.deepEqual([a.status, a.acesso], ["canceled", false]);
});

test("o mesmo evento reenviado criaria duas assinaturas na lista", async () => {
  const env = novoEnv();
  await ligado(env);
  const ev = evAss("customer.subscription.created");
  await enviar(env, ev); await enviar(env, ev);
  await enviar(env, evAss("customer.subscription.updated", { status: "active" }));
  assert.equal((await estadoDe(env)).length, 1);
});

test("consultar uma empresa pelo e-mail não acharia a assinatura (o evento não traz e-mail)", async () => {
  const env = novoEnv();
  await ligado(env);
  await enviar(env, evento("checkout.session.completed", { id: "cs_m", mode: "subscription", payment_status: "no_payment_required", customer: "cus_1", subscription: "sub_1" }));
  await enviar(env, evAss("customer.subscription.created"));
  assert.equal((await estadoDe(env, "?email=JOAO@exemplo.com")).length, 1, "e-mail sem diferenciar maiúscula");
  assert.equal((await estadoDe(env, "?email=outro@exemplo.com")).length, 0);
});

test("a lista de assinaturas abriria sem token", async () => {
  const env = novoEnv();
  assert.equal((await worker.fetch(get("/api/assinaturas"), env)).status, 401);
  assert.equal((await worker.fetch(post("/api/webhook/sincronizar", {}), env)).status, 401);
});

test("webhook antigo (só checkout.*) nunca receberia cancelamento", async () => {
  const env = novoEnv();
  await ligado(env);
  const chamadas = [];
  const base = ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed"];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    chamadas.push({ metodo: init.method || "GET", caminho: u.pathname, corpo: init.body ? String(init.body) : "" });
    const j = (o) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } });
    if (!init.method || init.method === "GET") return j({ data: [{ id: "we_9", url: `${ORIGEM}/webhook/stripe`, enabled_events: base }, { id: "we_outro", url: "https://outro.exemplo/hook", enabled_events: ["*"] }] });
    return j({ id: "we_9", enabled_events: [...base, "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"] });
  };
  const r = await (await worker.fetch(post("/api/webhook/sincronizar", {}, comToken), env)).json();
  assert.deepEqual([r.ok, r.alterado], [true, true]);
  const escrita = chamadas.find((c) => c.metodo === "POST");
  assert.equal(escrita.caminho, "/v1/webhook_endpoints/we_9", "mexeu no endpoint errado");
  for (const e of ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"]) assert.ok(decodeURIComponent(escrita.corpo).includes(e), e);
  // já em dia: não escreve de novo
  chamadas.length = 0;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ id: "we_9", url: `${ORIGEM}/webhook/stripe`, enabled_events: r.eventos }] }), { headers: { "content-type": "application/json" } });
  assert.equal((await (await worker.fetch(post("/api/webhook/sincronizar", {}, comToken), env)).json()).alterado, false);
});

test("sincronizar sem webhook nosso no Stripe diria que deu certo", async () => {
  const env = novoEnv();
  await ligado(env);
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ id: "we_x", url: "https://outro.exemplo/hook", enabled_events: ["*"] }] }), { headers: { "content-type": "application/json" } });
  assert.equal((await worker.fetch(post("/api/webhook/sincronizar", {}, comToken), env)).status, 409);
});
