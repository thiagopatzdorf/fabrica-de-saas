// Sobe a Loja Mínima inteira no seu computador, sem Cloudflare e sem cobrar ninguém de verdade:
// o Worker de verdade, KV em memória (com o catálogo fictício de exemplo/catalogo.json), a pasta site/ como Static Assets
// e um provedor de pagamento de mentira embutido.
//   node servir-local.mjs        # http://localhost:8790  (painel em /admin.html)
// Variáveis opcionais: PORT, ADMIN_TOKEN (chave do painel; sem ela usa uma chave fixa de desenvolvimento), PAGAR_PAGO=1 (o
// pagamento falso diz que todo pedido já foi pago), SEM_EXEMPLO=1 (começa sem produtos) e PAGAR_URL + PAGAR_TOKEN (usa um
// provedor de verdade, por exemplo o `links-de-pagamento` rodando em outra porta, em vez do falso).
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import worker from "./worker.js";

const SITE = join(fileURLToPath(new URL(".", import.meta.url)), "site");
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".txt": "text/plain" };
const porta = Number(process.env.PORT) || 8790;
const ADMIN = process.env.ADMIN_TOKEN || "chave-local-so-para-desenvolver-123";
const m = new Map();
if (process.env.SEM_EXEMPLO !== "1") m.set("catalogo", await readFile(join(SITE, "..", "exemplo", "catalogo.json"), "utf8"));
const FALSO = "https://pagar-falso.local";
const pagarFalso = !process.env.PAGAR_URL;
const env = {
  SESSAO_SEGREDO: "segredo-local-so-para-desenvolver", ADMIN_TOKEN: ADMIN, PAGAR_URL: process.env.PAGAR_URL || FALSO, PAGAR_TOKEN: process.env.PAGAR_TOKEN || "token-local-so-para-desenvolver-123",
  ESTADO: {
    get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v), delete: async (k) => void m.delete(k),
    list: async ({ prefix = "" } = {}) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
  },
  ASSETS: {
    async fetch(pedido) {
      let caminho = new URL(pedido.url).pathname;
      if (caminho === "/") caminho = "/index.html";
      const arquivo = normalize(join(SITE, caminho));
      if (!arquivo.startsWith(SITE)) return new Response("negado", { status: 403 });
      try { return new Response(await readFile(arquivo), { headers: { "content-type": TIPOS[extname(arquivo)] || "application/octet-stream" } }); }
      catch { return new Response("não encontrado", { status: 404 }); }
    },
  },
};

// Os cabeçalhos do bloco `/*` de site/_headers (CSP inclusa) valem aqui também: assim o que o navegador local bloqueia é o que a Cloudflare bloquearia.
const globais = {};
for (const linha of (await readFile(join(SITE, "_headers"), "utf8")).split("\n").slice(1)) {
  if (!linha.startsWith("  ")) break;
  const i = linha.indexOf(":");
  globais[linha.slice(0, i).trim().toLowerCase()] = linha.slice(i + 1).trim();
}

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (!pagarFalso || u.host !== "pagar-falso.local") return realFetch(url, init);
  if (u.pathname === "/api/links") return new Response(JSON.stringify({ url: `http://localhost:${porta}/obrigado.html?p=${JSON.parse(init.body).ref.slice(5)}` }), { status: 201 });
  return new Response(JSON.stringify({ pago: process.env.PAGAR_PAGO === "1" }));
};

http.createServer(async (req, res) => {
  const corpo = ["GET", "HEAD"].includes(req.method) ? undefined : await new Promise((ok) => { const p = []; req.on("data", (c) => p.push(c)); req.on("end", () => ok(Buffer.concat(p))); });
  const h = { ...req.headers, "cf-connecting-ip": "127.0.0.1" };
  const r = await worker.fetch(new Request(`http://localhost:${porta}${req.url}`, { method: req.method, headers: h, body: corpo, redirect: "manual" }), env);
  const cab = {};
  r.headers.forEach((v, k) => { cab[k] = v.replace("; Secure", ""); });
  if (!req.url.startsWith("/api/")) Object.assign(cab, globais);
  res.writeHead(r.status, cab);
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(porta, () => {
  console.log(`Loja Mínima em http://localhost:${porta}  (painel: /admin.html)`);
  console.log(`chave do painel: ${ADMIN}  (só para desenvolvimento local)`);
  console.log(pagarFalso ? "pagamento: FALSO embutido (nenhuma cobrança real)" : `pagamento: ${process.env.PAGAR_URL}`);
});
