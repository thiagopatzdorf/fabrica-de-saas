// Sobe o Links de Pagamento inteiro no seu computador, sem Cloudflare e SEM tocar no Stripe de verdade:
// o Worker de verdade, KV em memória, a pasta site/ como Static Assets e um Stripe falso que
// responde às chamadas que o Worker faz (preço, sessão de checkout, arquivo da marca, webhook).
//   node servir-local.mjs        # http://localhost:8788
// Imprime o link de configuração (qualquer chave rk_test_... de 20+ letras serve) e o token da API.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import worker from "./worker.js";
import { assinar, agora } from "./src/sessao.js";

const SITE = join(fileURLToPath(new URL(".", import.meta.url)), "site");
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".txt": "text/plain" };
const SEGREDO = "segredo-local-so-para-desenvolver";
const TOKEN = process.env.PAGAR_TOKEN || "token-local-so-para-desenvolver-123";
const porta = Number(process.env.PORT) || 8788;
const m = new Map();
const env = {
  SESSAO_SEGREDO: SEGREDO, PAGAR_TOKEN: TOKEN,
  ESTADO: { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v), delete: async (k) => void m.delete(k) },
  ASSETS: {
    async fetch(pedido) {
      let caminho = new URL(pedido.url).pathname;
      if (caminho === "/") caminho = "/index.html"; else if (!extname(caminho)) caminho += ".html";
      const arquivo = normalize(join(SITE, caminho));
      if (!arquivo.startsWith(SITE)) return new Response("negado", { status: 403 });
      try { return new Response(await readFile(arquivo), { headers: { "content-type": TIPOS[extname(arquivo)] || "application/octet-stream" } }); }
      catch { return new Response("não encontrado", { status: 404 }); }
    },
  },
};

let n = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (u.hostname !== "api.stripe.com" && u.hostname !== "files.stripe.com") return realFetch(url, init);
  const ok = (o) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } });
  if (u.hostname === "files.stripe.com") return ok({ id: `file_local_${++n}` });
  if (u.pathname === "/v1/prices" && init.method !== "POST") return ok({ data: [] });
  if (u.pathname === "/v1/prices") return ok({ id: `price_local_${++n}`, livemode: false });
  if (u.pathname === "/v1/checkout/sessions") return ok({ id: `cs_local_${++n}`, url: `https://checkout.stripe.com/c/pay/cs_local_${n}`, livemode: false });
  if (/\/v1\/checkout\/sessions\/.+\/expire$/.test(u.pathname)) return ok({ status: "expired" });
  if (u.pathname === "/v1/payment_links" && init.method === "POST") return ok({ id: `plink_local_${++n}`, url: `https://buy.stripe.com/test_local_${n}`, livemode: false });
  if (u.pathname === "/v1/payment_links") return ok({ data: [] });
  if (u.pathname === "/v1/webhook_endpoints") return ok({ id: "we_local", secret: "whsec_local" + "x".repeat(24) });
  return new Response(JSON.stringify({ error: { message: "rota do Stripe falso não existe" } }), { status: 404 });
};

http.createServer(async (req, res) => {
  const corpo = ["GET", "HEAD"].includes(req.method) ? undefined : await new Promise((ok) => { const p = []; req.on("data", (c) => p.push(c)); req.on("end", () => ok(Buffer.concat(p))); });
  const r = await worker.fetch(new Request(`http://localhost:${porta}${req.url}`, { method: req.method, headers: req.headers, body: corpo, redirect: "manual" }), env);
  const cab = {};
  r.headers.forEach((v, k) => { cab[k] = v; });
  res.writeHead(r.status, cab);
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(porta, async () => {
  const convite = await assinar({ c: "instalar", id: "local-" + Date.now(), exp: agora() + 3600 }, SEGREDO);
  console.log(`Links de Pagamento em http://localhost:${porta}`);
  console.log(`configurar: http://localhost:${porta}/configurar?convite=${convite}`);
  console.log(`token da API: ${TOKEN}`);
});
