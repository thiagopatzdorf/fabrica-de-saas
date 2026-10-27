// Sobe o Ponto Eletrônico inteiro no seu computador, sem Cloudflare: o Worker de verdade, D1 em memória
// (node:sqlite) e a pasta site/ como Static Assets, com os mesmos cabeçalhos do _headers.
//   node servidor/servir-local.mjs        # http://localhost:8790
// Imprime o link de instalação (convite de 72 h). A câmera e a localização exigem localhost ou HTTPS.
import http from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import worker, { convite } from "./worker.js";

const AQUI = fileURLToPath(new URL(".", import.meta.url));
const SITE = join(AQUI, "..", "site");
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json", ".bin": "application/octet-stream", ".webp": "image/webp", ".txt": "text/plain" };
// Sem SEGREDO no ambiente, nasce um aleatório a cada execução (banco em memória some junto): nada fixo no código.
const SEGREDO = process.env.SEGREDO || randomBytes(24).toString("hex");
const porta = Number(process.env.PORT) || 8790;

if (process.env.BANCO && !process.env.SEGREDO) { console.error("BANCO em arquivo exige SEGREDO fixo: com segredo aleatório, CPF e rosto já gravados ficariam ilegíveis."); process.exit(1); }
const s = new DatabaseSync(process.env.BANCO || ":memory:");
s.exec(readFileSync(join(AQUI, "schema.sql"), "utf8"));
const conv = (a) => a.map((x) => (x === undefined ? null : x));
const DB = { prepare(sql) { const mk = (a) => ({ bind: (...x) => mk(conv(x)), first: async () => s.prepare(sql).get(...a) ?? null, all: async () => ({ results: s.prepare(sql).all(...a) }), run: async () => (s.prepare(sql).run(...a), { success: true }) }); return mk([]); } };

// Cabeçalhos do _headers (o suficiente para testar CSP e permissões como em produção).
const regras = [];
for (const linha of readFileSync(join(SITE, "_headers"), "utf8").split("\n")) {
  if (!linha.trim()) continue;
  if (!/^\s/.test(linha)) regras.push({ padrao: linha.trim(), cab: [] });
  else regras.at(-1).cab.push(linha.trim());
}
function cabecalhos(caminho) {
  const out = new Map();
  for (const r of regras) {
    const re = new RegExp("^" + r.padrao.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
    if (!re.test(caminho)) continue;
    for (const c of r.cab) {
      if (c.startsWith("! ")) { out.delete(c.slice(2).toLowerCase()); continue; }
      const i = c.indexOf(":"); const k = c.slice(0, i).trim().toLowerCase(), v = c.slice(i + 1).trim();
      out.set(k, out.has(k) ? `${out.get(k)}, ${v}` : v);
    }
  }
  return Object.fromEntries(out);
}

const env = {
  SEGREDO, DB,
  ASSETS: {
    async fetch(pedido) {
      let caminho = new URL(pedido.url).pathname;
      if (caminho.endsWith("/")) caminho += "index.html"; else if (!extname(caminho)) caminho += ".html";
      const arquivo = normalize(join(SITE, caminho));
      if (!arquivo.startsWith(SITE)) return new Response("negado", { status: 403 });
      try { return new Response(await readFile(arquivo), { headers: { "content-type": TIPOS[extname(arquivo)] || "application/octet-stream", ...cabecalhos(new URL(pedido.url).pathname) } }); }
      catch { return new Response("não encontrado", { status: 404 }); }
    },
  },
};

http.createServer(async (req, res) => {
  const corpo = ["GET", "HEAD"].includes(req.method) ? undefined : await new Promise((ok) => { const p = []; req.on("data", (c) => p.push(c)); req.on("end", () => ok(Buffer.concat(p))); });
  // Em localhost o cookie Secure funciona no Chrome; a origem é http://localhost:<porta>.
  const r = await worker.fetch(new Request(`http://localhost:${porta}${req.url}`, { method: req.method, headers: req.headers, body: corpo }), env);
  const cab = {};
  r.headers.forEach((v, k) => { cab[k] = v; });
  res.writeHead(r.status, cab);
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(porta, async () => {
  console.log(`Ponto Eletrônico em http://localhost:${porta}`);
  console.log(`instalar: http://localhost:${porta}/app/instalar#${await convite(SEGREDO)}`);
});
