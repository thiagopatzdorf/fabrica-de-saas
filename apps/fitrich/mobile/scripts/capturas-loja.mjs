// Gera as capturas de tela do manifest (instalação "rica" do Chrome) e da ficha das lojas, a partir do app
// real em modo exemplo (dados fictícios, nada da pessoa). 780x1688 = 390x844 a 2x; PNG quantizado para caber leve.
//   NODE_PATH=<node_modules global com playwright> PLAYWRIGHT_BROWSERS_PATH=<pasta dos navegadores> node mobile/scripts/capturas-loja.mjs
// Depois: python3 scripts/fitrich_build.py && python3 scripts/fitrich_plataforma.py build
import http from "node:http";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const { chromium } = createRequire(import.meta.url)("playwright");
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "app");
const SAIDA = path.join(RAIZ, "screenshots");
mkdirSync(SAIDA, { recursive: true });
const TIPOS = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
const srv = http.createServer(async (q, r) => {
  let p = decodeURIComponent(new URL(q.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
  try { const b = await readFile(path.join(RAIZ, path.normalize(p))); r.writeHead(200, { "content-type": TIPOS[path.extname(p)] ?? "application/octet-stream" }); r.end(b); } catch { r.writeHead(404); r.end(); }
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${srv.address().port}`;
const nav = await chromium.launch();
const TELAS = [["hoje", "hoje"], ["financas", "financas"], ["metas", "metas"]];
for (const [idioma, prefixo, raiz] of [["pt-BR", "pt", "/"], ["en", "en", "/en/"]]) {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "light", locale: idioma, serviceWorkers: "block" });
  const p = await ctx.newPage();
  await p.goto(base + raiz); await p.waitForFunction(() => globalThis.__fitrich?.tela());
  await p.evaluate(() => globalThis.__fitrich.navegar("exemplo")); await p.waitForTimeout(800);
  for (const [id, nome] of TELAS) {
    await p.evaluate((x) => { location.hash = `#/${x}`; }, id);
    await p.waitForFunction((x) => globalThis.__fitrich.tela() === x, id); await p.waitForTimeout(700);
    await p.evaluate(() => { window.scrollTo(0, 0); document.querySelector("#vista")?.scrollTo?.(0, 0); }); await p.waitForTimeout(200);
    const arq = path.join(SAIDA, `${prefixo}-${nome}.png`);
    await p.screenshot({ path: arq, animations: "disabled" });
    execFileSync("python3", ["-c", "import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert('RGB').quantize(128);im.save(sys.argv[1],optimize=True)", arq]);
  }
  await ctx.close();
}
await nav.close(); srv.close();
