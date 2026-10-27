// Teste de navegador da tela Nutrição (Playwright + Chromium). Sai com 0 se tudo passar. Capturas em capturas/.
// Rodar da raiz do repo:
//   NODE_PATH=<node_modules global com playwright> PLAYWRIGHT_BROWSERS_PATH=<pasta dos navegadores> node tests/ui/nutricao.navegador.mjs
import assert from "node:assert/strict";
import http from "node:http";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { idadeEm, metaNutricional } from "../../app/js/v2/nutricao/energia.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FITRICH = path.resolve(AQUI, "..", "..", "app");
const CAPTURAS = path.join(AQUI, "capturas");
mkdirSync(CAPTURAS, { recursive: true });
const TIPOS = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

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
const resumo = { capturas: [], toquesParaRegistrar: null };

async function novaPagina({ largura = 390, altura = 844, tema = "light" } = {}) {
  const contexto = await navegador.newContext({ viewport: { width: largura, height: altura }, colorScheme: tema, locale: "pt-BR" });
  const pagina = await contexto.newPage();
  const erros = [];
  pagina.on("pageerror", (e) => erros.push(`pageerror: ${e}`));
  pagina.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") erros.push(`${m.type()}: ${m.text()} (${m.location()?.url})`); });
  pagina.on("requestfailed", (r) => { if (r.failure()?.errorText !== "net::ERR_ABORTED") erros.push(`request: ${r.url()} ${r.failure()?.errorText}`); });
  await contexto.addInitScript(() => { try { if (sessionStorage.getItem("ini")) return; sessionStorage.setItem("ini", "1"); localStorage.clear(); } catch { /* sem storage */ } });
  return { contexto, pagina, erros };
}
const limparIDB = (p) => p.evaluate(() => new Promise((res, rej) => { const r = indexedDB.deleteDatabase("fitrich"); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }));
async function abrir(pagina, idioma = "pt") {
  await pagina.goto(`${base}/${idioma === "en" ? "en/" : ""}`); await limparIDB(pagina); await pagina.reload();
  // Espera a Hoje terminar de montar: trocar de rota no meio dela deixa o shell registrar chave de Hoje como faltando (corrida do shell, não da Nutrição).
  await pagina.waitForSelector("#vista .hoje", { timeout: 15000 });
}
async function irNutricao(pagina, aba = null) {
  await pagina.evaluate(() => { location.hash = "#/nutricao"; });
  await pagina.waitForSelector(".tela-nutricao .segmentos", { timeout: 15000 });
  await pagina.waitForFunction(() => document.fonts.status === "loaded");
  if (aba) { await pagina.click(`.tela-nutricao .segmentos button:nth-child(${aba})`); }
}
// `style=""` vazio aparece em campos que o Playwright acabou de preencher (o Chromium deixa o atributo ao limpar uma propriedade
// temporária); o que a CSP proíbe é estilo COM conteúdo, e é isso que o teste cobra. O código da tela nunca toca em `.style`.
async function invariantes(pagina, rotulo) {
  const r = await pagina.evaluate(() => ({ faltando: globalThis.__fitrich.faltando(), comStyle: [...document.querySelectorAll("[style]")].filter((e) => e.getAttribute("style").trim() !== "").map((e) => e.outerHTML.slice(0, 80)), estouro: document.documentElement.scrollWidth - document.documentElement.clientWidth, curtos: [...document.querySelectorAll(".tela-nutricao button, .tela-nutricao input, .tela-nutricao select")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.height < 43.5 && e.type !== "checkbox" && e.type !== "hidden"; }).map((e) => (e.textContent || e.name || e.id).slice(0, 30)) }));
  assert.deepEqual(r.faltando, [], `${rotulo}: chaves de tradução faltando`);
  assert.deepEqual(r.comStyle, [], `${rotulo}: atributo style no DOM`);
  assert.ok(r.estouro <= 0, `${rotulo}: estouro horizontal de ${r.estouro}px`);
  assert.deepEqual(r.curtos, [], `${rotulo}: alvos com menos de 44 px`);
}
async function captura(pagina, nome) { const arq = path.join(CAPTURAS, `nutricao-${nome}.png`); await pagina.evaluate(() => window.scrollTo(0, 0)); await pagina.screenshot({ path: arq, fullPage: true, animations: "disabled" }); resumo.capturas.push(nome); }

