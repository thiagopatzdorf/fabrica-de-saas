// Teste de navegador do shell do Fitrich v2 (ver LEIA-ME.md). Sai com 0 e imprime um resumo em JSON;
// qualquer divergência sai com 1. Capturas em capturas/ para OLHAR antes de entregar.
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
const BACKUP_V1 = readFileSync(path.join(AQUI, "fixtures", "backup-v1.json"), "utf8");
const TIPOS = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".xml": "application/xml" };

// Servidor estático: `/en/` serve en/index.html.
const servidor = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  for (const raiz of [FITRICH]) {
    const arq = path.join(raiz, path.normalize(p));
    if (!arq.startsWith(raiz)) break;
    try { const corpo = await readFile(arq); res.writeHead(200, { "content-type": TIPOS[path.extname(arq)] ?? "application/octet-stream" }); return res.end(corpo); } catch { /* tenta a próxima raiz */ }
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${servidor.address().port}`;

const resumo = { capturas: [], tempos: {} };
const navegador = await chromium.launch();

async function novaPagina({ largura = 390, altura = 844, tema = null, localStorageInicial = {} } = {}) {
  const contexto = await navegador.newContext({ viewport: { width: largura, height: altura }, colorScheme: tema ?? "light", locale: "pt-BR" });
  const pagina = await contexto.newPage();
  const erros = [];
  pagina.on("pageerror", (e) => erros.push(`pageerror: ${e}`));
  // Tela ainda inexistente dá 404 de propósito (vira "em breve"); pedido cortado por um reload (ERR_ABORTED) não é falha.
  const emBreve = (url) => /telas\/(cartoes|metas|patrimonio|dividas|shape|checkin|importar|dados|regras)\.mjs$/.test(url ?? "");
  pagina.on("console", (m) => { if ((m.type() === "error" || m.type() === "warning") && !emBreve(m.location()?.url)) erros.push(`${m.type()}: ${m.text()} (${m.location()?.url})`); });
  pagina.on("requestfailed", (r) => { if (r.failure()?.errorText !== "net::ERR_ABORTED" && !emBreve(r.url())) erros.push(`request: ${r.url()} ${r.failure()?.errorText}`); });
  // Só na primeira carga da aba (sessionStorage como trava): navegações seguintes têm de VER o que o app guardou.
  await contexto.addInitScript((inicial) => { try { if (sessionStorage.getItem("teste-iniciado")) return; sessionStorage.setItem("teste-iniciado", "1"); localStorage.clear(); for (const [k, v] of Object.entries(inicial)) localStorage.setItem(k, v); } catch {} }, localStorageInicial);
  return { contexto, pagina, erros };
}
// `onblocked` NÃO resolve: o app ainda tem a conexão aberta e o `onversionchange` do adaptador a fecha; só
// então o delete conclui. Resolver no blocked deixaria o banco de pé e o teste seguinte leria dado velho.
const limparIDB = (pagina) => pagina.evaluate(() => new Promise((res, rej) => { const r = indexedDB.deleteDatabase("fitrich"); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }));
async function prontaHoje(pagina) { await pagina.waitForSelector("#vista .hoje", { timeout: 15000 }); await pagina.waitForFunction(() => document.fonts.status === "loaded"); }
async function invariantes(pagina, rotulo) {
  const r = await pagina.evaluate(() => ({
    faltando: globalThis.__fitrich.faltando(),
    comStyle: [...document.querySelectorAll("[style]")].map((e) => e.outerHTML.slice(0, 80)),
    estouro: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    lang: document.documentElement.lang,
  }));
  assert.deepEqual(r.faltando, [], `${rotulo}: chaves de tradução faltando`);
  assert.deepEqual(r.comStyle, [], `${rotulo}: atributo style no DOM`);
  assert.ok(r.estouro <= 0, `${rotulo}: estouro horizontal de ${r.estouro}px`);
  return r;
}
async function captura(pagina, nome) { const arq = path.join(CAPTURAS, `${nome}.png`); await pagina.evaluate(() => window.scrollTo(0, 0)); await pagina.screenshot({ path: arq, fullPage: true, animations: "disabled" }); resumo.capturas.push(path.relative(process.cwd(), arq)); }

try {
  // ---- 1. App vazio, 390px, claro: estado vazio ensina e dá o próximo passo. ----
  {
    const { contexto, pagina, erros } = await novaPagina({ tema: "light" });
    await pagina.goto(`${base}/`); await limparIDB(pagina); await pagina.reload(); await prontaHoje(pagina);
    assert.equal(await pagina.locator(".vazio-hoje h2").textContent(), "Comece por onde fizer sentido");
    assert.equal(await pagina.getAttribute("html", "data-gs-theme"), "light", "tema do sistema (claro) sem preferência guardada");
    await invariantes(pagina, "vazio 390 claro");
    await captura(pagina, "01-vazio-390-claro");

    // ---- 2. Lançar em 3 toques: FAB → categoria → salvar (valor pelo teclado), < 20 s. ----
    const t0 = Date.now();
    await pagina.click("#fab");
    await pagina.waitForSelector("dialog.lancar[open]");
    assert.equal(await pagina.evaluate(() => document.activeElement?.id), "l-valor", "o valor abre com foco (teclado numérico)");
    assert.equal(await pagina.getAttribute("#l-valor", "inputmode"), "decimal");
    await pagina.keyboard.type("32,50");
    await pagina.click("label.chip:has-text('Mercado')");
    await pagina.click("button.salvar");
    await pagina.waitForSelector(".feito:not([hidden])");
    resumo.tempos.lancarMs = Date.now() - t0;
    assert.ok(resumo.tempos.lancarMs < 20000, `lançar levou ${resumo.tempos.lancarMs} ms`);
    const depois = await pagina.evaluate(() => { const d = globalThis.__fitrich.estado(); return { n: d.lancamentos.length, centavos: d.lancamentos[0]?.centavos, cat: d.lancamentos[0]?.categoriaId, contas: d.contas.map((c) => c.id) }; });
    assert.deepEqual(depois, { n: 1, centavos: 3250, cat: "cat-mercado", contas: ["conta-carteira"] }, "o primeiro lançamento cria a conta padrão sozinho");
    assert.match(await pagina.locator(".feito-linha p").textContent(), /R\$\s?32,50 em Mercado/);
    await invariantes(pagina, "folha lançar");
    await captura(pagina, "02-lancar-feito-390");
    // Desfazer dentro dos 5 s restaura o estado anterior (e o IDB).
    await pagina.click(".feito button:has-text('Desfazer')");
    await pagina.waitForFunction(() => globalThis.__fitrich.estado().lancamentos.length === 0);
    assert.equal(await pagina.locator(".feito-linha p").textContent(), "Desfeito. Nada foi gravado.");
    // Parser do texto livre preenche valor, categoria e descrição.
    await pagina.click(".feito button:has-text('Lançar outro')").catch(() => {});
    await pagina.fill("#l-texto", "almoço 32 mercado");
    assert.equal(await pagina.inputValue("#l-valor"), "32,00");
    assert.equal(await pagina.locator("label.chip.marcado").textContent(), "Mercado");
    assert.equal(await pagina.inputValue("#l-desc"), "almoço");
    await pagina.click("button.salvar");
    await pagina.waitForSelector(".feito:not([hidden]) .feito-linha");
    await pagina.waitForFunction(() => globalThis.__fitrich.estado().lancamentos.length === 1);
    // "Repetir todo mês?" cria a recorrência.
    await pagina.click(".feito button:has-text('Sim, todo dia')");
    await pagina.waitForFunction(() => globalThis.__fitrich.estado().recorrencias.length === 1);
    const rec = await pagina.evaluate(() => globalThis.__fitrich.estado().recorrencias[0]);
    assert.equal(rec.freq, "mensal"); assert.equal(rec.centavos, 3200); assert.equal(rec.categoriaId, "cat-mercado");
    assert.equal(await pagina.evaluate(() => globalThis.__fitrich.estado().lancamentos[0].recorrenciaId), rec.id, "o lançamento salvo é a 1ª ocorrência");
    await pagina.keyboard.press("Escape");
    await pagina.waitForFunction(() => !document.querySelector("dialog.lancar").open);
    // Hoje com dado mas sem receita: ensina o próximo passo.
    assert.equal(await pagina.locator(".heroi h2").textContent(), "Lance sua receita do mês");
    await pagina.click(".heroi button:has-text('Lançar receita')");
    await pagina.waitForSelector("dialog.lancar[open]");
    assert.equal(await pagina.getAttribute("button.seg:has-text('Entrada')", "aria-pressed"), "true");
    await pagina.fill("#l-valor", "4.800,00");
    await pagina.click("label.chip:has-text('Salário')");
    await pagina.click("button.salvar");
    await pagina.waitForFunction(() => globalThis.__fitrich.estado().lancamentos.length === 2);
    await pagina.keyboard.press("Escape");
    await pagina.waitForSelector(".heroi .gran");
    const heroi = await pagina.locator(".heroi").textContent();
    assert.match(heroi, /Dá para gastar/); assert.match(heroi, /por dia|último dia/);
    const tamanho = await pagina.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".heroi .gran")).fontSize));
    assert.ok(tamanho >= 48, `herói com ${tamanho}px (mínimo 48)`);
    // Recarregar: o que foi gravado no IDB volta.
    await pagina.reload(); await prontaHoje(pagina);
    assert.equal(await pagina.evaluate(() => globalThis.__fitrich.estado().lancamentos.length), 2, "IndexedDB persistiu");
    await invariantes(pagina, "hoje com dados 390");
    await captura(pagina, "03-hoje-dados-390-claro");
    assert.deepEqual(erros, []);
    await contexto.close();
  }

  // ---- 3. Dados de exemplo: entram, aparecem, somem no primeiro lançamento real e NUNCA vão ao IDB. ----
  {
    const { contexto, pagina, erros } = await novaPagina({ tema: "dark" });
    await pagina.goto(`${base}/`); await limparIDB(pagina); await pagina.reload(); await prontaHoje(pagina);
    assert.equal(await pagina.getAttribute("html", "data-gs-theme"), "dark");
    await pagina.click(".vazio-hoje button:has-text('exemplo')");
    await pagina.waitForSelector(".heroi .gran");
    assert.ok((await pagina.evaluate(() => globalThis.__fitrich.estado().lancamentos.length)) > 30);
    assert.match(await pagina.locator("#avisos").textContent(), /dados de exemplo/);
    const tiles = await pagina.locator(".tile b").allTextContents();
    assert.equal(tiles.length, 3, "três stat tiles");
    assert.ok(await pagina.locator(".sparkline").count() === 1, "sparkline do peso");
    assert.match(await pagina.locator(".checkin").textContent(), /das últimas 8 semanas/);
    assert.doesNotMatch(await pagina.locator("#vista").textContent(), /estourou|falhou|sequência|seguidas|atrasad|culpa/i);
    await invariantes(pagina, "exemplo 390 escuro");
    await captura(pagina, "04-exemplo-390-escuro");
    await pagina.click("details.placar summary");
    await pagina.click("details.formula:not(.placar) summary");
    await captura(pagina, "05-exemplo-formulas-390-escuro");
    // Primeiro lançamento real: exemplo some, IDB recebe só o real.
    await pagina.click("#fab"); await pagina.waitForSelector("dialog.lancar[open]");
    await pagina.fill("#l-valor", "15");
    await pagina.click("label.chip:has-text('Transporte')");
    await pagina.click("button.salvar");
    await pagina.waitForFunction(() => globalThis.__fitrich.estado().lancamentos.length === 1);
    const real = await pagina.evaluate(() => { const d = globalThis.__fitrich.estado(); return { exemplo: d.meta.exemplo, lanc: d.lancamentos.length, pesos: d.pesos.length, metas: d.metas.length, contas: d.contas.map((c) => c.id), limites: Object.keys(d.orcamento.limites).length }; });
    assert.deepEqual(real, { exemplo: undefined, lanc: 1, pesos: 0, metas: 0, contas: ["conta-carteira"], limites: 0 });
    await pagina.keyboard.press("Escape");
    await pagina.reload(); await prontaHoje(pagina);
    const relido = await pagina.evaluate(() => { const d = globalThis.__fitrich.estado(); return { lanc: d.lancamentos.length, ids: d.lancamentos.map((l) => l.id.startsWith("exemplo-")), exemplo: d.meta.exemplo }; });
    assert.deepEqual(relido, { lanc: 1, ids: [false], exemplo: undefined }, "nada de exemplo foi gravado");
    assert.equal(await pagina.locator("#avisos").textContent(), "");
    assert.deepEqual(erros, []);
    await contexto.close();
  }

  // ---- 4. Migração de um backup v1 real: aviso dos 90 dias, contagens, chave v1 intacta. ----
  {
    const v1 = JSON.parse(BACKUP_V1);
    const { contexto, pagina, erros } = await novaPagina({ tema: "light", localStorageInicial: { "fitrich-dados-v1": BACKUP_V1 } });
    // Espera a 1ª carga terminar de gravar: apagar o IDB no meio da migração deixa a gravação recriá-lo e a 2ª carga vê "dados novos".
    await pagina.goto(`${base}/`); await prontaHoje(pagina); await limparIDB(pagina);
    await pagina.evaluate(() => localStorage.removeItem("fitrich-migrado-v2")); await pagina.reload(); await prontaHoje(pagina);
    assert.match(await pagina.locator("#avisos").textContent(), /Migramos seus dados.*90 dias/);
    const m = await pagina.evaluate(() => { const d = globalThis.__fitrich.estado(); return { lanc: d.lancamentos.length, pesos: d.pesos.length, treinos: d.treinos.length, medidas: d.medidas.length, v1: localStorage.getItem("fitrich-dados-v1"), marcador: !!localStorage.getItem("fitrich-migrado-v2"), metas: d.metas.map((x) => x.tipo), limites: d.orcamento.limites }; });
    assert.equal(m.lanc, v1.lancamentos.length); assert.equal(m.pesos, v1.pesos.length); assert.equal(m.treinos, v1.treinos.length); assert.equal(m.medidas, 1);
    assert.equal(m.v1, BACKUP_V1, "a chave v1 continua intacta");
    assert.equal(m.marcador, true);
    assert.deepEqual(m.limites, { "cat-mercado": 80000, "cat-lazer": 30000 });
    await captura(pagina, "06-migrado-390-claro");
    await pagina.click("#avisos button:has-text('Entendi')");
    // Dispensado o aviso de migração, o próximo da fila é o lembrete de backup (33 lançamentos nunca exportados).
    assert.match(await pagina.locator("#avisos").textContent(), /ainda não exportou um backup/);
    await pagina.reload(); await prontaHoje(pagina);
    assert.doesNotMatch(await pagina.locator("#avisos").textContent(), /Migramos/, "aviso dispensado não volta");
    await invariantes(pagina, "migrado");
    assert.deepEqual(erros, []);
    await contexto.close();
  }

  // ---- 5. Idioma: /en/ inteiro em inglês, troca persiste e redireciona. ----
  {
    const { contexto, pagina, erros } = await novaPagina({ tema: "dark" });
    await pagina.goto(`${base}/en/`); await limparIDB(pagina); await pagina.reload(); await prontaHoje(pagina);
    assert.equal(await pagina.getAttribute("html", "lang"), "en");
    assert.equal(await pagina.title(), "Today · Fitrich");
    assert.equal(await pagina.locator(".vazio-hoje h2").textContent(), "Start wherever feels right");
    assert.equal(await pagina.locator("#fab").textContent(), "Add");
    await pagina.click(".vazio-hoje button:has-text('sample')");
    await pagina.waitForSelector(".heroi .gran");
    assert.match(await pagina.locator(".heroi").textContent(), /Safe to spend/);
    await invariantes(pagina, "en 390 escuro");
    await captura(pagina, "07-en-exemplo-390-escuro");
    await pagina.click("#fab"); await pagina.waitForSelector("dialog.lancar[open]");
    await pagina.fill("#l-texto", "lunch 32.50 groceries yesterday");
    assert.equal(await pagina.inputValue("#l-valor"), "32.50");
    assert.equal(await pagina.locator("label.chip.marcado").textContent(), "Groceries");
    await invariantes(pagina, "en lançar");
    await captura(pagina, "08-en-lancar-390-escuro");
    await pagina.keyboard.press("Escape");
    // Clicar em PT guarda a escolha e vai para /.
    await pagina.click(".idioma a[data-idioma='pt-BR']");
    await pagina.waitForURL((u) => u.pathname === "/"); await prontaHoje(pagina);
    assert.equal(await pagina.evaluate(() => localStorage.getItem("fitrich-idioma")), "pt-BR");
    assert.equal(await pagina.getAttribute("html", "lang"), "pt-BR");
    // Preferência en guardada + abrir / → vai para /en/ (sem piscar: é o script síncrono do <head>).
    await pagina.evaluate(() => localStorage.setItem("fitrich-idioma", "en"));
    await pagina.goto("about:blank"); // sair da página: só mudar o hash não recarrega e o script do <head> não roda
    await pagina.goto(`${base}/#/metas`);
    await pagina.waitForURL(`${base}/en/#/metas`);
    assert.equal(await pagina.getAttribute("html", "lang"), "en");
    assert.deepEqual(erros, []);
    await contexto.close();
  }

  // ---- 6. Tema: botão alterna e persiste. ----
  {
    const { contexto, pagina, erros } = await novaPagina({ tema: "light" });
    await pagina.goto(`${base}/`); await limparIDB(pagina); await pagina.reload(); await prontaHoje(pagina);
    assert.equal(await pagina.getAttribute("html", "data-gs-theme"), "light");
    await pagina.click("#tema");
    assert.equal(await pagina.getAttribute("html", "data-gs-theme"), "dark");
    assert.equal(await pagina.evaluate(() => localStorage.getItem("gs-prisma-theme")), "dark");
    await pagina.reload(); await prontaHoje(pagina);
    assert.equal(await pagina.getAttribute("html", "data-gs-theme"), "dark", "tema persistiu (aplicado no <head>, antes da pintura)");
    assert.deepEqual(erros, []);
    await contexto.close();
  }

  // ---- 7. Integração: tela de outro dono entra pelo contrato; tela inexistente vira "em breve". 1024px. ----
  {
    const { contexto, pagina, erros } = await novaPagina({ largura: 1024, altura: 800, tema: "light" });
    await pagina.goto(`${base}/`); await limparIDB(pagina); await pagina.reload(); await prontaHoje(pagina);
    await pagina.click(".vazio-hoje button:has-text('exemplo')");
    await pagina.waitForSelector(".heroi .gran");
    assert.ok(await pagina.isVisible("#nav-lateral"), "navegação lateral em 1024px");
    assert.ok(!(await pagina.isVisible("#nav-inferior")), "sem navegação inferior em 1024px");
    const caixa = await pagina.locator("#vista").boundingBox();
    assert.ok(caixa.x >= 232 && caixa.width >= 600, `conteúdo à direita da lateral (x=${caixa.x}, largura=${caixa.width})`);
    await invariantes(pagina, "1024 claro exemplo");
    await captura(pagina, "09-exemplo-1024-claro");
    await pagina.click("#nav-lateral a[data-tela='financas']");
    await pagina.waitForSelector(".tela-financas");
    assert.equal(await pagina.locator("#titulo-tela").textContent(), "Finanças", "título da tela vem do dicionário dela");
    assert.ok(await pagina.evaluate(() => ["/css/financas-comum.css", "/css/financas.css"].every((c) => [...document.styleSheets].some((s) => s.href?.endsWith(c)))), "CSS comum e da tela injetados, sem @import");
    // mudar() re-renderiza a tela atual via atualizar(): apagar todos os treinos não pode quebrar a Finanças.
    await pagina.evaluate(() => globalThis.__fitrich.mudar((d) => ({ ...d, treinos: d.treinos.slice(1) })));
    await pagina.waitForSelector(".tela-financas");
    await invariantes(pagina, "tela integrada");
    await captura(pagina, "10-tela-integrada-1024-claro");
    await pagina.click("#nav-lateral a[data-tela='cartoes']");
    await pagina.waitForSelector(".tela-cartoes");
    assert.equal(await pagina.locator("#nav-lateral a[data-tela='cartoes'] .em-breve").count(), 0, "tela pronta não é marcada como em breve");
    // Rota desconhecida cai em Hoje.
    await pagina.goto(`${base}/#/nao-existe`); await prontaHoje(pagina);
    assert.equal(await pagina.evaluate(() => location.hash), "#/hoje");
    // O exemplo vive só na memória: depois do reload o app está vazio de novo (prova de que nada foi gravado).
    assert.equal(await pagina.locator(".vazio-hoje").count(), 1);
    await pagina.click(".vazio-hoje button:has-text('exemplo')"); await pagina.waitForSelector(".heroi .gran");
    await pagina.setViewportSize({ width: 390, height: 844 });
    await pagina.click("#nav-inferior button:has-text('Mais')");
    await pagina.waitForSelector("dialog[open] .menu-mais");
    await invariantes(pagina, "menu mais 390");
    await captura(pagina, "12-menu-mais-390-claro");
    await pagina.keyboard.press("Escape");
    await pagina.click("#fab"); await pagina.waitForSelector("dialog.lancar[open]");
    await pagina.setViewportSize({ width: 1024, height: 800 });
    await pagina.fill("#l-valor", "899,70");
    await pagina.click("button.chip.mais"); // Vestuário está fora das 8 mais usadas
    await pagina.click("label.chip:has-text('Vestuário')");
    await pagina.click(".mais-opcoes summary");
    await pagina.selectOption("#l-pagar", { index: 1 });
    await pagina.selectOption("#l-parc", "3");
    await invariantes(pagina, "lançar 1024");
    await captura(pagina, "13-lancar-parcelas-1024-claro");
    await pagina.click("button.salvar");
    await pagina.waitForSelector(".feito:not([hidden]) .feito-linha");
    const parc = await pagina.evaluate(() => { const d = globalThis.__fitrich.estado(); const ps = d.lancamentos.filter((l) => l.parcela && l.centavos === 29990); return { n: ps.length, de: ps[0]?.parcela.de, faturas: ps.map((l) => l.fatura).sort() }; });
    assert.equal(parc.n, 3); assert.equal(parc.de, 3); assert.equal(new Set(parc.faturas).size, 3, "uma parcela por fatura");
    assert.deepEqual(erros, []);
    await contexto.close();
  }

  console.log(JSON.stringify({ ...resumo, chromium: navegador.version() }, null, 1));
  console.log("OK: shell do Fitrich v2 no navegador");
} finally {
  await navegador.close();
  servidor.close();
}
