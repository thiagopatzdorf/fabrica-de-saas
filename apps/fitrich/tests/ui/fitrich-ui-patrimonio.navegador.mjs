// Teste de navegador das telas Patrimônio, Metas, Dívidas, Shape e Check-in (área B) num Chromium headless
// (Playwright) sobre o harness: 390 e 1024 px, claro e escuro, pt-BR e en. Em cada combinação: sem erro de
// console, sem estouro horizontal, `i18n.faltando()` vazio, nenhum atributo `style=` no DOM, todo gráfico com
// <title>/<desc>, todo input com <label>, alvos de clique ≥ 44 px. Depois: o check-in de ponta a ponta grava
// peso, treino, categoria e saldos; Patrimônio grava snapshot; Metas/Dívidas criam e apagam itens.
//
// Fora do `node --test` de propósito (precisa de Playwright e Chromium). Rodar:
//   NODE_PATH=<node_modules global com playwright> PLAYWRIGHT_BROWSERS_PATH=<pasta dos browsers> \
//     node tests/ui/fitrich-ui-patrimonio.navegador.mjs [pasta-das-capturas]
import assert from "node:assert/strict";
import http from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(process.env.NODE_PATH ? path.join(process.env.NODE_PATH, "/") : import.meta.url);
const { chromium } = require("playwright");
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FITRICH = path.resolve(AQUI, "..", "..", "app"), TESTS = path.resolve(AQUI, "..");
const CAPTURAS = process.argv[2] ?? null;
const TIPOS = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml" };
const TELAS = ["patrimonio", "metas", "dividas", "shape", "checkin"];

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    // /tests/* → pasta tests; /app/* (imports relativos de tests/ui/) e o resto → pasta fitrich.
    const raiz = url.pathname.startsWith("/tests/") ? TESTS : FITRICH;
    const arq = path.join(raiz, path.normalize(url.pathname.replace(/^\/tests\//, "/").replace(/^\/app\//, "/")));
    if (!arq.startsWith(raiz)) throw new Error("fora da pasta");
    const corpo = await readFile(arq); // lê ANTES de responder: um 404 depois de um 200 derrubava o servidor
    res.writeHead(200, { "content-type": TIPOS[path.extname(arq)] ?? "application/octet-stream" });
    res.end(corpo);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${servidor.address().port}`;
if (CAPTURAS) await mkdir(CAPTURAS, { recursive: true });

const navegador = await chromium.launch();
const problemas = [], resumo = [];
async function abrir(ctxN, params) {
  const pagina = await ctxN.newPage();
  const erros = [];
  pagina.on("pageerror", (e) => erros.push(`pageerror: ${e}`));
  pagina.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") erros.push(`console.${m.type()}: ${m.text()}`); });
  await pagina.goto(`${base}/tests/ui/harness-patrimonio.html?${new URLSearchParams(params)}`);
  try { await pagina.waitForFunction(() => window.harness && document.querySelector("#vista > *"), null, { timeout: 8000 }); }
  catch (e) { throw new Error(`a tela não montou (${JSON.stringify(params)}): ${erros.join(" | ") || e.message}`); }
  return { pagina, erros };
}
// Checagens estruturais que valem para toda tela em toda combinação.
async function conferir(pagina, rotulo, erros) {
  const r = await pagina.evaluate(() => {
    const doc = document;
    const comStyle = [...doc.querySelectorAll("[style]")].map((e) => e.outerHTML.slice(0, 80));
    const estouro = doc.documentElement.scrollWidth - doc.documentElement.clientWidth;
    const graficos = [...doc.querySelectorAll("svg.grafico")].map((s) => ({ title: Boolean(s.querySelector("title")), desc: Boolean(s.querySelector("desc")) }));
    const semLabel = [...doc.querySelectorAll("input:not([type=hidden]),select,textarea")].filter((i) => !(i.labels && i.labels.length) && !i.getAttribute("aria-label")).map((i) => i.name || i.id);
    // Checkbox: o alvo é o <label> inteiro (WCAG 2.5.8 aceita o rótulo como parte do alvo).
    const alvo = (e) => (e.type === "checkbox" && e.labels?.[0] ? e.labels[0] : e);
    const pequenos = [...doc.querySelectorAll("button,a,input,select,summary")].filter((e) => { if (e.closest("[hidden]") || e.hidden) return false; const b = alvo(e).getBoundingClientRect(); return b.width > 0 && b.height > 0 && (b.height < 44 || b.width < 44); }).map((e) => `${e.tagName.toLowerCase()}:${(e.textContent || e.name || "").trim().slice(0, 30)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
    const inline = doc.querySelectorAll("style, script:not([src])").length;
    const palavrasProibidas = /estourou|falhou|perdeu a sequ|sequência|streak|atrasado|culpa|you broke|failed/i;
    const texto = doc.body.innerText;
    return { comStyle, estouro, graficos, semLabel, pequenos, inline, faltando: window.harness.faltando(), proibida: palavrasProibidas.exec(texto)?.[0] ?? null, altura: doc.documentElement.scrollHeight };
  });
  const falhas = [];
  if (erros.length) falhas.push(`erros: ${erros.join(" | ")}`);
  if (r.comStyle.length) falhas.push(`style= no DOM: ${r.comStyle.join(" ; ")}`);
  if (r.estouro > 0) falhas.push(`estouro horizontal de ${r.estouro}px`);
  if (r.graficos.some((g) => !g.title || !g.desc)) falhas.push("gráfico sem <title>/<desc>");
  if (r.semLabel.length) falhas.push(`campo sem label: ${r.semLabel.join(",")}`);
  if (r.pequenos.length) falhas.push(`alvo < 44px: ${r.pequenos.join(" ; ")}`);
  if (r.inline) falhas.push(`${r.inline} <style>/<script> inline`);
  if (r.faltando.length) falhas.push(`i18n faltando: ${r.faltando.join(",")}`);
  if (r.proibida) falhas.push(`palavra proibida na tela: "${r.proibida}"`);
  if (falhas.length) problemas.push(`${rotulo}: ${falhas.join(" // ")}`);
  resumo.push(`${rotulo}: ${r.graficos.length} gráficos, altura ${r.altura}px${falhas.length ? " FALHOU" : ""}`);
}

try {
  for (const tela of TELAS) for (const largura of [390, 1024]) for (const tema of ["dark", "light"]) for (const idioma of ["pt-BR", "en"]) {
    const ctxN = await navegador.newContext({ viewport: { width: largura, height: 900 }, deviceScaleFactor: 1 });
    const { pagina, erros } = await abrir(ctxN, { tela, idioma, tema });
    // Abre todos os <details> e formulários recolhidos, para medir e fotografar o que normalmente fica escondido.
    await pagina.evaluate(() => { document.querySelectorAll("details").forEach((d) => { d.open = true; }); document.querySelectorAll("form[hidden]").forEach((f) => { f.hidden = false; }); });
    await conferir(pagina, `${tela} ${largura}px ${tema} ${idioma}`, erros);
    if (CAPTURAS && tema === "dark" || CAPTURAS && largura === 390 && idioma === "en") await pagina.screenshot({ path: path.join(CAPTURAS, `${tela}-${largura}-${tema}-${idioma}.png`), fullPage: true });
    await ctxN.close();
  }

  // Tela vazia (app sem dados): nada pode quebrar nem faltar chave.
  for (const tela of TELAS) {
    const ctxN = await navegador.newContext({ viewport: { width: 390, height: 900 } });
    const { pagina, erros } = await abrir(ctxN, { tela, idioma: "pt-BR", tema: "light", vazio: "1" });
    await pagina.evaluate(() => { document.querySelectorAll("form[hidden]").forEach((f) => { f.hidden = false; }); });
    await conferir(pagina, `${tela} vazio`, erros);
    if (CAPTURAS) await pagina.screenshot({ path: path.join(CAPTURAS, `${tela}-vazio.png`), fullPage: true });
    await ctxN.close();
  }

  // Check-in de ponta a ponta: grava peso + cintura, treino, categoria e saldos; chega ao resumo com cartão desenhado.
  {
    const ctxN = await navegador.newContext({ viewport: { width: 390, height: 900 } });
    const { pagina, erros } = await abrir(ctxN, { tela: "checkin", idioma: "pt-BR", tema: "dark" });
    // Os dados de exemplo já têm pesagem de hoje: o check-in EDITA essa pesagem (não duplica) e adiciona a cintura.
    const antes = await pagina.evaluate(() => ({ pesos: window.harness.dados.pesos.length, medidas: window.harness.dados.medidas.length }));
    await pagina.fill("input[name=ckg]", "81,3"); await pagina.fill("input[name=ccint]", "89,5");
    await pagina.click(".chk-nav button[type=submit]");
    await pagina.waitForFunction((n) => window.harness.dados.medidas.length === n + 1, antes.medidas);
    const d1 = await pagina.evaluate(() => ({ pesos: window.harness.dados.pesos.length, peso: window.harness.dados.pesos.find((p) => p.data === "2026-10-05"), medida: window.harness.dados.medidas.at(-1), passo: document.querySelector(".chk-prog progress").value }));
    assert.equal(d1.pesos, antes.pesos, "pesagem de hoje foi editada, não duplicada"); assert.equal(d1.peso.kg, 81.3); assert.equal(d1.medida.cinturaCm, 89.5); assert.equal(d1.medida.data, "2026-10-05"); assert.equal(d1.passo, 2);
    const treinosAntes = await pagina.evaluate(() => window.harness.dados.treinos.length);
    await pagina.selectOption("select[name=tdia]", "2026-10-04"); await pagina.selectOption("select[name=ttipo]", "Corrida"); await pagina.fill("input[name=tmin]", "30");
    await pagina.click("form.chk-form button[type=submit]");
    await pagina.waitForFunction((n) => window.harness.dados.treinos.length === n + 1, treinosAntes);
    assert.deepEqual(await pagina.evaluate(() => { const t = window.harness.dados.treinos.find((x) => x.data === "2026-10-04" && x.minutos === 30); return [t.tipo, t.minutos]; }), ["Corrida", 30]);
    await pagina.click(".chk-nav button:not(.peq)"); // continuar → dinheiro
    await pagina.waitForSelector(".chk-lancs");
    assert.equal(await pagina.locator(".chk-lancs li").count(), 3, "3 importados sem categoria");
    const semCat = await pagina.evaluate(() => window.harness.dados.lancamentos.filter((l) => l.categoriaId == null && l.tipo === "despesa").map((l) => l.id));
    await pagina.selectOption(`select[name="cat-${semCat[0]}"]`, "cat-saude-fitness");
    await pagina.waitForFunction((id) => window.harness.dados.lancamentos.find((l) => l.id === id).categoriaId === "cat-saude-fitness", semCat[0]);
    assert.equal(await pagina.locator(".chk-lancs li").count(), 2, "classificou um, sobraram 2");
    await pagina.click(".chk-nav button:not(.peq)"); // → saldos
    await pagina.waitForSelector("input[name='s-c-reserva']");
    await pagina.fill("input[name='s-c-reserva']", "1500000,00"); await pagina.fill("input[name='i-i-cdb']", "1070000,00");
    await pagina.click(".chk-nav button[type=submit]");
    await pagina.waitForFunction(() => window.harness.dados.snapshots.some((s) => s.ym === "2026-10"));
    const d4 = await pagina.evaluate(() => { const d = window.harness.dados; return { reserva: d.contas.find((c) => c.id === "c-reserva"), cdb: d.investimentos.find((i) => i.id === "i-cdb"), snap: d.snapshots.find((s) => s.ym === "2026-10"), passo: document.querySelector(".chk-prog progress").value }; });
    assert.equal(d4.reserva.saldoInicialCentavos, 150000000); assert.equal(d4.reserva.dataSaldoInicial, "2026-10-06", "saldo vale no início de amanhã");
    assert.equal(d4.cdb.saldoInformadoCentavos, 107000000); assert.equal(d4.cdb.dataSaldo, "2026-10-05");
    assert.ok(d4.snap.patrimonioCentavos > 0); assert.equal(d4.passo, 5);
    await pagina.waitForSelector(".chk-resumo canvas");
    const canvasOk = await pagina.evaluate(() => { const c = document.querySelector(".chk-resumo canvas"); const px = c.getContext("2d").getImageData(90, 100, 1, 1).data; return px[3] === 255; });
    assert.ok(canvasOk, "cartão desenhado no canvas");
    const textoCartao = await pagina.evaluate(() => [...document.querySelectorAll(".chk-linhas li")].map((l) => l.textContent).join(" "));
    assert.doesNotMatch(textoCartao, /R\$|\d\.\d{3},\d{2}/, "cartão compartilhável sem valores em dinheiro");
    assert.match(await pagina.textContent(".tela-checkin"), /Volte semana que vem/);
    assert.deepEqual(erros, []);
    await conferir(pagina, "checkin resumo após fluxo", erros);
    if (CAPTURAS) await pagina.screenshot({ path: path.join(CAPTURAS, "checkin-resumo-fluxo.png"), fullPage: true });
    await ctxN.close();
  }

  // Patrimônio: atualizar saldos grava snapshot e a linha ganha o ponto do mês; nova conta e apagar.
  {
    const ctxN = await navegador.newContext({ viewport: { width: 1024, height: 900 } });
    const { pagina, erros } = await abrir(ctxN, { tela: "patrimonio", idioma: "en", tema: "light" });
    await pagina.click(".sec-saldos .alternador");
    await pagina.fill("input[name='saldo-c-corrente']", "3000.00");
    await pagina.click("#form-saldos button[type=submit]");
    await pagina.waitForFunction(() => window.harness.dados.snapshots.some((s) => s.ym === "2026-10"));
    assert.equal(await pagina.evaluate(() => window.harness.dados.contas.find((c) => c.id === "c-corrente").saldoInicialCentavos), 300000);
    assert.match(await pagina.textContent(".sec-saldos"), /recorded/);
    await pagina.click(".sec-contas .alternador");
    await pagina.fill("#form-conta input[name=nome]", "Wallet"); await pagina.selectOption("#form-conta select[name=tipo]", "dinheiro"); await pagina.fill("#form-conta input[name=saldo]", "150.00");
    await pagina.click("#form-conta button[type=submit]");
    await pagina.waitForFunction(() => window.harness.dados.contas.some((c) => c.nome === "Wallet"));
    await pagina.click(".sec-contas li:has-text('Wallet') button[aria-label^='Delete']");
    await pagina.waitForSelector("dialog[open]"); await pagina.click("dialog[open] button.perigo");
    await pagina.waitForFunction(() => !window.harness.dados.contas.some((c) => c.nome === "Wallet"));
    assert.deepEqual(erros, []);
    await ctxN.close();
  }

  // Metas: nova meta de treino e apagar; Dívidas: nova dívida, escolher bola de neve, CET.
  {
    const ctxN = await navegador.newContext({ viewport: { width: 390, height: 900 } });
    let { pagina, erros } = await abrir(ctxN, { tela: "metas", idioma: "pt-BR", tema: "dark" });
    await pagina.click(".sec-metas .alternador");
    await pagina.selectOption("#form-meta select[name=tipo]", "sinking");
    await pagina.waitForSelector("#form-meta input[name=prazo]");
    await pagina.fill("#form-meta input[name=nome]", "IPVA"); await pagina.fill("#form-meta input[name=alvo]", "2400,00"); await pagina.fill("#form-meta input[name=prazo]", "2027-02-28"); await pagina.fill("#form-meta input[name=atual]", "400,00");
    await pagina.click("#form-meta button[type=submit]");
    await pagina.waitForFunction(() => window.harness.dados.metas.some((m) => m.nome === "IPVA"));
    const ipva = await pagina.evaluate(() => window.harness.dados.metas.find((m) => m.nome === "IPVA"));
    assert.equal(ipva.alvo, 240000); assert.equal(ipva.atual, 40000); assert.equal(ipva.taxaBp, 1365);
    assert.match(await pagina.textContent(".tela-metas"), /IPVA/);
    assert.deepEqual(erros, []);
    await pagina.close();
    ({ pagina, erros } = await abrir(ctxN, { tela: "dividas", idioma: "pt-BR", tema: "dark" }));
    await pagina.click(".metodo:has-text('Bola de neve')");
    assert.equal(await pagina.getAttribute(".metodo:has-text('Bola de neve')", "aria-pressed"), "true");
    assert.match(await pagina.textContent(".escolha"), /Bola de neve/);
    await pagina.fill("input[name=extra]", "500,00"); await pagina.click(".form-sim button[type=submit]");
    assert.match(await pagina.textContent(".sec-plano"), /a menos/);
    await pagina.fill("input[name=cet-liberado]", "1000,00"); await pagina.fill("input[name=cet-parcela]", "94,56"); await pagina.fill("input[name=cet-n]", "12");
    await pagina.click(".sec-cet button[type=submit]");
    assert.match(await pagina.textContent(".sec-cet"), /2,00%\s*ao mês/, "CET de 1000 em 12x de 94,56 = 2% a.m. (caso do plano)");
    assert.deepEqual(erros, []);
    await ctxN.close();
  }

  console.log(resumo.join("\n"));
  if (problemas.length) { console.error("\nPROBLEMAS:\n" + problemas.join("\n")); process.exitCode = 1; }
  else console.log(`\nOK: ${resumo.length} combinações sem problema estrutural; fluxos do check-in, patrimônio, metas e dívidas gravaram.`);
} finally {
  await navegador.close();
  servidor.close();
}
