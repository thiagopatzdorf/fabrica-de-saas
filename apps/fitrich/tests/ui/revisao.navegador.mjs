// Teste de navegador da Revisão da semana, dos insights e do equilíbrio (Playwright + Chromium). Sobe um servidor
// estático (app/ na raiz e tests/ em /tests/), carrega dados reais no IndexedDB e confere, em 390 e 1024 px, claro e
// escuro, pt-BR e en: zero erro de console, zero `style=`, zero estouro horizontal, chaves de tradução completas, contraste
// medido (≥ 4,5:1) dos textos da tela, e os fluxos (dispensar persiste, revisão salva e volta, exportar, equilíbrio).
// Rodar da raiz do repo: NODE_PATH=<node_modules global com playwright> PLAYWRIGHT_BROWSERS_PATH=<pasta dos navegadores> node tests/ui/revisao.navegador.mjs
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
const FITRICH = path.resolve(AQUI, "..", "..", "app"), TESTES = path.resolve(AQUI, "..");
const CAPTURAS = path.join(AQUI, "capturas");
mkdirSync(CAPTURAS, { recursive: true });
const TIPOS = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".xml": "application/xml" };

const servidor = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  // /tests/ serve a pasta de testes; /app/ é o apelido que os módulos de exemplo usam nos imports relativos (../../app/...).
  const raizes = p.startsWith("/tests/") ? [[TESTES, p.slice("/tests".length)]] : p.startsWith("/app/") ? [[FITRICH, p.slice("/app".length)]] : [[FITRICH, p]];
  for (const [raiz, rel] of raizes) {
    const arq = path.join(raiz, path.normalize(rel));
    if (!arq.startsWith(raiz)) break;
    try { const corpo = await readFile(arq); res.writeHead(200, { "content-type": TIPOS[path.extname(arq)] ?? "application/octet-stream" }); return res.end(corpo); } catch { /* 404 abaixo */ }
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${servidor.address().port}`;
const navegador = await chromium.launch();
const resumo = { capturas: [], contraste: {} };

const hojeLocal = () => { const a = new Date(); return `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, "0")}-${String(a.getDate()).padStart(2, "0")}`; };

async function nova({ largura, tema, idioma }) {
  const contexto = await navegador.newContext({ viewport: { width: largura, height: 900 }, colorScheme: tema, locale: idioma === "en" ? "en-US" : "pt-BR", acceptDownloads: true });
  const pagina = await contexto.newPage();
  const erros = [];
  pagina.on("pageerror", (e) => erros.push(`pageerror: ${e}`));
  pagina.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") erros.push(`${m.type()}: ${m.text()} (${m.location()?.url})`); });
  pagina.on("requestfailed", (r) => { if (r.failure()?.errorText !== "net::ERR_ABORTED") erros.push(`request: ${r.url()} ${r.failure()?.errorText}`); });
  await contexto.addInitScript(() => { try { if (sessionStorage.getItem("ini")) return; sessionStorage.setItem("ini", "1"); localStorage.clear(); } catch {} });
  return { contexto, pagina, erros };
}
const limparIDB = (pagina) => pagina.evaluate(() => new Promise((res, rej) => { const r = indexedDB.deleteDatabase("fitrich"); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }));
async function pronta(pagina, seletor = "#vista .hoje") { await pagina.waitForSelector(seletor, { timeout: 15000 }); await pagina.waitForFunction(() => document.fonts.status === "loaded"); }

// Dados reais (não o modo exemplo, que não grava): o documento de teste dos outros agentes, ancorado no dia de hoje.
async function semear(pagina, hoje) {
  await pagina.evaluate(async (h) => {
    const { dadosExemplo } = await import("/tests/ui/dados-exemplo-patrimonio.mjs");
    const d = dadosExemplo({ hoje: h });
    await globalThis.__fitrich.mudar(() => d);
  }, hoje);
}
async function invariantes(pagina, rotulo) {
  const r = await pagina.evaluate(() => ({ faltando: globalThis.__fitrich.faltando(), comStyle: [...document.querySelectorAll("[style]")].map((e) => e.outerHTML.slice(0, 90)), estouro: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  assert.deepEqual(r.faltando, [], `${rotulo}: chaves de tradução faltando`);
  assert.deepEqual(r.comStyle.filter((s) => !/^<(svg|rect|progress)/.test(s)), [], `${rotulo}: atributo style no DOM`);
  assert.ok(r.estouro <= 0, `${rotulo}: estouro horizontal de ${r.estouro}px`);
}
async function captura(pagina, nome) { const arq = path.join(CAPTURAS, `revisao-${nome}.png`); await pagina.evaluate(() => window.scrollTo(0, 0)); await pagina.screenshot({ path: arq, fullPage: true, animations: "disabled" }); resumo.capturas.push(path.relative(process.cwd(), arq)); }

// Contraste medido: razão WCAG entre a cor do texto e o fundo efetivo (primeiro ancestral com fundo opaco) de cada nó de
// texto dentro de `raiz`. Devolve os piores casos abaixo de 4,5:1 (3:1 para texto grande ≥ 24 px ou ≥ 18,66 px em negrito).
const contraste = (pagina, raiz) => pagina.evaluate((sel) => {
  const rgba = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) { const cv = document.createElement("canvas").getContext("2d"); cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); const [r, g, b, a] = cv.getImageData(0, 0, 1, 1).data; return [r, g, b, a / 255]; } const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const misturar = (topo, fundo) => [0, 1, 2].map((i) => topo[i] * topo[3] + fundo[i] * (1 - topo[3]));
  const fundoDe = (el) => { const pilha = []; for (let e = el; e; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3] > 0) { pilha.push(c); if (c[3] >= 1) break; } } let base = [255, 255, 255]; if (getComputedStyle(document.documentElement).colorScheme.includes("dark") || matchMedia("(prefers-color-scheme: dark)").matches) base = rgba(getComputedStyle(document.body).backgroundColor).slice(0, 3); for (const c of pilha.reverse()) base = misturar(c, base); return base; };
  const ruins = [];
  const nos = document.createTreeWalker(document.querySelector(sel), NodeFilter.SHOW_TEXT);
  const vistos = new Set();
  for (let n = nos.nextNode(); n; n = nos.nextNode()) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (vistos.has(el) || el.closest("[hidden]") || getComputedStyle(el).visibility === "hidden" || !el.getClientRects().length) continue;
    vistos.add(el);
    const cs = getComputedStyle(el), fg = rgba(cs.color), bg = fundoDe(el), cor = misturar(fg, bg);
    const l1 = lum(cor), l2 = lum(bg), r = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const px = parseFloat(cs.fontSize), grande = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
    if (r < (grande ? 3 : 4.5)) ruins.push({ texto: n.textContent.trim().slice(0, 40), razao: Math.round(r * 100) / 100, classe: el.className });
  }
  return ruins;
}, raiz);

try {
  const hoje = hojeLocal();
  for (const cfg of [{ largura: 390, tema: "light", idioma: "pt-BR" }, { largura: 390, tema: "dark", idioma: "en" }, { largura: 1024, tema: "light", idioma: "pt-BR" }, { largura: 1024, tema: "dark", idioma: "en" }]) {
    const rotulo = `${cfg.largura}-${cfg.tema}-${cfg.idioma}`, prefixo = cfg.idioma === "en" ? "/en/" : "/";
    const { contexto, pagina, erros } = await nova(cfg);
    await pagina.goto(`${base}${prefixo}`); await limparIDB(pagina); await pagina.reload(); await pronta(pagina);
    await semear(pagina, hoje);
    await pagina.reload(); await pronta(pagina);

    // ---- Hoje: cartão "Para olhar hoje" ----
    await pagina.waitForSelector(".olhar-hoje li.insight", { timeout: 10000 });
    const n = await pagina.locator(".olhar-hoje li.insight").count();
    assert.ok(n >= 1 && n <= 3, `${rotulo}: cartão com ${n} insights (máximo 3)`);
    for (const li of await pagina.locator(".olhar-hoje li.insight").all()) {
      assert.match(await li.locator(".insight-passo").textContent(), cfg.idioma === "en" ? /Next step/ : /Próximo passo/, "todo insight tem UM próximo passo");
      assert.ok((await li.locator(".insight-dispensar").getAttribute("aria-label")).length > 10, "botão de dispensar com nome acessível");
    }
    await invariantes(pagina, `${rotulo} hoje`);
    assert.deepEqual(await contraste(pagina, ".olhar-hoje"), [], `${rotulo}: contraste do cartão`);
    await captura(pagina, `hoje-${rotulo}`);

    // ---- Tela Revisão ----
    await pagina.goto(`${base}${prefixo}#/revisao`); await pronta(pagina, ".tela-revisao .semana-nav");
    await pagina.click("#rev-eq");
    await pagina.waitForSelector(".eixo");
    assert.equal(await pagina.locator(".eixo").count(), 4, `${rotulo}: 4 eixos de equilíbrio`);
    for (const regua of await pagina.locator("svg.regua").all()) assert.equal(await regua.getAttribute("role"), "img");
    assert.ok(await pagina.locator(".eixo details table").count() >= 3, `${rotulo}: a conta de cada eixo com dado vem em tabela`);
    await invariantes(pagina, `${rotulo} revisao`);
    const ruins = await contraste(pagina, ".tela-revisao");
    resumo.contraste[rotulo] = ruins;
    assert.deepEqual(ruins, [], `${rotulo}: contraste da tela Revisão`);
    await captura(pagina, `tela-${rotulo}`);
    assert.deepEqual(erros, [], `${rotulo}: erros de console`);
    await contexto.close();
  }

  // ---- Fluxos (390, claro, pt-BR) ----
  {
    const { contexto, pagina, erros } = await nova({ largura: 390, tema: "light", idioma: "pt-BR" });
    await pagina.goto(`${base}/`); await limparIDB(pagina); await pagina.reload(); await pronta(pagina);
    await semear(pagina, hoje); await pagina.reload(); await pronta(pagina);
    await pagina.waitForSelector(".olhar-hoje li.insight");

    // Dispensar persiste: some do cartão, fica no IDB e não volta depois de recarregar.
    const antes = await pagina.locator(".olhar-hoje li.insight").evaluateAll((els) => els.map((e) => e.dataset.chave));
    await pagina.locator(".olhar-hoje li.insight .insight-dispensar").first().click();
    await pagina.waitForFunction((c) => !document.querySelector(`.olhar-hoje li[data-chave="${CSS.escape(c)}"]`), antes[0]);
    const guardado = await pagina.evaluate(() => globalThis.__fitrich.estado().perfil.insightsDispensados);
    assert.deepEqual(guardado, [antes[0]]);
    await pagina.reload(); await pronta(pagina); await pagina.waitForSelector(".olhar-hoje");
    const depois = await pagina.locator(".olhar-hoje li.insight").evaluateAll((els) => els.map((e) => e.dataset.chave));
    assert.ok(!depois.includes(antes[0]), "o dispensado não voltou depois do reload");

    // Revisão: adotar sugestão, escrever, salvar, recarregar e achar tudo.
    await pagina.goto(`${base}/#/revisao`); await pronta(pagina, ".tela-revisao .semana-nav");
    const inicio = await pagina.evaluate(async () => { const { semanaDaRevisao } = await import("/js/v2/insights/revisao.mjs"); const { hojeISO } = await import("/js/datas.mjs"); return semanaDaRevisao(hojeISO()).inicio; });
    await pagina.locator(".sugestoes button").first().click();
    const primeira = await pagina.inputValue("#rev-vit-0");
    assert.ok(primeira.length > 5, "sugestão adotada na 1ª vitória");
    await pagina.fill("#rev-vit-1", "Fiz a feira com lista");
    await pagina.fill("#rev-ajuste", "Dormir antes das 23h");
    await pagina.fill("#rev-intencao", "Treinar terça e quinta");
    await pagina.click("#rev-salvar");
    await pagina.waitForFunction((i) => globalThis.__fitrich.estado().perfil.revisoes?.[i]?.intencao === "Treinar terça e quinta", inicio);
    await pagina.waitForSelector(".sec-rev-escrita [role=status]");
    await pagina.reload(); await pronta(pagina, ".tela-revisao .semana-nav");
    assert.equal(await pagina.inputValue("#rev-vit-1"), "Fiz a feira com lista");
    assert.equal(await pagina.inputValue("#rev-vit-0"), primeira);
    assert.equal(await pagina.inputValue("#rev-ajuste"), "Dormir antes das 23h");
    // Exportar: o arquivo sai com o que foi escrito.
    const [download] = await Promise.all([pagina.waitForEvent("download"), pagina.click("button:has-text('Baixar em texto')")]);
    assert.match(download.suggestedFilename(), /^revisao-\d{4}-\d{2}-\d{2}\.md$/);
    const texto = await readFile(await download.path(), "utf8");
    for (const trecho of ["Fiz a feira com lista", "Dormir antes das 23h", "Treinar terça e quinta", "## Dinheiro", "## Corpo"]) assert.ok(texto.includes(trecho), `export sem "${trecho}"`);

    // Navegar entre semanas: a anterior vem vazia, a seguinte volta a habilitar.
    const rotuloAntes = await pagina.locator(".semana-rotulo").textContent();
    await pagina.click("#rev-ant");
    assert.notEqual(await pagina.locator(".semana-rotulo").textContent(), rotuloAntes);
    assert.equal(await pagina.inputValue("#rev-intencao"), "", "outra semana, outra revisão");
    await pagina.click("#rev-seg");
    assert.equal(await pagina.locator(".semana-rotulo").textContent(), rotuloAntes);
    assert.equal(await pagina.inputValue("#rev-intencao"), "Treinar terça e quinta");
    // Restaurar dispensados
    await pagina.click("#rev-restaurar");
    await pagina.waitForFunction(() => globalThis.__fitrich.estado().perfil.insightsDispensados.length === 0);
    // Teclado: a ordem natural chega ao botão salvar sem armadilha de foco
    await pagina.focus("#rev-intencao"); await pagina.keyboard.press("Tab");
    assert.ok(await pagina.evaluate(() => document.activeElement?.tagName === "BUTTON"), "Tab sai do último campo para um botão");
    await invariantes(pagina, "fluxos revisão");
    assert.deepEqual(erros, []);
    await contexto.close();
  }
  console.log(JSON.stringify(resumo, null, 1));
  console.log("revisao.navegador: OK");
} finally {
  await navegador.close();
  servidor.close();
}
