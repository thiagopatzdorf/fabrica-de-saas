// Teste de navegador da tela Treino do Fitrich (ver LEIA-ME.md). Sai com 0 e imprime um resumo em JSON;
// qualquer divergência sai com 1. Capturas em capturas/treino-*.png para OLHAR antes de entregar.
//   NODE_PATH=<node_modules global com playwright> PLAYWRIGHT_BROWSERS_PATH=<pasta dos navegadores> node tests/ui/treino.navegador.mjs
import assert from "node:assert/strict";
import http from "node:http";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FITRICH = path.resolve(AQUI, "..", "..", "app");
const CAPTURAS = path.join(AQUI, "capturas");
mkdirSync(CAPTURAS, { recursive: true });
const TIPOS = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".xml": "application/xml" };
const servidor = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const arq = path.join(FITRICH, path.normalize(p));
  if (!arq.startsWith(FITRICH)) { res.writeHead(403); return res.end(); }
  try { const corpo = await readFile(arq); res.writeHead(200, { "content-type": TIPOS[path.extname(arq)] ?? "application/octet-stream" }); res.end(corpo); } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${servidor.address().port}`;
const resumo = { capturas: [], checagens: 0 };
const navegador = await chromium.launch();
const ok = (c, m) => { assert.ok(c, m); resumo.checagens++; };

async function nova({ largura = 390, altura = 844, tema = "light" } = {}) {
  const contexto = await navegador.newContext({ viewport: { width: largura, height: altura }, colorScheme: tema, locale: "pt-BR" });
  const pagina = await contexto.newPage(), erros = [];
  pagina.on("pageerror", (e) => erros.push(`pageerror: ${e}`));
  pagina.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") erros.push(`${m.type()}: ${m.text()} (${m.location()?.url})`); });
  pagina.on("requestfailed", (r) => { if (r.failure()?.errorText !== "net::ERR_ABORTED") erros.push(`request: ${r.url()} ${r.failure()?.errorText}`); });
  await contexto.addInitScript(() => { try { if (sessionStorage.getItem("teste-iniciado")) return; sessionStorage.setItem("teste-iniciado", "1"); localStorage.clear(); } catch {} });
  return { contexto, pagina, erros };
}
const limparIDB = (pagina) => pagina.evaluate(() => new Promise((res, rej) => { const r = indexedDB.deleteDatabase("fitrich"); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }));
async function invariantes(pagina, rotulo) {
  const r = await pagina.evaluate(() => ({ faltando: globalThis.__fitrich.faltando(), comStyle: [...document.querySelectorAll("[style]")].map((e) => e.outerHTML.slice(0, 80)), estouro: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  assert.deepEqual(r.faltando, [], `${rotulo}: chaves de tradução faltando`);
  assert.deepEqual(r.comStyle, [], `${rotulo}: atributo style no DOM`);
  assert.ok(r.estouro <= 0, `${rotulo}: estouro horizontal de ${r.estouro}px`);
  resumo.checagens += 3;
}
async function captura(pagina, nome) { const arq = path.join(CAPTURAS, `treino-${nome}.png`); await pagina.evaluate(() => window.scrollTo(0, 0)); await pagina.screenshot({ path: arq, fullPage: true, animations: "disabled" }); resumo.capturas.push(path.relative(process.cwd(), arq)); }
async function abrirApp(pagina, caminho = "/") { await pagina.goto(`${base}${caminho}`); await limparIDB(pagina); await pagina.reload(); await pagina.waitForSelector("#vista .hoje", { timeout: 15000 }); }
async function irTreino(pagina, aba) {
  await pagina.evaluate(() => { location.hash = "#/treino"; });
  await pagina.waitForSelector("#vista .tela-treino", { timeout: 15000 });
  await pagina.waitForFunction(() => document.fonts.status === "loaded");
  if (aba) { await pagina.click(`.treino-aba:nth-child(${aba})`); }
}
const exemplo = async (pagina) => { await pagina.click(".vazio-hoje button:has-text('exemplo'), .vazio-hoje button:has-text('sample')"); await pagina.waitForSelector(".heroi .gran"); };

try {
  // ---- 1. Telas com dados de exemplo: 5 abas × 390/1024 × claro/escuro × pt/en. ----
  const ABAS = ["treinar", "rotinas", "progresso", "cardio", "biblioteca"];
  for (const [largura, altura] of [[390, 844], [1024, 900]]) for (const tema of ["light", "dark"]) for (const idioma of ["pt", "en"]) {
    const { contexto, pagina, erros } = await nova({ largura, altura, tema });
    await abrirApp(pagina, idioma === "en" ? "/en/" : "/"); await exemplo(pagina);
    for (let i = 0; i < ABAS.length; i++) {
      await irTreino(pagina, i + 1);
      await pagina.waitForTimeout(150);
      const rotulo = `${ABAS[i]} ${largura} ${tema} ${idioma}`;
      await invariantes(pagina, rotulo);
      if (idioma === "pt" && tema === "light" || (idioma === "en" && largura === 390 && tema === "dark")) await captura(pagina, `${ABAS[i]}-${largura}-${tema}-${idioma}`);
    }
    // Conteúdo esperado do exemplo: platô do supino, convite de semana leve, 3 rotinas, volume > 0.
    await irTreino(pagina, 3);
    ok(await pagina.locator(".treino-platos li").count() === 1, `${idioma}: platô do supino`);
    ok(await pagina.locator(".treino-tabela-vol tbody tr").count() === 11, "11 grupos na tabela de volume");
    await irTreino(pagina, 2); ok(await pagina.locator(".treino-rotina").count() === 3, "3 rotinas do exemplo");
    await irTreino(pagina, 5); ok(await pagina.locator(".treino-bib li").count() === 40, "biblioteca mostra 40 de 92");
    ok(erros.length === 0, `console: ${erros.join(" | ")}`);
    await contexto.close();
  }

  // ---- 2. Fluxo real, 390 claro: programa → sessão ao vivo → série → recorde → concluir → persistência. ----
  {
    const { contexto, pagina, erros } = await nova({ tema: "light" });
    await abrirApp(pagina);
    await irTreino(pagina);
    ok(await pagina.locator(".vazio").count() === 1, "sem rotinas: estado vazio ensina");
    await captura(pagina, "vazio-390-claro");
    await pagina.click("button:has-text('Escolher um programa')");
    await pagina.waitForSelector(".treino-prog");
    await pagina.locator(".treino-prog:has(h3:text-is('ABC')) button").click();
    await pagina.waitForSelector(".treino-rotina");
    ok(await pagina.locator(".treino-rotina").count() === 3, "ABC cria 3 rotinas");
    // Editar: sobe o 2º exercício, troca séries.
    await pagina.locator(".treino-rotina button:has-text('Editar')").first().click();
    await pagina.waitForSelector(".treino-item");
    await pagina.locator(".treino-item").nth(1).locator("button[aria-label^='Subir']").click();
    await pagina.waitForFunction(() => document.querySelector(".treino-item-nome b")?.textContent.includes("Supino inclinado"), null, { timeout: 5000 });
    resumo.checagens++; // mover item muda a ordem
    await captura(pagina, "rotinas-editando-390-claro");
    await pagina.click(".treino-aba:nth-child(1)");
    await pagina.waitForSelector(".treino-hoje-nome");
    await pagina.click("button.grande");
    await pagina.waitForSelector(".treino-ex");
    ok(await pagina.locator(".relogio-parado").count() === 1, "sem série ainda: cronômetro parado");
    // Primeira série (carga, reps e RIR pelos botões), com um toque em +.
    await pagina.locator(".passo-kg .passo-input").fill("80");
    await pagina.locator(".passo-reps .passo-btn:has-text('+')").click();
    await pagina.locator(".escolha .chip:text-is('2')").click();
    await pagina.click("button:has-text('Registrar série')");
    await pagina.waitForSelector(".treino-series li");
    await pagina.waitForSelector(".relogio-tempo");
    const t1 = await pagina.locator(".relogio-tempo").textContent();
    ok(/^\d:\d\d$/.test(t1), `cronômetro corre: ${t1}`);
    await pagina.waitForTimeout(1300);
    const t2 = await pagina.locator(".relogio-tempo").textContent();
    ok(t2 !== t1, `cronômetro andou (${t1} → ${t2})`);
    await invariantes(pagina, "sessão ao vivo 390");
    await captura(pagina, "sessao-390-claro");
    // Tamanho dos alvos tocáveis no formulário da série (≥ 44 px).
    const menor = await pagina.evaluate(() => Math.min(...[...document.querySelectorAll(".treino-form button, .treino-form input:not([type=checkbox]), .relogio button")].map((e) => Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height))));
    ok(menor >= 44, `alvo menor que 44px: ${menor}`);
    // Sessão sobrevive a recarregar a página (gravada no IDB a cada série): offline e sem perder o treino.
    await pagina.reload(); await pagina.waitForSelector("#vista .tela-treino");
    ok(await pagina.locator(".treino-series li").count() === 1, "série sobrevive ao reload");
    ok(await pagina.locator("button:has-text('Concluir treino')").count() === 1, "sessão continua aberta");
    // Segunda série mais pesada no mesmo exercício: o app não acusa recorde sobre a primeira série do dia? (mesmo dia conta como histórico: não há base anterior)
    await pagina.click("button:has-text('Registrar série')");
    await pagina.waitForFunction(() => document.querySelectorAll(".treino-series li").length === 2);
    await pagina.click("button:has-text('Concluir treino')");
    await pagina.waitForSelector("dialog[open]");
    await pagina.locator("dialog .chip:text-is('4')").click();
    await pagina.click("dialog button:has-text('Concluir')");
    await pagina.waitForSelector(".treino-sessoes li");
    const est = await pagina.evaluate(() => { const d = globalThis.__fitrich.estado(); return { sessoes: d.sessoes.map((s) => [s.estado, s.series.length]), treinos: d.treinos.map((t) => [t.tipo, t.esforco]) }; });
    assert.deepEqual(est, { sessoes: [["concluida", 2]], treinos: [["Musculação", 4]] });
    resumo.checagens++;
    await captura(pagina, "pos-sessao-390-claro");
    // Cardio: registra e confere o ritmo.
    await pagina.click(".treino-aba:nth-child(4)");
    await pagina.waitForSelector("#form-cardio");
    await pagina.locator("#form-cardio input[name=cmin]").fill("30");
    await pagina.locator("#form-cardio input[name=ckm]").fill("5");
    await pagina.locator("#form-cardio input[name=cfc]").fill("150");
    await pagina.click("#form-cardio button[type=submit]");
    await pagina.waitForSelector(".treino-cardio-lista li");
    ok((await pagina.locator(".treino-cardio-lista li").first().textContent()).includes("6:00/km"), "ritmo 6:00/km");
    // Zonas aparecem depois de informar a idade.
    if (!(await pagina.locator("#form-fc").isVisible())) await pagina.locator("button:has-text('Idade e frequência cardíaca')").click();
    await pagina.locator("#form-fc input[name=fc-idade]").fill("40");
    await pagina.locator("#form-fc input[name=fc-rep]").fill("60");
    await pagina.click("#form-fc button[type=submit]");
    await pagina.waitForSelector(".treino-zonas table");
    ok((await pagina.locator(".treino-zonas tbody tr").first().textContent()).includes("120–132"), "Z1 120–132 bpm (Karvonen 180/60)");
    await invariantes(pagina, "cardio 390");
    await captura(pagina, "cardio-390-claro");
    ok(erros.length === 0, `console: ${erros.join(" | ")}`);
    await contexto.close();
  }
  console.log(JSON.stringify(resumo, null, 1));
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await navegador.close(); servidor.close();
}
