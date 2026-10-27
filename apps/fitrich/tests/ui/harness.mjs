// Harness mínimo para montar UMA tela do Fitrich v2 com o `criarCtx` real, enquanto o shell ainda está sendo
// escrito. Servidor estático da pasta `app/` + esta pasta em `/_t/` + a página `/_tela.html?tela=…&idioma=…&tema=…`.
// `mudar` faz o que o shell fará: fn(dados) → valida (`validar`) → guarda em memória → chama `atualizar()`.
// A página expõe `window.__h` (ctx, i18n, estado, montado) para o teste de navegador inspecionar.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const FITRICH = path.resolve(AQUI, "..", "..", "app");
const TIPOS = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".csv": "text/csv", ".ofx": "application/x-ofx" };

const PAGINA = (tela, idioma, tema) => `<!doctype html><html lang="${idioma}"${tema === "dark" ? ' data-gs-theme="dark"' : ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>harness ${tela}</title>
<style>
:root{--sup:#fcfcfb;--sup2:#f3f2ee;--ink:#0b0b0b;--ink2:#52514e;--mud:#6b6a65;--grade:#e1e0d9;--eixo:#c3c2b7;--s1:#2a78d6;--s2:#eb6834;--bom:#0ca30c;--aten:#a86f00;--ruim:#d03b3b;--perigo:#d03b3b;color-scheme:light}
html[data-gs-theme="dark"]{--sup:#1a1a19;--sup2:#232321;--ink:#fff;--ink2:#c3c2b7;--mud:#a3a198;--grade:#2c2c2a;--eixo:#383835;--s1:#3987e5;--s2:#d95926;--bom:#3cc03c;--aten:#fab219;--ruim:#ec835a;--perigo:#ec835a;color-scheme:dark}
*{box-sizing:border-box}html,body{margin:0;background:var(--sup);color:var(--ink)}body{font:400 16px/1.55 Manrope,system-ui,sans-serif;overflow-x:hidden;padding-bottom:40px}
:focus-visible{outline:2px solid var(--s1);outline-offset:3px;border-radius:6px}.w{max-width:880px;margin:0 auto;padding:0 16px}h2{font:600 20px/1.2 Sora,sans-serif;margin:0 0 12px}h3{font:600 15px Sora,sans-serif;margin:16px 0 8px}
</style>
<link rel="stylesheet" href="/css/${tela}.css"></head><body><main class="w" id="app"></main>
<script type="module">
import { criarCtx } from "/js/v2/ui/ctx.mjs";
import { criarI18n } from "/js/v2/ui/i18n.mjs";
import { validar } from "/js/v2/esquema.mjs";
import { dadosExemplo, AGORA, HOJE } from "/_t/dados-exemplo-importar.mjs";
const { tela } = await import("/js/v2/ui/telas/${tela}.mjs");
const dic = (await import(tela.i18n)).default;
const vazios = (await import("/js/v2/ui/vazios.i18n.mjs")).default;
const i18n = criarI18n({ idioma: "${idioma}", dicionarios: [dic, vazios] });
let dados = dadosExemplo();
let n = 0;
const montado = { atual: null };
const ctx = criarCtx({
  estado: () => dados,
  async mudar(fn) {
    const novo = fn(structuredClone(dados));
    const v = validar(novo);
    if (!v.ok) { const e = new Error("esquema: " + v.erros.map((x) => x.codigo).join(",")); e.erros = v.erros; throw e; }
    dados = novo; montado.atual?.atualizar?.();
  },
  i18n, hoje: () => HOJE, agora: () => AGORA, novoId: () => "id-" + (++n), indices: null, navegar: () => {}, dialogo: null,
});
montado.atual = tela.montar(ctx);
document.getElementById("app").append(montado.atual.elemento);
window.__h = { ctx, i18n, tela, montado, get dados() { return dados; }, set dados(d) { dados = d; montado.atual?.atualizar?.(); }, dadosExemplo };
</script></body></html>`;

export async function iniciarServidor() {
  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    try {
      if (url.pathname === "/_tela.html") {
        const tela = url.searchParams.get("tela") ?? "dados", idioma = url.searchParams.get("idioma") ?? "pt-BR", tema = url.searchParams.get("tema") ?? "light";
        if (!/^[a-z]+$/.test(tela) || !["pt-BR", "en"].includes(idioma)) throw new Error("parâmetro inválido");
        res.writeHead(200, { "content-type": TIPOS[".html"] }); return res.end(PAGINA(tela, idioma, tema));
      }
      const base = url.pathname.startsWith("/_t/") ? AQUI : FITRICH;
      // `/_t/dados-exemplo-importar.mjs` importa `../../app/js/...`, que o navegador resolve para `/app/js/...`.
      const rel = url.pathname.startsWith("/_t/") ? url.pathname.slice(4) : url.pathname.replace(/^\/app\//, "/");
      const arq = path.join(base, path.normalize(rel));
      if (!arq.startsWith(base)) throw new Error("fora da pasta");
      const corpo = await readFile(arq);
      res.writeHead(200, { "content-type": TIPOS[path.extname(arq)] ?? "application/octet-stream" });
      res.end(corpo);
    } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  return { servidor, base: `http://127.0.0.1:${servidor.address().port}`, fechar: () => servidor.close() };
}
