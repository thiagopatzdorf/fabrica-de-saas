// Roteiro do navegador para test_fitrich_csp_chromium.py: abre o Fitrich servido COM a CSP do
// _headers, usa o app v2 (lançar, abrir todas as telas, tema), deixa o app registrar o service worker e roda o cripto no
// Web Worker. Imprime um JSON com o que viu; quem julga é o teste Python.
// Uso: node fitrich_csp_chromium.mjs http://127.0.0.1:PORTA   (NODE_PATH = pasta global com o playwright)
import { createRequire } from "node:module";

// ESM ignora NODE_PATH: resolve o playwright global pela pasta que o teste Python passa.
const { chromium } = createRequire(`${process.env.NODE_PATH || process.cwd()}/`)("playwright");
const base = process.argv[2];
const saida = { violacoes: [], foraDaOrigem: [], errosConsole: [], errosPagina: [] };
const navegador = await chromium.launch();
try {
  const ctx = await navegador.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__csp = [];
    window.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`));
  });
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") saida.errosConsole.push(`${page.url()} :: ${m.text()}`); });
  page.on("pageerror", (e) => saida.errosPagina.push(String(e)));
  page.on("request", (r) => { if (!r.url().startsWith(base)) saida.foraDaOrigem.push(r.url()); });

  const r0 = await page.goto(base + "/", { waitUntil: "load" });
  saida.csp = r0.headers()["content-security-policy"] || null;  // prova de que a página foi servida COM a CSP
  await page.waitForSelector("#vista .hoje", { timeout: 15000 });
  saida.navs = await page.locator("nav.nav-lateral a").count();
  saida.temaInicial = await page.evaluate(() => document.documentElement.getAttribute("data-gs-theme"));
  saida.corpoFundo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  // Lançar uma despesa pelo caminho de 3 toques (FAB -> valor -> categoria -> salvar).
  await page.click("#fab");
  await page.waitForSelector("dialog.lancar[open]");
  await page.keyboard.type("49,90");
  await page.click("label.chip:has-text('Mercado')");
  await page.click("button.salvar");
  await page.waitForSelector(".feito:not([hidden])");
  saida.lancou = await page.evaluate(() => globalThis.__fitrich.estado().lancamentos.length);
  saida.faltando = await page.evaluate(() => globalThis.__fitrich.faltando());
  await page.keyboard.press("Escape");
  await page.waitForSelector("dialog.lancar[open]", { state: "detached" }).catch(() => {});

  // Cada tela registrada abre sob a CSP (css, dicionário e módulo da própria origem) sem violação nem erro.
  const ids = await page.evaluate(() => [...document.querySelectorAll("nav.nav-lateral a[data-tela]")].map((a) => a.dataset.tela));
  saida.telas = {};
  for (const id of ids) {
    await page.evaluate((x) => { location.hash = `#/${x}`; }, id);
    await page.waitForFunction((x) => globalThis.__fitrich.tela() === x, id);
    await page.waitForFunction(() => document.querySelector("#vista")?.children.length > 0);
    saida.telas[id] = await page.evaluate(() => document.querySelector("#vista").children.length);
  }
  saida.graficos = await page.evaluate(async () => { location.hash = "#/financas"; await new Promise((r) => setTimeout(r, 800)); return document.querySelectorAll("svg.grafico").length; });

  // Tema: alterna e persiste.
  await page.click("#tema");
  saida.temaDepois = await page.evaluate(() => document.documentElement.getAttribute("data-gs-theme"));
  saida.temaGuardado = await page.evaluate(() => localStorage.getItem("gs-prisma-theme"));
  saida.metaTema = await page.evaluate(() => document.querySelector('meta[name="theme-color"]').content);
  await page.reload({ waitUntil: "load" });
  saida.temaAposReload = await page.evaluate(() => document.documentElement.getAttribute("data-gs-theme"));

  // Service worker: o próprio app o registra (shell -> plataforma). Espera ficar ativo e controlando a página.
  await page.waitForFunction(() => navigator.serviceWorker.ready.then((r) => Boolean(r.active)), null, { timeout: 20000 });
  saida.sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    const chaves = await caches.keys();
    const c = await caches.open(chaves.find((k) => k.startsWith("fitrich-")) || "x");
    return { escopo: reg.scope, caches: chaves, guardados: (await c.keys()).length, waiting: Boolean(reg.waiting), barra: document.querySelectorAll("#avisos-app .aviso").length };
  });

  // Backup cifrado no Web Worker (worker-src 'self' + WebCrypto do navegador).
  saida.cripto = await page.evaluate(() => new Promise((resolve) => {
    const w = new Worker("/js/v2/cripto.worker.mjs", { type: "module" });
    const t0 = performance.now();
    w.onmessage = (e) => {
      if (e.data.id === 1) w.postMessage({ id: 2, op: "decifrar", arquivo: e.data.resultado, senha: "errada" });
      else if (e.data.id === 2) { resolve({ erroSenhaErrada: e.data.erro, ms: Math.round(performance.now() - t0) }); w.terminate(); }
    };
    w.onerror = (e) => resolve({ erro: e.message });
    w.postMessage({ id: 1, op: "cifrar", texto: '{"a":1}', senha: "certa" });
  }));

  // 404 com a mesma CSP.
  const r404 = await page.goto(base + "/nao-existe", { waitUntil: "load" });
  saida.status404 = r404.status();
  saida.titulo404 = await page.title();

  saida.violacoes = await page.evaluate(() => window.__csp);
} finally {
  await navegador.close();
}
console.log(JSON.stringify(saida));
