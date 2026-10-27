// Auditoria de design, onboarding e acessibilidade do Fitrich v3 no navegador (ver LEIA-ME.md).
// Matriz: 390 e 1024 px × claro/escuro × pt-BR/en × app vazio e com exemplo, nas 11 telas: zero erro de console,
// zero style=, zero estouro horizontal, faltando() vazio. Depois: onboarding de 3 passos (pular, Esc, salvar),
// foco visível e ordem de tab, alvos ≥ 44 px, alto contraste, texto maior, movimento reduzido, árvore de
// acessibilidade (ariaSnapshot) da Hoje, CLS medido e o slot de insights da Hoje.
// Firefox e WebKit entram se o Playwright os tiver instalado; senão o relatório diz que não deu para testar.
import assert from "node:assert/strict";
import http from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const pw = require("playwright");
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
const TELAS = ["hoje", "financas", "cartoes", "metas", "patrimonio", "dividas", "shape", "checkin", "importar", "dados", "regras"];
const resumo = { matriz: 0, naoTestado: [], alvosPequenos: {}, cls: {} };

async function nova(navegador, { largura = 390, altura = 844, tema = "light", idioma = "pt-BR", inicial = {}, movimento = "no-preference" } = {}) {
  const contexto = await navegador.newContext({ viewport: { width: largura, height: altura }, colorScheme: tema, locale: idioma, reducedMotion: movimento });
  const pagina = await contexto.newPage();
  const erros = [];
  pagina.on("pageerror", (e) => erros.push(`pageerror: ${e}`));
  pagina.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") erros.push(`${m.type()}: ${m.text()} (${m.location()?.url})`); });
  pagina.on("requestfailed", (r) => { if (r.failure()?.errorText !== "net::ERR_ABORTED") erros.push(`request: ${r.url()} ${r.failure()?.errorText}`); });
  await contexto.addInitScript((ini) => { try { if (sessionStorage.getItem("t")) return; sessionStorage.setItem("t", "1"); localStorage.clear(); for (const [k, v] of Object.entries(ini)) localStorage.setItem(k, v); } catch {} }, { "fitrich-onboarding": "feito", ...inicial });
  return { contexto, pagina, erros };
}
const limparIDB = (p) => p.evaluate(() => new Promise((res, rej) => { const r = indexedDB.deleteDatabase("fitrich"); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }));
const pronta = async (p, sel = "#vista > *") => { await p.waitForSelector(sel, { timeout: 15000 }); await p.waitForFunction(() => document.fonts.status === "loaded"); };
async function invariantes(p, rotulo) {
  const r = await p.evaluate(() => ({ faltando: globalThis.__fitrich.faltando(), comStyle: [...document.querySelectorAll("[style]")].map((e) => e.outerHTML.slice(0, 80)), estouro: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  assert.deepEqual(r.faltando, [], `${rotulo}: chaves de tradução faltando`);
  assert.deepEqual(r.comStyle, [], `${rotulo}: atributo style no DOM`);
  assert.ok(r.estouro <= 0, `${rotulo}: estouro horizontal de ${r.estouro}px`);
}
// Alvos: o contrato do app é ≥ 44 px (WCAG 2.2 AA exige 24). Medimos tudo que é clicável e visível;
// link no meio de frase (inline) é isento pelo próprio WCAG.
const alvosPequenos = (p) => p.evaluate(() => [...document.querySelectorAll("button, a[href]:not(.pular), input:not([type=hidden]):not([type=radio]):not([type=checkbox]):not([type=file]), select, summary, [role=button]")]
  .filter((e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && !e.closest("[hidden],.oculto,dialog:not([open])") && !(e.tagName === "A" && cs.display === "inline"); })
  .map((e) => { const r = e.getBoundingClientRect(); return { alvo: `${e.tagName.toLowerCase()}${e.className && typeof e.className === "string" ? "." + e.className.split(" ")[0] : ""}`, w: Math.round(r.width), h: Math.round(r.height), t: (e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 24) }; })
  .filter((a) => a.w < 44 || a.h < 44));
const captura = async (p, nome) => { await p.evaluate(() => scrollTo(0, 0)); await p.screenshot({ path: path.join(CAPTURAS, `${nome}.png`), fullPage: true, animations: "disabled" }); };

const chromium = await pw.chromium.launch();
try {
  // ---- 1. Matriz: viewport × tema × idioma × (vazio | exemplo) × 11 telas ----
  for (const largura of [390, 1024]) for (const tema of ["light", "dark"]) for (const idioma of ["pt-BR", "en"]) for (const modo of ["vazio", "exemplo"]) {
    const { contexto, pagina, erros } = await nova(chromium, { largura, altura: largura === 390 ? 844 : 768, tema, idioma });
    await pagina.goto(`${base}${idioma === "en" ? "/en/" : "/"}`); await limparIDB(pagina); await pagina.reload(); await pronta(pagina);
    if (modo === "exemplo") { await pagina.evaluate(() => globalThis.__fitrich.navegar("exemplo")); await pagina.waitForSelector(".heroi .gran"); }
    for (const id of TELAS) {
      await pagina.evaluate((i) => { location.hash = `#/${i}`; }, id);
      await pagina.waitForFunction((i) => globalThis.__fitrich.tela() === i, id);
      await pagina.waitForSelector("#vista > *:not(.esqueleto)", { timeout: 15000 });
      await pagina.waitForTimeout(150);
      const rotulo = `${largura} ${tema} ${idioma} ${modo} ${id}`;
      await invariantes(pagina, rotulo);
      assert.equal(await pagina.locator("h1").count(), 1, `${rotulo}: exatamente um h1`);
      resumo.matriz++;
      if (largura === 390) { const pequenos = await alvosPequenos(pagina); if (pequenos.length) resumo.alvosPequenos[`${tema} ${idioma} ${modo} ${id}`] = pequenos; }
      if (largura === 390 && idioma === "pt-BR" && ["hoje", "financas", "cartoes", "metas", "patrimonio", "shape"].includes(id) || (largura === 1024 && id === "hoje")) await captura(pagina, `v3-${modo}-${largura}-${tema}-${idioma}-${id}`);
    }
    assert.deepEqual(erros, [], `console ${largura} ${tema} ${idioma} ${modo}`);
    await contexto.close();
  }

  // ---- 2. Onboarding: 3 passos, pular sempre, Esc, salvar conta e peso ----
  {
    const { contexto, pagina, erros } = await nova(chromium, { inicial: { "fitrich-onboarding": "forcar" } });
    await pagina.goto(`${base}/`); await limparIDB(pagina); await pagina.reload();
    await pagina.waitForSelector("dialog.onboarding[open]");
    assert.equal(await pagina.evaluate(() => document.activeElement?.id), "onb-titulo", "o foco vai para o título do passo (leitor de tela)");
    assert.match(await pagina.locator(".onb-passo").textContent(), /Passo 1 de 3/);
    assert.ok(await pagina.locator(".onboarding button:has-text('Pular por agora')").isVisible(), "pular no passo 1");
    await captura(pagina, "v3-onboarding-1-390");
    await pagina.click(".onboarding button:has-text('Continuar')");
    assert.match(await pagina.locator(".onb-passo").textContent(), /Passo 2 de 3/);
    assert.ok(await pagina.locator(".onboarding button:has-text('Pular por agora')").isVisible(), "pular no passo 2");
    await pagina.click("label:has-text('Corpo')");
    await captura(pagina, "v3-onboarding-2-390");
    await pagina.click(".onboarding button:has-text('Continuar')");
    assert.match(await pagina.locator(".onb-passo").textContent(), /Passo 3 de 3/);
    assert.equal(await pagina.locator("#onb-conta").count(), 0, "objetivo Corpo não pede conta");
    assert.ok(await pagina.locator("#onb-peso").isVisible());
    await pagina.fill("#onb-peso", "9");
    await pagina.click(".onboarding button:has-text('Começar')");
    await pagina.waitForSelector(".onboarding .erro:not([hidden])");
    assert.match(await pagina.locator(".onboarding .erro").textContent(), /entre 20 e 500/, "erro sem culpa e sem fechar");
    await pagina.fill("#onb-peso", "80,5");
    await captura(pagina, "v3-onboarding-3-390");
    await pagina.click(".onboarding button:has-text('Começar')");
    await pagina.waitForFunction(() => !document.querySelector("dialog.onboarding"));
    const r = await pagina.evaluate(() => ({ pesos: globalThis.__fitrich.estado().pesos.map((p) => p.kg), obj: localStorage.getItem("fitrich-objetivo"), vis: localStorage.getItem("fitrich-onboarding") }));
    assert.deepEqual(r, { pesos: [80.5], obj: "corpo", vis: "feito" });
    await pagina.reload(); await pronta(pagina);
    assert.equal(await pagina.locator("dialog.onboarding").count(), 0, "não volta depois de feito");
    assert.deepEqual(erros, []);
    await contexto.close();
  }
  {
    const { contexto, pagina } = await nova(chromium, { inicial: { "fitrich-onboarding": "forcar" } });
    await pagina.goto(`${base}/`); await limparIDB(pagina); await pagina.reload();
    await pagina.waitForSelector("dialog.onboarding[open]");
    await pagina.keyboard.press("Escape");
    await pagina.waitForFunction(() => !document.querySelector("dialog.onboarding"));
    assert.equal(await pagina.evaluate(() => localStorage.getItem("fitrich-onboarding")), "feito", "Esc pula e lembra");
    assert.equal(await pagina.evaluate(() => globalThis.__fitrich.estado().lancamentos.length + globalThis.__fitrich.estado().contas.length), 0, "pular não grava nada");
    await contexto.close();
  }
  {
    // Idioma no passo 1: escolher English recarrega em /en/ e retoma no passo 2.
    const { contexto, pagina } = await nova(chromium, { inicial: { "fitrich-onboarding": "forcar" } });
    await pagina.goto(`${base}/`); await limparIDB(pagina); await pagina.reload();
    await pagina.waitForSelector("dialog.onboarding[open]");
    await pagina.click("label:has-text('English')");
    await pagina.click(".onboarding button:has-text('Continuar')");
    await pagina.waitForURL(/\/en\//);
    await pagina.waitForSelector("dialog.onboarding[open]");
    assert.match(await pagina.locator(".onb-passo").textContent(), /Step 2 of 3/);
    await pagina.click("label:has-text('Both')");
    await pagina.click(".onboarding button:has-text('Continue')");
    assert.ok(await pagina.locator("#onb-conta").isVisible() && await pagina.locator("#onb-peso").isVisible(), "ambos pede conta e peso, opcionais");
    await pagina.fill("#onb-conta", "Checking"); await pagina.fill("#onb-saldo", "1,250.00");
    await pagina.click(".onboarding button:has-text('Get started')");
    await pagina.waitForFunction(() => !document.querySelector("dialog.onboarding"));
    const c = await pagina.evaluate(() => globalThis.__fitrich.estado().contas.map((x) => [x.nome, x.saldoInicialCentavos]));
    assert.deepEqual(c, [["Checking", 125000]]);
    await contexto.close();
  }

  // ---- 3. Foco visível e ordem de tab; pular para o conteúdo; aria-live; alvos ----
  {
    const { contexto, pagina } = await nova(chromium);
    await pagina.goto(`${base}/`); await limparIDB(pagina); await pagina.reload(); await pronta(pagina, "#vista .hoje");
    await pagina.keyboard.press("Tab");
    assert.equal(await pagina.evaluate(() => document.activeElement?.id), "pular", "primeiro Tab: link de pular");
    assert.ok(await pagina.evaluate(() => document.activeElement.getBoundingClientRect().top >= 0), "o link de pular aparece com foco");
    await pagina.keyboard.press("Enter");
    assert.equal(await pagina.evaluate(() => document.activeElement?.id), "vista", "pular leva o foco ao conteúdo");
    assert.equal(await pagina.evaluate(() => location.hash), "#/hoje", "pular não mexe na rota");
    const ordem = [];
    for (let i = 0; i < 9; i++) {
      await pagina.keyboard.press("Tab");
      const f = await pagina.evaluate(() => { const e = document.activeElement, cs = getComputedStyle(e); return { id: e.id || e.className.toString().split(" ")[0] || e.tagName, contorno: parseFloat(cs.outlineWidth), estilo: cs.outlineStyle, w: e.getBoundingClientRect().width }; });
      assert.ok(f.estilo !== "none" && f.contorno >= 3, `foco visível de 3 px em ${f.id}: ${f.estilo} ${f.contorno}`);
      ordem.push(f.id);
    }
    resumo.ordemDeTab = ordem;
    await captura(pagina, "v3-foco-390");
    // aria-live: a região de status da Hoje existe, é única e não cobre a tela inteira.
    assert.equal(await pagina.locator("#vista [role=status][aria-live=polite]").count(), 1);
    assert.equal(await pagina.locator("#toast[aria-live]").count(), 1);
    await contexto.close();
  }

  // ---- 4. Alto contraste, texto maior, movimento reduzido ----
  {
    const { contexto, pagina } = await nova(chromium);
    await pagina.goto(`${base}/`); await limparIDB(pagina); await pagina.reload(); await pronta(pagina, "#vista .hoje");
    await pagina.evaluate(() => globalThis.__fitrich.navegar("exemplo")); await pagina.waitForSelector(".heroi .gran");
    const corTexto = () => pagina.evaluate(() => getComputedStyle(document.querySelector(".hoje .leg")).color);
    const antes = await corTexto();
    await pagina.click("#nav-inferior button[aria-haspopup]");
    await pagina.waitForSelector("dialog.folha[open] .aparencia");
    await pagina.click("dialog.folha .aparencia button:has-text('Alto contraste')");
    assert.equal(await pagina.getAttribute("html", "data-gs-contraste"), "alto");
    assert.equal(await pagina.getAttribute("dialog.folha .aparencia button:has-text('Alto contraste')", "aria-pressed"), "true");
    assert.match(await pagina.locator("dialog.folha .aparencia button:has-text('Alto contraste') .chave").textContent(), /Ligado/, "estado também em texto, não só cor");
    await pagina.waitForFunction((c) => getComputedStyle(document.querySelector(".hoje .leg")).color !== c, antes, { timeout: 5000 }); // a folha do alto contraste chega por <link>, não é instantânea
    await pagina.click("dialog.folha .aparencia button:has-text('Texto maior')");
    assert.ok(await pagina.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize)) > 18, "texto maior sobe o rem");
    await pagina.keyboard.press("Escape");
    await invariantes(pagina, "alto contraste + texto maior 390");
    await captura(pagina, "v3-alto-contraste-texto-maior-390");
    await pagina.reload(); await pronta(pagina, "#vista .hoje");
    assert.equal(await pagina.getAttribute("html", "data-gs-contraste"), "alto", "a escolha persiste (tema.js aplica antes da pintura)");
    await contexto.close();
    // prefers-contrast: more liga sozinho quando a pessoa nunca escolheu
    const c2 = await chromium.newContext({ viewport: { width: 390, height: 844 }, contrast: "more" });
    const p2 = await c2.newPage();
    await p2.goto(`${base}/`);
    assert.equal(await p2.getAttribute("html", "data-gs-contraste"), "alto", "prefers-contrast: more do sistema");
    await c2.close();
    // texto do sistema: a fonte-base é 100% (o navegador decide) e nada fixa px na raiz
    const c3 = await chromium.newContext({ viewport: { width: 390, height: 844 } });
    const p3 = await c3.newPage();
    await p3.goto(`${base}/`);
    assert.equal(await p3.evaluate(() => getComputedStyle(document.documentElement).fontSize), "16px");
    await c3.close();
  }
  {
    const { contexto, pagina } = await nova(chromium, { movimento: "reduce" });
    await pagina.goto(`${base}/`); await limparIDB(pagina); await pagina.reload(); await pronta(pagina, "#vista .hoje");
    const dur = await pagina.evaluate(() => { const e = document.querySelector("#vista > *"); return parseFloat(getComputedStyle(e).animationDuration); });
    assert.ok(dur <= 0.001, `movimento reduzido: animação de ${dur}s`);
    await contexto.close();
    const n = await nova(chromium, { movimento: "no-preference" });
    await n.pagina.goto(`${base}/`); await limparIDB(n.pagina); await n.pagina.reload(); await pronta(n.pagina, "#vista .hoje");
    const d2 = await n.pagina.evaluate(() => parseFloat(getComputedStyle(document.querySelector("#vista > *")).animationDuration));
    assert.ok(d2 >= 0.15 && d2 <= 0.2, `entrada de ${d2}s deve ficar entre 150 e 200 ms`);
    await n.contexto.close();
  }

  // ---- 5. Árvore de acessibilidade da Hoje (ariaSnapshot) ----
  {
    const { contexto, pagina } = await nova(chromium);
    await pagina.goto(`${base}/`); await limparIDB(pagina); await pagina.reload(); await pronta(pagina, "#vista .hoje");
    await pagina.evaluate(() => globalThis.__fitrich.navegar("exemplo")); await pagina.waitForSelector(".heroi .gran");
    const arvore = await pagina.locator("body").ariaSnapshot();
    resumo.ariaHoje = arvore.split("\n").slice(0, 40);
    for (const esperado of [/banner/, /heading "Fitrich|link "Fitrich/, /heading "Hoje" \[level=1\]/, /navigation "Seções"/, /heading "Dá para gastar" \[level=2\]/, /status/, /group "Idioma"|navigation "Idioma"/, /button "Mudar para o tema/, /link "Pular para o conteúdo"/]) assert.match(arvore, esperado, `árvore de acessibilidade deve conter ${esperado}`);
    const imgs = [...arvore.matchAll(/- img "([^"]*)"/g)].map((m) => m[1]);
    assert.ok(imgs.length === 2 && imgs.every((x) => /% do mês|Peso dos/.test(x)), `só o medidor e o gráfico de peso têm descrição; decorativos ficam fora da árvore: ${imgs}`);
    await contexto.close();
  }

  // ---- 6. CLS: carregar, trocar de tela e abrir o Hoje com exemplo ----
  for (const largura of [390, 1024]) {
    const { contexto, pagina } = await nova(chromium, { largura, altura: largura === 390 ? 844 : 768 });
    await pagina.addInitScript(() => { globalThis.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) globalThis.__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); });
    await pagina.goto(`${base}/`); await limparIDB(pagina); await pagina.reload(); await pronta(pagina, "#vista .hoje");
    await pagina.click(".vazio-hoje button:has-text('exemplo')"); await pagina.waitForSelector(".heroi .gran"); // clique de verdade: o deslocamento causado por entrada da pessoa não conta no CLS
    await pagina.waitForTimeout(600);
    resumo.clsAposExemplo = Number((await pagina.evaluate(() => globalThis.__cls)).toFixed(4));
    for (const id of ["financas", "cartoes", "metas", "shape", "hoje"]) { await pagina.evaluate((i) => { location.hash = `#/${i}`; }, id); await pagina.waitForFunction((i) => globalThis.__fitrich.tela() === i, id); await pagina.waitForTimeout(350); }
    resumo.cls[largura] = Number((await pagina.evaluate(() => globalThis.__cls)).toFixed(4));
    assert.ok(resumo.cls[largura] < 0.1, `CLS ${resumo.cls[largura]} em ${largura}px (limite do "bom": 0,1)`);
    await contexto.close();
  }

  // ---- 7. Slot de insights da Hoje: um cartão plugado por UMA linha aparece abaixo do alerta ----
  {
    const { contexto, pagina } = await nova(chromium);
    await pagina.goto(`${base}/`); await limparIDB(pagina); await pagina.reload(); await pronta(pagina, "#vista .hoje");
    await pagina.evaluate(async () => {
      const { SLOTS_HOJE } = await import("/js/v2/ui/slots-hoje.mjs");
      SLOTS_HOJE.push({ id: "teste", ordem: 1, carregar: async () => ({ cartao: { montar: (ctx) => ({ elemento: ctx.h("section", { id: "insight-teste", class: "cartao" }, ctx.h("h2", null, "Insight de teste")) }) } }) });
      globalThis.__fitrich.navegar("exemplo");
    });
    await pagina.waitForSelector(".slot-hoje #insight-teste");
    const ordem = await pagina.evaluate(() => [...document.querySelectorAll(".hoje-corpo > *")].map((e) => e.className.split(" ")[0]));
    assert.ok(ordem.indexOf("slot-hoje") > 0 && ordem.indexOf("slot-hoje") < ordem.indexOf("tiles"), `slot entre o alerta e os tiles: ${ordem}`);
    await captura(pagina, "v3-slot-insights-390");
    await contexto.close();
  }

  // ---- 8. Outros motores (se instalados) ----
  for (const nome of ["firefox", "webkit"]) {
    let exe = null; try { exe = pw[nome].executablePath(); } catch { /* sem executável */ }
    if (!exe || !existsSync(exe)) { resumo.naoTestado.push(`${nome}: navegador não instalado neste ambiente`); continue; }
    const b = await pw[nome].launch();
    const { contexto, pagina, erros } = await nova(b);
    await pagina.goto(`${base}/`); await pronta(pagina, "#vista .hoje");
    for (const id of TELAS) { await pagina.evaluate((i) => { location.hash = `#/${i}`; }, id); await pagina.waitForTimeout(250); await invariantes(pagina, `${nome} ${id}`); }
    assert.deepEqual(erros, [], nome);
    await contexto.close(); await b.close();
    resumo[nome] = "ok";
  }
  assert.deepEqual(resumo.alvosPequenos, {}, "alvos de toque menores que 44 px");
  console.log(JSON.stringify(resumo, null, 1));
  console.log("OK: design v3 do Fitrich no navegador");
} finally {
  await chromium.close(); servidor.close();
}
