// Teste de navegador da tela Corpo e recuperação (Playwright; fora do `node --test` de propósito). Sobe um servidor estático da
// pasta app/, semeia dados pelo próprio app e confere: zero erro de console, zero `style=`, zero estouro horizontal,
// chaves de tradução, os fluxos (dia, água, peso, medidas, foto, comparação, relatório, check-in) e capturas para OLHAR.
// Rodar (da raiz): NODE_PATH=<node_modules global com playwright> PLAYWRIGHT_BROWSERS_PATH=<pasta dos navegadores> node tests/ui/corpo.navegador.mjs
import assert from "node:assert/strict";
import http from "node:http";
import { mkdirSync, readFileSync } from "node:fs";
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
const TIPOS = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const servidor = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const arq = path.join(FITRICH, path.normalize(p));
  if (!arq.startsWith(FITRICH)) { res.writeHead(403); return res.end(); }
  try { const corpo = await readFile(arq); res.writeHead(200, { "content-type": TIPOS[path.extname(arq)] ?? "application/octet-stream" }); res.end(corpo); } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${servidor.address().port}`;
const navegador = await chromium.launch();
const resumo = { capturas: [] };

// PNG 1x1 válido ampliado pelo navegador: o `reduzirImagem` real roda (createImageBitmap + canvas).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function nova({ largura, tema, en }) {
  const contexto = await navegador.newContext({ viewport: { width: largura, height: 900 }, colorScheme: tema, locale: en ? "en-US" : "pt-BR", acceptDownloads: true });
  const pagina = await contexto.newPage();
  const erros = [];
  pagina.on("pageerror", (e) => erros.push(`pageerror: ${e}`));
  pagina.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") erros.push(`${m.type()}: ${m.text()} (${m.location()?.url})`); });
  pagina.on("requestfailed", (r) => { if (r.failure()?.errorText !== "net::ERR_ABORTED") erros.push(`request: ${r.url()} ${r.failure()?.errorText}`); });
  await contexto.addInitScript(() => { try { if (sessionStorage.getItem("ini")) return; sessionStorage.setItem("ini", "1"); localStorage.clear(); } catch { /* sem storage */ } });
  return { contexto, pagina, erros };
}
const limparBancos = (pagina) => pagina.evaluate(() => Promise.all(["fitrich", "fitrich-fotos"].map((n) => new Promise((res) => { const r = indexedDB.deleteDatabase(n); r.onsuccess = r.onerror = r.onblocked = () => res(); }))));
async function invariantes(pagina, rotulo) {
  const r = await pagina.evaluate(() => ({ faltando: globalThis.__fitrich.faltando(), comStyle: [...document.querySelectorAll("[style]")].map((e) => e.outerHTML.slice(0, 80)), estouro: document.documentElement.scrollWidth - document.documentElement.clientWidth, semRotulo: [...document.querySelectorAll(".tela-corpo input, .tela-corpo select")].filter((i) => i.type !== "hidden" && !i.labels?.length && !i.getAttribute("aria-label")).length }));
  assert.deepEqual(r.faltando, [], `${rotulo}: chaves de tradução faltando`);
  assert.deepEqual(r.comStyle, [], `${rotulo}: atributo style no DOM`);
  assert.ok(r.estouro <= 0, `${rotulo}: estouro horizontal de ${r.estouro}px`);
  assert.equal(r.semRotulo, 0, `${rotulo}: campo sem rótulo`);
}
async function captura(pagina, nome) { const arq = path.join(CAPTURAS, `corpo-${nome}.png`); await pagina.evaluate(() => window.scrollTo(0, 0)); await pagina.screenshot({ path: arq, fullPage: true, animations: "disabled" }); resumo.capturas.push(arq); }

// Semeia 40 dias de peso, 14 noites, treinos, medidas e perfil, tudo pelo `mudar` do app (esquema validado).
async function semear(pagina) {
  await pagina.evaluate(async () => {
    const { adicionar, definir } = await import("/js/v2/esquema.mjs");
    const { salvarBemestar } = await import("/js/v2/corpo/bemestar.mjs");
    const iso = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
    const base = hojeLocal(), somar = (n) => new Date(Date.parse(`${base}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
    void iso;
    await globalThis.__fitrich.mudar((d) => {
      let x = definir(d, "perfil", { sexo: "m", alturaCm: 178, nascimento: "1990-03-10" });
      for (let i = 40; i >= 0; i -= 2) x = adicionar(x, "pesos", { data: somar(-i), kg: Math.round((84 - (40 - i) * 0.05 + Math.sin(i) * 0.5) * 10) / 10 });
      x = adicionar(x, "metas", { nome: "Peso", tipo: "peso", alvo: 80 });
      x = adicionar(x, "medidas", { data: somar(-3), cinturaCm: 88, pescocoCm: 38, quadrilCm: 100 });
      for (let i = 0; i < 14; i++) { x = salvarBemestar(x, somar(-i), { sonoHoras: 6.5 + ((i * 7) % 5) * 0.4, sonoQualidade: 1 + (i % 5), dormiuMin: 1380 + ((i * 13) % 50), acordouMin: 400 + ((i * 11) % 40), ...(i < 10 ? { energia: 1 + ((i + 2) % 5), dor: 1 + (i % 3), aguaMl: 1600 + i * 80 } : {}) }, {}); }
      for (const [i, esf] of [[22, 3], [15, 3], [8, 4], [2, 5], [0, 4]]) x = adicionar(x, "treinos", { data: somar(-i), tipo: "Musculação", minutos: 55, esforco: esf });
      return x;
    });
  });
}
const abrir = async (pagina, hashDestino) => { await pagina.evaluate((h) => { location.hash = h; }, hashDestino); await pagina.waitForSelector(".tela-corpo .cartao", { timeout: 15000 }); await pagina.waitForFunction(() => document.fonts.status === "loaded"); };

