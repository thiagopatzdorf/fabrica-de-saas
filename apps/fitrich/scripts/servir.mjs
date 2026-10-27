#!/usr/bin/env node
// Servidor estático mínimo para o app (pasta app/), sem dependência. Uso: node scripts/servir.mjs [porta]
// Por que existe: o app é PWA (service worker, módulos ES), e isso não roda abrindo o arquivo com file://.
// Aplica os cabeçalhos do app/_headers (inclusive a CSP com connect-src 'none'), para que um erro de política
// apareça aqui, no console, e não só depois de publicar. Sem rede: escuta em 127.0.0.1.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "app");
const PORTA = Number(process.argv[2] ?? process.env.PORT ?? 8080);
const TIPOS = {
  ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml",
};

// _headers: linha sem recuo = padrão (`*` casa qualquer sufixo); linhas recuadas "Nome: valor" somam; "! Nome" remove.
async function regras() {
  let texto = "";
  try { texto = await readFile(path.join(RAIZ, "_headers"), "utf8"); } catch { return []; }
  const out = [];
  for (const linha of texto.split("\n")) {
    if (!linha.trim() || linha.trim().startsWith("#")) continue;
    if (!/^\s/.test(linha)) { out.push({ padrao: linha.trim(), tirar: [], por: [] }); continue; }
    const item = linha.trim();
    if (item.startsWith("!")) out.at(-1)?.tirar.push(item.slice(1).trim().toLowerCase());
    else if (item.includes(":")) { const i = item.indexOf(":"); out.at(-1)?.por.push([item.slice(0, i).trim().toLowerCase(), item.slice(i + 1).trim()]); }
  }
  return out;
}
const casa = (padrao, caminho) => new RegExp("^" + padrao.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$").test(caminho);
function cabecalhos(lista, caminho) {
  const h = {};
  for (const r of lista) {
    if (!casa(r.padrao, caminho)) continue;
    for (const n of r.tirar) delete h[n];
    for (const [n, v] of r.por) h[n] = h[n] ? `${h[n]}, ${v}` : v;
  }
  return h;
}

const lista = await regras();
http.createServer(async (req, res) => {
  const caminho = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let arquivo = path.join(RAIZ, path.normalize(caminho));
  let status = 200;
  try {
    if (!arquivo.startsWith(RAIZ) || path.basename(arquivo) === "_headers") throw new Error("fora");
    if (caminho.endsWith("/")) arquivo = path.join(arquivo, "index.html");
    const corpo = await readFile(arquivo);
    res.writeHead(status, { "content-type": TIPOS[path.extname(arquivo)] ?? "application/octet-stream", "cache-control": "no-cache", ...cabecalhos(lista, caminho) });
    res.end(corpo);
  } catch {
    status = 404;
    const corpo = await readFile(path.join(RAIZ, "404.html")).catch(() => "não encontrado");
    res.writeHead(status, { "content-type": "text/html; charset=utf-8", ...cabecalhos(lista, caminho) });
    res.end(corpo);
  }
}).listen(PORTA, "127.0.0.1", () => console.log(`Fitrich em http://127.0.0.1:${PORTA}/  (Ctrl+C para parar)`));
