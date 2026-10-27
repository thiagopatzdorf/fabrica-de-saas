// Auditoria de navegador do APP (instalação, offline, atualização, dados). Ver LEIA-ME.md.
//   NODE_PATH=<node_modules global com playwright> PLAYWRIGHT_BROWSERS_PATH=<pasta dos navegadores> node tests/ui/app.navegador.mjs
// Servidor estático com a CSP REAL do `_headers` (a que vai a produção) e contador de pedidos: "offline" aqui é
// `context.setOffline(true)` E zero pedidos novos chegando ao servidor. Sai 0 com um resumo em JSON, 1 se algo falhar.
import assert from "node:assert/strict";
import http from "node:http";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FITRICH = path.resolve(AQUI, "..", "..", "app");
const CAPTURAS = path.join(AQUI, "capturas");
mkdirSync(CAPTURAS, { recursive: true });
const TIPOS = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain" };

// CSP do `_headers`: a 1ª linha é a da página (/*), a 2ª a do /sw.js.
const CSPS = readFileSync(path.join(FITRICH, "_headers"), "utf8").split("\n").filter((l) => l.trim().startsWith("Content-Security-Policy:")).map((l) => l.trim().slice("Content-Security-Policy:".length).trim());
assert.equal(CSPS.length, 2, "_headers: CSP da página e do sw.js");

function servir(raiz) {
  const estado = { pedidos: 0, caminhos: [] };
  const srv = http.createServer(async (req, res) => {
    estado.pedidos++;
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    estado.caminhos.push(p);
    if (p.endsWith("/")) p += "index.html";
    let arq = path.join(raiz, path.normalize(p)), status = 200;
    let corpo;
    try { if (!arq.startsWith(raiz)) throw new Error("fora"); corpo = await readFile(arq); } catch { status = 404; arq = path.join(raiz, "404.html"); corpo = await readFile(arq); }
    res.writeHead(status, { "content-type": TIPOS[path.extname(arq)] ?? "application/octet-stream", "content-security-policy": p === "/sw.js" ? CSPS[1] : CSPS[0], "cache-control": "no-cache" });
    res.end(corpo);
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r({ srv, estado, base: `http://127.0.0.1:${srv.address().port}` })));
}

const resumo = { passos: {}, capturas: [] };
const navegador = await chromium.launch();
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

async function nova({ largura = 390, altura = 844, tema = "light", idioma = "pt-BR", ua, init } = {}) {
  const contexto = await navegador.newContext({ viewport: { width: largura, height: altura }, colorScheme: tema, locale: idioma, userAgent: ua, serviceWorkers: "allow" });
  if (init) await contexto.addInitScript(init);
  const pagina = await contexto.newPage();
  const erros = [], violacoes = [];
  pagina.on("pageerror", (e) => erros.push(`pageerror: ${e}`));
  pagina.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") erros.push(`${m.type()}: ${m.text()} (${m.location()?.url})`); });
  pagina.on("requestfailed", (r) => { if (r.failure()?.errorText !== "net::ERR_ABORTED") erros.push(`request: ${r.url()} ${r.failure()?.errorText}`); });
  await pagina.addInitScript(() => { window.__csp = []; addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)); });
  return { contexto, pagina, erros, violacoes };
}
const pronta = async (p) => { await p.waitForSelector("#vista > *", { timeout: 15000 }); await p.waitForFunction(() => globalThis.__fitrich?.tela()); };
const swAtivo = (p) => p.waitForFunction(() => navigator.serviceWorker.ready.then((r) => Boolean(r.active) && Boolean(navigator.serviceWorker.controller)), null, { timeout: 20000 });
async function lancar(p, valor = "32,50") {
  await p.click("#fab"); await p.waitForSelector("dialog.lancar[open]");
  await p.keyboard.type(valor); await p.click("label.chip:has-text('Mercado')"); await p.click("button.salvar");
  await p.waitForSelector(".feito:not([hidden])");
  await p.keyboard.press("Escape"); await p.waitForSelector("dialog.lancar[open]", { state: "detached" }).catch(() => {});
}
const n = (p) => p.evaluate(() => globalThis.__fitrich.estado().lancamentos.length);
async function invariantes(p, rotulo) {
  const r = await p.evaluate(() => ({ faltando: globalThis.__fitrich.faltando(), comStyle: [...document.querySelectorAll("[style]")].filter((e) => e.getAttribute("style")).map((e) => e.outerHTML.slice(0, 80)), estouro: document.documentElement.scrollWidth - document.documentElement.clientWidth, csp: window.__csp }));
  assert.deepEqual(r.faltando, [], `${rotulo}: chaves de tradução faltando`);
  assert.deepEqual(r.comStyle, [], `${rotulo}: atributo style`);
  assert.ok(r.estouro <= 0, `${rotulo}: estouro horizontal ${r.estouro}px`);
  assert.deepEqual(r.csp, [], `${rotulo}: violação de CSP`);
}
async function captura(p, nome) { await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: path.join(CAPTURAS, `${nome}.png`), fullPage: true, animations: "disabled" }); resumo.capturas.push(nome); }
const passo = async (nome, fn) => { const t0 = Date.now(); await fn(); resumo.passos[nome] = `ok ${Date.now() - t0} ms`; console.error(`ok  ${nome}`); };