try {
  for (const cfg of [{ largura: 390, tema: "light", en: false }, { largura: 390, tema: "dark", en: true }, { largura: 1024, tema: "light", en: true }, { largura: 1024, tema: "dark", en: false }]) {
    const rotulo = `${cfg.largura} ${cfg.tema} ${cfg.en ? "en" : "pt"}`;
    const { contexto, pagina, erros } = await nova(cfg);
    await pagina.goto(`${base}/${cfg.en ? "en/" : ""}`); await limparBancos(pagina); await pagina.reload();
    await pagina.waitForFunction(() => globalThis.__fitrich?.estado);
    await pagina.waitForSelector("#vista", { timeout: 15000 });

    // Vazio: a tela abre e ensina, sem erro.
    await abrir(pagina, "#/corpo");
    await invariantes(pagina, `vazio ${rotulo}`);
    await captura(pagina, `vazio-${rotulo.replace(/ /g, "-")}`);

    // Com dados.
    await semear(pagina);
    await pagina.evaluate(() => { location.hash = "#/hoje"; }); await abrir(pagina, "#/corpo");
    await pagina.waitForSelector(".sec-rec .st-rec");
    const indice = await pagina.locator(".st-rec .st-val").textContent();
    assert.match(indice, /^\d+ \/ 100$/, `${rotulo}: índice ${indice}`);
    assert.ok(await pagina.locator(".sec-rec table tbody tr").count() === 4, "a conta do índice mostra os 4 termos");
    assert.ok(await pagina.locator(".sec-peso svg.grafico").count() === 1 && await pagina.locator(".sec-sono svg.grafico").count() === 1, "gráficos de peso e sono");
    assert.ok(await pagina.locator(".sec-peso details table").count() >= 1, "tabela-irmã do peso");
    assert.ok(await pagina.locator(".sec-comp .st").count() === 6, "seis índices de composição");
    await invariantes(pagina, `dados ${rotulo}`);
    await captura(pagina, `dados-${rotulo.replace(/ /g, "-")}`);

    if (cfg.largura === 390 && !cfg.en && cfg.tema === "light") {
      // Água: botão soma e desfaz.
      const antes = await pagina.evaluate(() => globalThis.__fitrich.estado().bemestar.find((b) => b.aguaMl != null && b.data === [...globalThis.__fitrich.estado().bemestar].sort((a, c) => (a.data < c.data ? 1 : -1))[0].data)?.aguaMl ?? 0);
      await pagina.click(".sec-agua button:has-text('+ 300')");
      await pagina.waitForFunction((a) => globalThis.__fitrich.estado().bemestar.some((b) => b.aguaMl === a + 300), antes);
      await pagina.click(".sec-agua button:has-text('Desfazer')");
      await pagina.waitForFunction((a) => !globalThis.__fitrich.estado().bemestar.some((b) => b.aguaMl === a + 300), antes);

      // Registro do dia.
      await pagina.fill("input[name=bhoras]", "7,5");
      await pagina.selectOption("select[name=bener]", "4");
      await pagina.click(".sec-dia button[type=submit]");
      await pagina.waitForFunction(() => globalThis.__fitrich.estado().bemestar.some((b) => b.sonoHoras === 7.5 && b.energia === 4));

      // Peso do dia (edita se já existe) e uma medição.
      await pagina.fill("input[name=wkg]", "83,2");
      await pagina.click(".sec-peso form button[type=submit]");
      await pagina.waitForFunction(() => globalThis.__fitrich.estado().pesos.some((p) => p.kg === 83.2));
      await pagina.click(".sec-comp button:has-text('Nova medição')");
      await pagina.fill("input[name='m-cinturaCm']", "87");
      await pagina.click("#form-medida-corpo button[type=submit]");
      await pagina.waitForFunction(() => globalThis.__fitrich.estado().medidas.length === 2);

      // Fotos: duas fotos (com datas diferentes), lista e comparação lado a lado. Ficam FORA do documento.
      for (const [data, nota] of [["2026-08-01", "início"], ["2026-10-01", "agora"]]) {
        await pagina.click(".sec-fotos .alternador");
        await pagina.setInputFiles("input[name=fotoarq]", { name: "f.png", mimeType: "image/png", buffer: PNG });
        await pagina.fill("input[name=fotodata]", data); await pagina.fill("input[name=fotonota]", nota);
        await pagina.click("#form-foto button[type=submit]");
        await pagina.waitForFunction((n) => document.querySelectorAll(".fotos-grade li").length === n, nota === "início" ? 1 : 2);
      }
      await pagina.waitForSelector(".foto-lado figure");
      assert.equal(await pagina.locator(".foto-lado img").count(), 2);
      const noDoc = await pagina.evaluate(() => JSON.stringify(globalThis.__fitrich.estado()).includes("blob"));
      assert.equal(noDoc, false, "foto nunca entra no documento do Fitrich");
      const natural = await pagina.evaluate(() => [...document.querySelectorAll(".foto-lado img")].every((i) => i.complete && i.naturalWidth > 0));
      assert.ok(natural, "as imagens carregam (blob:)");
      await invariantes(pagina, "fotos 390");
      await captura(pagina, "fotos-390");
      // Persistem ao recarregar.
      await pagina.reload(); await abrir(pagina, "#/corpo");
      await pagina.waitForFunction(() => document.querySelectorAll(".fotos-grade li").length === 2);

      // Relatório: baixa o HTML e confere o conteúdo.
      const [download] = await Promise.all([pagina.waitForEvent("download"), pagina.click(".sec-rel button:has-text('Baixar')")]);
      const html = readFileSync(await download.path(), "utf8");
      assert.match(html, /^<!doctype html>/); assert.ok(html.includes("Relatório de saúde e recuperação")); assert.ok(!/<script|style=/i.test(html));
      const rel = await contexto.newPage(); await rel.setContent(html);
      assert.ok(await rel.locator("table").count() >= 4); await rel.emulateMedia({ media: "print" }); await rel.pdf({ path: path.join(CAPTURAS, "corpo-relatorio.pdf"), format: "A4" }); await rel.screenshot({ path: path.join(CAPTURAS, "corpo-relatorio.png"), fullPage: true }); await rel.close();

      // Check-in: o passo Corpo grava sono e energia no mesmo registro do dia.
      await pagina.evaluate(() => { location.hash = "#/checkin"; });
      await pagina.waitForSelector(".tela-checkin input[name=csono]");
      await pagina.fill("input[name=csono]", "6,75"); await pagina.selectOption("select[name=cener]", "2");
      await pagina.click(".tela-checkin form button[type=submit]");
      await pagina.waitForFunction(() => globalThis.__fitrich.estado().bemestar.some((b) => b.sonoHoras === 6.75 && b.energia === 2));
      await captura(pagina, "checkin-corpo-390");
    }
    assert.deepEqual(erros, [], `${rotulo}: erros de console`);
    await contexto.close();
  }
  console.log(JSON.stringify(resumo, null, 1));
} finally { await navegador.close(); servidor.close(); }
