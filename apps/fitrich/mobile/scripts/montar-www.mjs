// Monta `www/` (o webDir do Capacitor) a partir do app web publicado (app/), SEM editar a
// fonte: copia, tira o que só faz sentido no site e ajusta o que o servidor local do WebView trata diferente.
// Cada ajuste é verificado (se o padrão não existir mais, o script FALHA em vez de empacotar um app torto).
//
//   node mobile/scripts/montar-www.mjs [--csp] [--saida <pasta>]
//
// Fora do pacote nativo: `_headers` (configuração de CDN), `sw.js` (o app inteiro já vai dentro do
// pacote; o WKWebView do iOS nem suporta service worker), robots/sitemap/404/screenshots/*.md (são do site).
// Ajustes: (1) o servidor local do Capacitor serve `/en/` como a página inicial (SPA), então os links para
// pasta viram arquivo (`/en/index.html`); (2) `--csp` injeta a CSP do `_headers` como <meta>, para o pacote
// também provar "nada sai do aparelho" (desligada por padrão: confira no aparelho que a ponte do Capacitor
// continua funcionando antes de ligar; ver docs/app-nativo.md).
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FONTE = path.resolve(AQUI, "..", "..", "app");

const FORA = new Set(["_headers", "sw.js", "robots.txt", "sitemap.xml", "404.html", "screenshots"]);
const TROCAS = [
  // [arquivo, de, para, mínimo esperado de ocorrências]
  ["index.html", 'href="/en/"', 'href="/en/index.html"', 1],       // seletor de idioma
  ["en/index.html", 'href="/en/"', 'href="/en/index.html"', 2],
  ["js/tema.js", '"/en/"', '"/en/index.html"', 1],                 // redirecionamento pelo idioma guardado
  ["js/tema.js", '"/"', '"/index.html"', 1],
  ["js/app.mjs", '"/en/privacy/"', '"/en/privacy/index.html"', 1],
  ["js/app.mjs", '"/privacidade/"', '"/privacidade/index.html"', 1],
];

export function montar({ saida, csp = false, fonte = FONTE } = {}) {
  rmSync(saida, { recursive: true, force: true });
  mkdirSync(saida, { recursive: true });
  cpSync(fonte, saida, {
    recursive: true,
    filter: (origem) => {
      const rel = path.relative(fonte, origem);
      return !(FORA.has(rel.split(path.sep)[0]) && rel !== "") && !rel.endsWith(".md");
    },
  });
  const feitas = [];
  for (const [arq, de, para, minimo] of TROCAS) {
    const alvo = path.join(saida, arq);
    const texto = readFileSync(alvo, "utf8");
    const n = texto.split(de).length - 1;
    if (n < minimo) throw new Error(`montar-www: ${arq} não tem ${minimo}x ${de} (achei ${n}); o app web mudou, ajuste TROCAS`);
    writeFileSync(alvo, texto.split(de).join(para));
    feitas.push(`${arq}: ${n}x ${de}`);
  }
  if (csp) {
    const regra = readFileSync(path.join(fonte, "_headers"), "utf8").split("\n").find((l) => l.trim().startsWith("Content-Security-Policy:"));
    // frame-ancestors não vale em <meta>; o resto da política é a mesma do site.
    const politica = regra.trim().slice("Content-Security-Policy:".length).trim().split(";").map((d) => d.trim()).filter((d) => d && !d.startsWith("frame-ancestors")).join("; ");
    for (const pagina of ["index.html", "en/index.html"]) {
      const alvo = path.join(saida, pagina);
      const texto = readFileSync(alvo, "utf8");
      if (!texto.includes('<meta charset="utf-8">')) throw new Error(`montar-www: ${pagina} sem <meta charset>`);
      writeFileSync(alvo, texto.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${politica}">`));
    }
    feitas.push("CSP injetada como <meta>");
  }
  return { saida, feitas, arquivos: contar(saida) };
}

function contar(pasta) {
  let n = 0;
  for (const e of readdirSync(pasta)) { const p = path.join(pasta, e); n += statSync(p).isDirectory() ? contar(p) : 1; }
  return n;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--saida");
  const saida = i > 0 ? path.resolve(process.argv[i + 1]) : path.resolve(AQUI, "..", "www");
  if (!existsSync(FONTE)) throw new Error(`fonte não encontrada: ${FONTE}`);
  const r = montar({ saida, csp: process.argv.includes("--csp") });
  console.log(`www pronto em ${path.relative(process.cwd(), r.saida) || "."}: ${r.arquivos} arquivos`);
  for (const f of r.feitas) console.log("  ajuste", f);
}