const principal = await servir(FITRICH);
const { base } = principal;

try {
  // ---------- 1. offline em TODAS as telas registradas ----------
  await passo("offline: todas as telas, /en/, privacidade e atalho, com o servidor sem receber nenhum pedido", async () => {
    const { contexto, pagina, erros } = await nova();
    await pagina.goto(`${base}/`); await pronta(pagina); await swAtivo(pagina);
    await lancar(pagina);
    const ids = await pagina.evaluate(() => [...document.querySelectorAll("nav.nav-lateral a[data-tela]")].map((a) => a.dataset.tela));
    assert.ok(ids.length >= 12 && ids.includes("aparelho"), `telas: ${ids}`);
    // Pré-cache completo: o SW guardou tudo na 1ª visita, sem a pessoa abrir cada tela.
    const guardados = await pagina.evaluate(async () => { const k = (await caches.keys()).find((x) => x.startsWith("fitrich-") && !x.startsWith("fitrich-rt-")); return (await (await caches.open(k)).keys()).length; });
    assert.ok(guardados >= 100, `pré-cache com ${guardados} arquivos`);
    const antes = principal.estado.pedidos;
    await contexto.setOffline(true);
    for (const id of ids) {
      await pagina.goto(`${base}/?tela=${id}#/${id}`);               // navegação de verdade, com query: o SW responde pelo cache
      await pagina.waitForFunction((x) => globalThis.__fitrich?.tela() === x, id, { timeout: 15000 });
      await pagina.waitForFunction(() => document.querySelector("#vista")?.children.length > 0 && !document.querySelector("#vista .em-breve-tela"));
      const dados = await pagina.evaluate(() => globalThis.__fitrich.estado().lancamentos.length);
      assert.equal(dados, 1, `${id}: dado local presente offline`);
      await invariantes(pagina, `offline ${id}`);
    }
    await pagina.goto(`${base}/en/`); await pronta(pagina);
    assert.equal(await pagina.evaluate(() => document.documentElement.lang), "en");
    await pagina.goto(`${base}/privacidade/`); assert.match(await pagina.title(), /privacidade/i);
    await pagina.goto(`${base}/en/privacy/`); assert.match(await pagina.title(), /privacy/i);
    await pagina.goto(`${base}/#/lancar`); await pagina.waitForSelector("dialog.lancar[open]");   // atalho do ícone, sem rede
    assert.equal(principal.estado.pedidos, antes, "offline: nenhum pedido chegou ao servidor");
    assert.deepEqual(erros.filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e)), [], "console limpo");
    await contexto.close();
  });

  // ---------- 2. instalabilidade (manifest + SW) pelo próprio Chromium ----------
  await passo("instalável: Chromium não aponta erro de instalabilidade e lê o manifest sem erro", async () => {
    const { contexto, pagina } = await nova();
    await pagina.goto(`${base}/`); await pronta(pagina); await swAtivo(pagina);
    const cdp = await contexto.newCDPSession(pagina);
    const m = await cdp.send("Page.getAppManifest");
    assert.deepEqual(m.errors, [], "manifest sem erro");
    const man = JSON.parse(m.data);
    assert.equal(man.display, "standalone"); assert.equal(man.shortcuts.length, 2); assert.ok(man.icons.some((i) => i.purpose === "maskable") && man.icons.some((i) => i.purpose === "monochrome"));
    const inst = await cdp.send("Page.getInstallabilityErrors");
    assert.deepEqual(inst.installabilityErrors, [], "instalabilidade");
    resumo.manifest = { nome: man.name, icones: man.icons.length, atalhos: man.shortcuts.map((s) => s.name), installabilityErrors: inst.installabilityErrors.length };
    await contexto.close();
  });

  // ---------- 3. atualização sem perder dados, limpeza de cache velho ----------
  await passo("atualização: versão nova vira faixa, 'Atualizar' troca o pacote, cache velho some e os dados ficam", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "fitrich-up-"));
    cpSync(FITRICH, tmp, { recursive: true });
    const s2 = await servir(tmp);
    const { contexto, pagina, erros } = await nova();
    await pagina.goto(`${s2.base}/`); await pronta(pagina); await swAtivo(pagina);
    await lancar(pagina, "10,00"); await lancar(pagina, "20,00");
    const v1 = await pagina.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith("fitrich-")).sort());
    assert.equal(v1.filter((k) => !k.startsWith("fitrich-rt-")).length, 1);
    assert.equal(await pagina.locator("#avisos-app .aviso").count(), 0, "sem versão nova, sem faixa");
    // Publica a "versão 2": um arquivo muda e o hash do cache muda (o build faz isso; aqui à mão).
    const sw = readFileSync(path.join(tmp, "sw.js"), "utf8");
    writeFileSync(path.join(tmp, "sw.js"), sw.replace(/const CACHE = "fitrich-[0-9a-f]+"/, 'const CACHE = "fitrich-deadbeef0002"'));
    writeFileSync(path.join(tmp, "css/aparelho.css"), readFileSync(path.join(tmp, "css/aparelho.css"), "utf8") + "\n/* v2 */\n");
    await pagina.evaluate(async () => { (await navigator.serviceWorker.getRegistration()).update(); });
    await pagina.waitForSelector("#avisos-app .aviso button:has-text('Atualizar')", { timeout: 20000 });
    assert.equal(await n(pagina), 2, "faixa apareceu e os dados continuam");
    assert.deepEqual(await pagina.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith("fitrich-") && !k.startsWith("fitrich-rt-")).length), 2, "as duas versões coexistem até o toque");
    assert.match(await pagina.locator("#avisos-app .aviso").textContent(), /Seus dados não mudam/);
    await captura(pagina, "app-02-faixa-atualizar-390");
    await Promise.all([pagina.waitForNavigation({ timeout: 20000 }).catch(() => {}), pagina.click("#avisos-app .aviso button:has-text('Atualizar')")]);
    await pronta(pagina); await swAtivo(pagina);
    await pagina.waitForFunction(async () => { const ks = (await caches.keys()).filter((k) => k.startsWith("fitrich-") && !k.startsWith("fitrich-rt-")); return ks.length === 1 && ks[0] === "fitrich-deadbeef0002"; }, null, { timeout: 15000 });
    assert.equal(await n(pagina), 2, "depois da atualização os dados continuam");
    assert.equal(await pagina.locator("#avisos-app .aviso button:has-text('Atualizar')").count(), 0);
    assert.equal(await pagina.evaluate(async () => (await (await (await caches.open("fitrich-deadbeef0002")).match("/css/aparelho.css")).text()).includes("/* v2 */")), true, "arquivo novo servido pelo pacote novo");
    assert.deepEqual(erros, [], "console limpo");
    await contexto.close(); s2.srv.close(); rmSync(tmp, { recursive: true, force: true });
  });

  // ---------- 4. limpar o cache e desregistrar o SW não toca nos dados ----------
  await passo("dados: limpei o cache e o service worker, os dados continuam e o app volta a ficar offline", async () => {
    const { contexto, pagina, erros } = await nova();
    await pagina.goto(`${base}/`); await pronta(pagina); await swAtivo(pagina);
    await lancar(pagina, "7,00"); await lancar(pagina, "8,00"); await lancar(pagina, "9,00");
    await pagina.evaluate(async () => { for (const k of await caches.keys()) await caches.delete(k); for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); });
    await pagina.reload(); await pronta(pagina);
    assert.equal(await n(pagina), 3, "IndexedDB não depende do cache do service worker");
    await swAtivo(pagina);   // o app registra de novo sozinho
    await contexto.setOffline(true);
    await pagina.reload(); await pronta(pagina);
    assert.equal(await n(pagina), 3, "e volta a abrir offline");
    assert.deepEqual(erros.filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e)), []);
    await contexto.close();
  });

  // ---------- 5. backup cifrado: exportar, apagar tudo, importar ----------
  await passo("backup cifrado: exporta pela tela Dados, apaga o banco, importa com a senha e os dados voltam iguais", async () => {
    const { contexto, pagina, erros } = await nova();
    await pagina.goto(`${base}/#/dados`); await pronta(pagina);
    await lancar(pagina, "11,11"); await lancar(pagina, "22,22");
    await pagina.waitForFunction(() => globalThis.__fitrich.estado().lancamentos.length === 2);
    const antes = await pagina.evaluate(() => JSON.stringify(globalThis.__fitrich.estado().lancamentos.map((l) => [l.id, l.centavos, l.categoriaId]).sort()));
    await pagina.evaluate(() => { location.hash = "#/dados"; });
    await pagina.waitForSelector("#fd-senha", { timeout: 15000 });
    await pagina.fill("#fd-senha", "senha-bem-longa-2026!"); await pagina.fill("#fd-senha2", "senha-bem-longa-2026!");
    const [download] = await Promise.all([pagina.waitForEvent("download", { timeout: 60000 }), (async () => { await pagina.click("button:has-text('Criar backup cifrado')"); await pagina.click("dialog[open] button.fd-primario, dialog[open] button:last-child"); })()]);
    const arq = path.join(os.tmpdir(), "fitrich-backup.enc.json"); await download.saveAs(arq);
    const cab = JSON.parse(readFileSync(arq, "utf8"));
    assert.equal(cab.fmt, "fitrich-enc"); assert.ok(!/centavos|cat-mercado/.test(readFileSync(arq, "utf8")), "arquivo cifrado não deixa o conteúdo legível");
    // apaga tudo (como um aparelho novo) e importa
    await pagina.evaluate(() => new Promise((res, rej) => { const r = indexedDB.deleteDatabase("fitrich"); r.onsuccess = res; r.onerror = rej; r.onblocked = () => {}; }));
    await pagina.evaluate(() => localStorage.clear());
    await pagina.goto(`${base}/#/dados`); await pagina.reload(); await pronta(pagina);
    assert.equal(await n(pagina), 0, "aparelho novo, sem dados");
    await pagina.waitForSelector("#fd-importar", { state: "attached" });
    await pagina.setInputFiles("#fd-importar", arq);
    await pagina.fill("#fd-dlg-senha", "senha-bem-longa-2026!");
    await pagina.click("dialog[open] button.fd-primario, dialog[open] button:last-child");
    await pagina.waitForFunction(() => document.querySelector("dialog[open] table.fd-tabela"), null, { timeout: 60000 });
    await pagina.click("dialog[open] button.fd-primario, dialog[open] button:last-child");
    await pagina.waitForFunction(() => globalThis.__fitrich.estado().lancamentos.length === 2, null, { timeout: 30000 });
    const depois = await pagina.evaluate(() => JSON.stringify(globalThis.__fitrich.estado().lancamentos.map((l) => [l.id, l.centavos, l.categoriaId]).sort()));
    assert.equal(depois, antes, "dados idênticos depois da volta");
    assert.deepEqual(erros, []);
    await contexto.close();
  });

  // ---------- 6. instalar: Android (beforeinstallprompt) e iOS (instrução) ----------
  await passo("instalar no Android: faixa só depois do 1º registro, prompt do navegador abre ao tocar, sumiu ao instalar", async () => {
    const { contexto, pagina, erros } = await nova();
    await pagina.goto(`${base}/`); await pronta(pagina);
    await pagina.evaluate(() => { window.__prompts = 0; const e = new Event("beforeinstallprompt", { cancelable: true }); e.prompt = async () => { window.__prompts++; }; e.userChoice = Promise.resolve({ outcome: "accepted" }); window.dispatchEvent(e); });
    assert.equal(await pagina.locator("#avisos-app .aviso").count(), 0, "sem registro ainda, sem faixa de instalar");
    await lancar(pagina);
    await pagina.waitForSelector("#avisos-app .aviso button:has-text('Instalar')");
    await captura(pagina, "app-03-faixa-instalar-390");
    await invariantes(pagina, "faixa instalar");
    await pagina.click("#avisos-app .aviso button:has-text('Instalar')");
    assert.equal(await pagina.evaluate(() => window.__prompts), 1);
    await pagina.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
    assert.equal(await pagina.locator("#avisos-app .aviso").count(), 0, "instalado: nada de faixa");
    assert.deepEqual(erros, []);
    await contexto.close();
  });
  await passo("instalar no iPhone: instrução 'Compartilhar → Tela de Início', 'Agora não' esconde por 30 dias", async () => {
    const { contexto, pagina } = await nova({ ua: IPHONE });
    await pagina.goto(`${base}/`); await pronta(pagina);
    await lancar(pagina);
    await pagina.waitForSelector("#avisos-app .aviso");
    assert.match(await pagina.locator("#avisos-app .aviso").textContent(), /Compartilhar.*Adicionar à Tela de Início/);
    await captura(pagina, "app-04-faixa-ios-390");
    await pagina.click("#avisos-app .aviso button:has-text('Agora não')");
    assert.equal(await pagina.locator("#avisos-app .aviso").count(), 0);
    await pagina.reload(); await pronta(pagina);
    assert.equal(await pagina.locator("#avisos-app .aviso").count(), 0, "dispensada não volta no próximo carregamento");
    await contexto.close();
  });

  // ---------- 7. armazenamento persistente: aviso honesto ----------
  await passo("persistência: navegador que recusa gera aviso com backup depois de 3 registros; o que concede, nenhum", async () => {
    const recusa = () => { const s = navigator.storage; Object.defineProperty(navigator, "storage", { value: { persisted: async () => false, persist: async () => false, estimate: async () => ({ usage: 2e6, quota: 8e9 }) }, configurable: true }); void s; };
    const concede = () => { Object.defineProperty(navigator, "storage", { value: { persisted: async () => true, persist: async () => true, estimate: async () => ({ usage: 2e6, quota: 8e9 }) }, configurable: true }); };
    for (const [rotulo, init, esperaAviso] of [["recusa", recusa, true], ["concede", concede, false]]) {
      const { contexto, pagina } = await nova({ init });
      await pagina.goto(`${base}/`); await pronta(pagina);
      await lancar(pagina, "1,00"); await lancar(pagina, "2,00");
      assert.equal(await pagina.locator("#avisos-app .aviso").filter({ hasText: "não garantiu" }).count(), 0, "2 registros: ainda não incomoda");
      await lancar(pagina, "3,00");
      await pagina.waitForFunction(() => globalThis.__fitrich.estado().lancamentos.length === 3);
      await pagina.waitForTimeout(600);
      const tem = (await pagina.locator("#avisos-app .aviso").filter({ hasText: "não garantiu" }).count()) > 0;
      assert.equal(tem, esperaAviso, rotulo);
      if (esperaAviso) { await captura(pagina, "app-05-aviso-persistencia-390"); assert.equal(await pagina.locator("#avisos-app a[href='#/dados']").count(), 1); }
      await contexto.close();
    }
  });

  // ---------- 8. casca nativa: sem service worker, com lembrete, háptico e compartilhar ----------
  await passo("casca nativa (Capacitor falso): não registra service worker, háptico ao salvar, lembrete diário agenda e cancela", async () => {
    const init = () => {
      window.__nat = [];
      const reg = (nome, ms) => Object.fromEntries(ms.map((m) => [m, async (a) => { window.__nat.push([nome, m, a]); return m === "requestPermissions" ? { display: "granted" } : m === "getUri" ? { uri: "file:///x" } : {}; }]));
      window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "android", Plugins: { LocalNotifications: reg("LocalNotifications", ["requestPermissions", "schedule", "cancel"]), Haptics: reg("Haptics", ["impact", "notification"]), Filesystem: reg("Filesystem", ["writeFile", "getUri"]), Share: reg("Share", ["share"]) } };
    };
    const { contexto, pagina, erros } = await nova({ init });
    await pagina.goto(`${base}/`); await pronta(pagina);
    await lancar(pagina);
    assert.equal(await pagina.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0, "nativo não registra service worker");
    assert.ok(await pagina.evaluate(() => window.__nat.some((c) => c[0] === "Haptics")), "háptico ao confirmar");
    assert.equal(await pagina.locator("#avisos-app .aviso").filter({ hasText: "Instale" }).count(), 0, "já é app: sem faixa de instalar");
    await pagina.evaluate(() => { location.hash = "#/aparelho"; }); await pagina.waitForSelector(".ap");
    await pagina.click("button:has-text('Ligar lembrete')");
    await pagina.waitForSelector("button:has-text('Desligar lembrete')");
    const sched = await pagina.evaluate(() => window.__nat.find((c) => c[1] === "schedule")[2].notifications[0]);
    assert.deepEqual([sched.schedule.on.hour, sched.schedule.on.minute], [20, 0]);
    await captura(pagina, "app-06-nativo-lembrete-390");
    await invariantes(pagina, "aparelho nativo");
    await pagina.click("button:has-text('Desligar lembrete')");
    assert.ok(await pagina.evaluate(() => window.__nat.some((c) => c[1] === "cancel")));
    // exportar JSON pela tela Dados usa a folha de compartilhar
    await pagina.evaluate(() => { location.hash = "#/dados"; }); await pagina.waitForSelector("button:has-text('Exportar')", { timeout: 15000 }).catch(() => {});
    assert.deepEqual(erros, []);
    await contexto.close();
  });

  // ---------- 9. tela App e aparelho: 390/1024 × claro/escuro × pt/en ----------
  await passo("tela App e aparelho: 390 e 1024 px, claro e escuro, pt-BR e en, sem estouro, style, chave faltando nem erro", async () => {
    for (const largura of [390, 1024]) for (const tema of ["light", "dark"]) for (const idioma of ["pt-BR", "en"]) {
      const { contexto, pagina, erros } = await nova({ largura, altura: largura === 390 ? 844 : 800, tema, idioma });
      await pagina.goto(`${base}${idioma === "en" ? "/en/" : "/"}#/aparelho`); await pronta(pagina); await swAtivo(pagina);
      await pagina.waitForSelector(".ap h2");
      await pagina.waitForFunction(() => /\d+ (arquivos|files)/.test(document.querySelector(".ap").textContent), null, { timeout: 15000 });
      await invariantes(pagina, `aparelho ${largura} ${tema} ${idioma}`);
      assert.deepEqual(erros, [], `console ${largura} ${tema} ${idioma}`);
      await captura(pagina, `app-aparelho-${largura}-${tema === "light" ? "claro" : "escuro"}-${idioma === "en" ? "en" : "pt"}`);
      await contexto.close();
    }
  });

  resumo.ok = true;
} catch (e) {
  resumo.ok = false; resumo.erro = String(e?.stack ?? e).slice(0, 2500);
} finally {
  await navegador.close(); principal.srv.close();
}
console.log(JSON.stringify(resumo, null, 1));
process.exit(resumo.ok ? 0 : 1);