// Semeia peso, perfil e refeições de ontem pelo próprio `mudar` do app (mesmas funções imutáveis do esquema).
async function semear(pagina, { perfil = true, ontem = true } = {}) {
  await pagina.evaluate(async ({ perfil, ontem }) => {
    const E = await import("/js/v2/esquema.mjs"), D = await import("/js/v2/nutricao/diario.mjs"), A = await import("/js/v2/nutricao/alimentos.mjs"), B = await import("/js/v2/nutricao/base-alimentos.mjs");
    const base = A.criarBase(B), f = globalThis.__fitrich;
    const hoje = new Date(), iso = (n) => { const d = new Date(hoje); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
    await f.mudar((d) => {
      let x = d, n = 0;
      const id = () => `sem-${++n}`;
      if (perfil) {
        x = E.definir(x, "perfil", { sexo: "m", alturaCm: 180, nascimento: "1990-06-15", nutricao: { atividade: "moderado", objetivo: "perder" } });
        for (let k = 0; k < 28; k++) x = E.adicionar(x, "pesos", { data: iso(-27 + k), kg: Math.round((81 - 0.04 * k + (k % 3 === 0 ? 0.4 : -0.2)) * 10) / 10 }, { novoId: id });
      }
      if (ontem) for (const [a, g, r] of [[3, 150, "almoco"], [561, 100, "almoco"], [410, 100, "almoco"], [488, 100, "cafe"], [182, 70, "lanche"]]) x = E.adicionar(x, "refeicoes", D.novoRegistro({ alimento: base.obter(a), gramas: g, data: iso(-1), refeicao: r, id: id(), agora: () => new Date().toISOString() }), { novoId: id });
      return x;
    });
  }, { perfil, ontem });
}

try {
  // ---- 1. Registro em 2 toques (alimento popular → Adicionar), repetir ontem, água, desfazer, remover. ----
  {
    const { contexto, pagina, erros } = await novaPagina();
    await abrir(pagina); await irNutricao(pagina);
    assert.match(await pagina.locator(".tela-nutricao .heroi").textContent(), /Definir minhas metas/);
    await pagina.waitForSelector(".tela-nutricao .achado");
    assert.ok((await pagina.locator(".tela-nutricao .achado").count()) >= 8, "populares à vista sem digitar");
    await invariantes(pagina, "hoje vazio 390");
    await captura(pagina, "01-vazio-390-claro");
    let toques = 0;
    await pagina.locator(".tela-nutricao .achado").first().click(); toques++;                 // toque 1: o alimento
    await pagina.waitForSelector(".tela-nutricao .quantidade:not([hidden])");
    await pagina.locator(".tela-nutricao .salvar-nut").click(); toques++;                     // toque 2: adicionar (quantidade e refeição já vêm preenchidas)
    await pagina.waitForFunction(() => globalThis.__fitrich.estado().refeicoes?.length === 1);
    resumo.toquesParaRegistrar = toques;
    assert.ok(toques <= 3);
    const r = await pagina.evaluate(() => globalThis.__fitrich.estado().refeicoes[0]);
    assert.equal(r.alimentoId, "3"); assert.ok(r.kcal > 0 && r.gramas > 0);
    assert.match(await pagina.locator(".tela-nutricao .sec-lista").textContent(), /Arroz branco, cozido/);
    // Busca sem acento e escolha de medida caseira: 2 colheres de servir de arroz = 100 g.
    await pagina.fill("#nut-busca", "feijao preto");
    await pagina.locator(".tela-nutricao .achado").first().click();
    await pagina.selectOption("select[name=nmedida]", "concha");
    await pagina.fill("#nut-qtd", "2");
    assert.match(await pagina.locator(".tela-nutricao .previa").textContent(), /^200 g/);
    await pagina.locator(".tela-nutricao .salvar-nut").click();
    await pagina.waitForFunction(() => globalThis.__fitrich.estado().refeicoes?.length === 2);
    assert.equal(await pagina.evaluate(() => globalThis.__fitrich.estado().refeicoes.find((x) => x.alimentoId === "567").gramas), 200);
    // Água e desfazer.
    await pagina.click(".tela-nutricao .sec-agua button:has-text('+ 300 ml')");
    await pagina.waitForFunction(() => globalThis.__fitrich.estado().refeicoes?.length === 3);
    await pagina.click(".tela-nutricao .desfazer button");
    await pagina.waitForFunction(() => globalThis.__fitrich.estado().refeicoes?.length === 2);
    // Remover.
    await pagina.locator(".tela-nutricao .sec-lista button[aria-label^='Remover']").first().click();
    await pagina.waitForFunction(() => globalThis.__fitrich.estado().refeicoes?.length === 1);
    // Alimento próprio.
    await pagina.click(".tela-nutricao .alternador");
    await pagina.fill("input[name=pnome]", "Marmita da empresa"); await pagina.fill("input[name=pkcal]", "650");
    await pagina.click("#form-proprio button[type=submit]");
    await pagina.waitForFunction(() => globalThis.__fitrich.estado().refeicoes?.some((x) => x.nome === "Marmita da empresa" && x.kcal === 650));
    await invariantes(pagina, "hoje com registros 390");
    await captura(pagina, "02-hoje-registros-390-claro");
    assert.deepEqual(erros, []);
    await contexto.close();
  }

  // ---- 2. Repetir ontem, metas pelo formulário, adaptação e as 4 visões, nos dois idiomas e temas. ----
  for (const [idioma, tema, largura, altura] of [["pt", "light", 390, 844], ["pt", "dark", 1024, 900], ["en", "dark", 390, 844], ["en", "light", 1024, 900]]) {
    const rot = `${idioma}-${tema}-${largura}`;
    const { contexto, pagina, erros } = await novaPagina({ largura, altura, tema });
    await abrir(pagina, idioma);
    await semear(pagina, { perfil: false });
    await irNutricao(pagina);
    await pagina.click(".tela-nutricao .chip-acao");
    await pagina.waitForFunction(() => globalThis.__fitrich.estado().refeicoes.filter((x) => x.data === new Date().toLocaleDateString("sv")).length === 5);
    // Metas pelo formulário (peso vem das pesagens semeadas).
    await semear(pagina, { perfil: false, ontem: false }).catch(() => {});
    await pagina.evaluate(async () => { const E = await import("/js/v2/esquema.mjs"); const f = globalThis.__fitrich; const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv"); }; await f.mudar((d) => { let x = d; for (let k = 0; k < 28; k++) x = E.adicionar(x, "pesos", { data: iso(-27 + k), kg: Math.round((81 - 0.04 * k + (k % 3 === 0 ? 0.4 : -0.2)) * 10) / 10 }, { novoId: () => `p-${k}` }); return x; }); });
    await pagina.click(".tela-nutricao .segmentos button:nth-child(3)");
    assert.match(await pagina.locator(".tela-nutricao .aviso").first().textContent(), idioma === "en" ? /height|birth|activity/ : /altura|nascimento|atividade/);
    await pagina.selectOption("select[name=msexo]", "m"); await pagina.fill("input[name=malt]", "180"); await pagina.fill("input[name=mnasc]", "1990-06-15");
    await pagina.selectOption("select[name=mativ]", "moderado"); await pagina.selectOption("select[name=mobj]", "perder");
    await pagina.click("#form-metas button[type=submit]");
    await pagina.waitForSelector(".tela-nutricao .sec-meta");
    const estadoMeta = await pagina.evaluate(() => { const d = globalThis.__fitrich.estado(); return { hoje: new Date().toLocaleDateString("sv"), kg: d.pesos[d.pesos.length - 1].kg }; });
    const alvoTela = Number((await pagina.locator(".tela-nutricao .sec-meta .gran").textContent()).replace(/\D/g, ""));
    const esperado = metaNutricional({ sexo: "m", kg: 80, cm: 180, idade: idadeEm("1990-06-15", estadoMeta.hoje), atividade: "moderado", objetivo: "perder" }).alvoKcal;
    assert.ok(Math.abs(alvoTela - esperado) <= 60, `alvo na tela ${alvoTela} longe do calculado para ~80 kg (${esperado})`); // peso tendência varia ±1 kg
    assert.ok(alvoTela >= 1500, "piso");
    assert.match(await pagina.locator(".tela-nutricao .sec-adapt").textContent(), idioma === "en" ? /weight|Weight/ : /peso|Peso/);
    await invariantes(pagina, `metas ${rot}`);
    await captura(pagina, `03-metas-${rot}`);
    await pagina.click(".tela-nutricao details.formula summary");
    await invariantes(pagina, `metas formula ${rot}`);
    // Hoje com meta.
    await pagina.click(".tela-nutricao .segmentos button:nth-child(1)");
    await pagina.waitForSelector(".tela-nutricao .macros");
    assert.equal(await pagina.locator(".tela-nutricao .macro").count(), 4);
    assert.ok((await pagina.locator(".tela-nutricao .macro .estado").count()) === 4, "estado com ícone + texto em cada macro (nunca só cor)");
    await invariantes(pagina, `hoje ${rot}`);
    await captura(pagina, `04-hoje-meta-${rot}`);
    // Semana.
    await pagina.click(".tela-nutricao .segmentos button:nth-child(2)");
    await pagina.waitForSelector(".tela-nutricao svg.grafico");
    assert.match(await pagina.locator(".tela-nutricao .sec-consistencia").textContent(), idioma === "en" ? /of the last \d+ full weeks? in range/ : /das últimas \d+ semanas? completas? na faixa/);
    assert.ok(await pagina.locator(".tela-nutricao .sec-semana details.tab").count() === 1, "tabela-irmã do gráfico");
    await invariantes(pagina, `semana ${rot}`);
    await captura(pagina, `05-semana-${rot}`);
    // Dinheiro (opt-in).
    await pagina.click(".tela-nutricao .segmentos button:nth-child(4)");
    assert.equal(await pagina.locator(".tela-nutricao .sec-dinheiro .grade").count(), 0, "desligado por padrão: nenhum número de gasto aparece");
    await pagina.click(".tela-nutricao .sec-dinheiro input[type=checkbox]");
    await pagina.waitForSelector(".tela-nutricao .sec-dinheiro .grade");
    assert.equal(await pagina.evaluate(() => globalThis.__fitrich.estado().perfil.cruzamentoDelivery), true);
    await invariantes(pagina, `dinheiro ${rot}`);
    await captura(pagina, `06-dinheiro-${rot}`);
    assert.doesNotMatch(await pagina.locator("#vista").textContent(), /estour|falhou|sequência|seguidas|streak|atrasad|culpa|failed|streak/i);
    assert.deepEqual(erros, [], rot);
    await contexto.close();
  }

  // ---- 3. Banco antigo (store v1, sem `refeicoes`) abre, ganha a store e não perde dado. ----
  {
    const { contexto, pagina, erros } = await novaPagina();
    await pagina.goto(`${base}/favicon.svg`); // mesma origem, sem o app aberto: ele recriaria o banco em v2 logo após o delete
    await limparIDB(pagina);
    await pagina.evaluate(() => new Promise((res, rej) => { const r = indexedDB.open("fitrich", 1); r.onupgradeneeded = () => { const b = r.result; b.createObjectStore("meta", { keyPath: "chave" }); b.createObjectStore("lancamentos", { keyPath: "id" }); }; r.onsuccess = () => { r.result.close(); res(); }; r.onerror = () => rej(r.error); }));
    await pagina.goto(`${base}/`); await pagina.waitForSelector("#vista");
    await pagina.evaluate(() => { location.hash = "#/nutricao"; });
    await pagina.waitForSelector(".tela-nutricao");
    assert.equal(await pagina.evaluate(() => new Promise((res) => { const r = indexedDB.open("fitrich"); r.onsuccess = () => { const v = [r.result.version, r.result.objectStoreNames.contains("refeicoes")]; r.result.close(); res(v); }; })).then((v) => v.join()), "2,true");
    assert.deepEqual(erros.filter((e) => !/Failed to load resource|404/.test(e)), []);
    await contexto.close();
  }
  console.log(JSON.stringify(resumo));
} finally {
  await navegador.close(); servidor.close();
}
