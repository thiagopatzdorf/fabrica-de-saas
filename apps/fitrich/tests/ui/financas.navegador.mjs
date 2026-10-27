// Teste de navegador das telas Finanças e Cartões (Chromium headless via Playwright) sobre o harness mínimo
// (`harness.html`) com o `ctx` real e os dados de exemplo. Para cada tela × 390/1024 px × claro/escuro × pt-BR/en:
// sem erro de console, sem estouro horizontal, `i18n.faltando()` vazio, nenhum atributo `style` no DOM, alvos
// interativos ≥ 44 px, e uma captura em CAPTURAS (padrão: pasta `capturas/` ao lado deste arquivo) para OLHAR.
// Depois, as interações: editar, apagar + Desfazer, classificar, confirmar previsto, limites, pagar fatura,
// estornar, novo cartão. Fora do `node --test` de propósito (precisa de Playwright e Chromium). Rodar:
//   PLAYWRIGHT_BROWSERS_PATH=<pasta dos browsers> NODE_PATH=<node_modules global> node tests/ui/financas.navegador.mjs
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FITRICH = path.resolve(AQUI, "..", "..", "app");
const CAPTURAS = process.env.CAPTURAS ?? path.join(AQUI, "capturas");
const raizGlobal = process.env.NODE_PATH?.split(path.delimiter)[0] ?? execSync("npm root -g").toString().trim();
const { chromium } = createRequire(path.join(raizGlobal, path.sep))("playwright");
const TIPOS = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    // /_teste/* → esta pasta; /app/* → o app (é como os imports relativos de dados-exemplo.mjs chegam ao navegador).
    const base = url.pathname.startsWith("/_teste/") ? AQUI : FITRICH, rel = url.pathname.replace(/^\/_teste\//, "/").replace(/^\/app\//, "/");
    const arq = path.join(base, path.normalize(rel));
    if (!arq.startsWith(base)) throw new Error("fora da pasta");
    const corpo = await readFile(arq); // lê antes de responder: arquivo que não existe vira 404 limpo
    res.writeHead(200, { "content-type": TIPOS[path.extname(arq)] ?? "application/octet-stream" });
    res.end(corpo);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${servidor.address().port}`;
mkdirSync(CAPTURAS, { recursive: true });

const navegador = await chromium.launch();
const relatorio = { paginas: [], interacoes: [], chromium: navegador.version() };
let falhas = 0;
const falha = (msg) => { falhas += 1; console.error("FALHA:", msg); };

async function abrir({ tela, largura, tema, idioma, vazio = false }) {
  const pagina = await navegador.newPage({ viewport: { width: largura, height: 900 }, colorScheme: tema });
  const erros = [];
  pagina.on("pageerror", (e) => erros.push(String(e)));
  pagina.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") erros.push(`${m.type()}: ${m.text()}`); });
  await pagina.goto(`${base}/_teste/harness.html?tela=${tela}&tema=${tema}&idioma=${idioma}${vazio ? "&vazio=1" : ""}`);
  await pagina.waitForFunction(() => window.harness?.pronto, null, { timeout: 15000 });
  return { pagina, erros };
}

// Medidas que não dependem de olhar: estouro, style, faltando, alvos de toque.
async function medir(pagina) {
  return pagina.evaluate(() => {
    const doc = document.documentElement;
    const alvos = [...document.querySelectorAll('button, select, input:not([type="checkbox"]), summary, a[href]')].filter((el) => el.offsetParent !== null && !el.closest("dialog"));
    const pequenos = alvos.map((el) => { const r = el.getBoundingClientRect(); return { tag: el.tagName, classe: el.className, w: Math.round(r.width), h: Math.round(r.height), texto: el.textContent.trim().slice(0, 30) }; }).filter((a) => a.h < 44 || a.w < 44);
    const svgs = [...document.querySelectorAll("svg.grafico")];
    return {
      estouro: doc.scrollWidth - doc.clientWidth,
      styles: document.querySelectorAll("[style]").length,
      faltando: window.harness.faltando(),
      pequenos,
      graficos: svgs.length,
      graficosSemTitulo: svgs.filter((s) => !s.querySelector("title")?.textContent || !s.querySelector("desc")?.textContent).length,
      tabelas: document.querySelectorAll("details.fin-tabela table").length,
      textoColchete: [...document.body.querySelectorAll("*")].filter((e) => e.children.length === 0 && /\[[a-z]+\.[a-z_.]+\]/.test(e.textContent)).length,
      palavrasProibidas: ["estourou", "falhou", "culpa", "streak"].filter((p) => document.body.textContent.toLowerCase().includes(p)),
    };
  });
}

for (const tela of ["financas", "cartoes"]) for (const largura of [390, 1024]) for (const tema of ["light", "dark"]) for (const idioma of ["pt-BR", "en"]) {
  const nome = `${tela}-${largura}-${tema}-${idioma}`;
  const { pagina, erros } = await abrir({ tela, largura, tema, idioma });
  const m = await medir(pagina);
  await pagina.screenshot({ path: path.join(CAPTURAS, `${nome}.png`), fullPage: true });
  const r = { nome, erros, ...m };
  relatorio.paginas.push(r);
  if (erros.length) falha(`${nome}: erros de console ${JSON.stringify(erros)}`);
  if (m.estouro > 0) falha(`${nome}: estouro horizontal de ${m.estouro}px`);
  if (m.styles) falha(`${nome}: ${m.styles} elemento(s) com atributo style`);
  if (m.faltando.length) falha(`${nome}: chaves faltando ${JSON.stringify(m.faltando)}`);
  if (m.pequenos.length) falha(`${nome}: alvos < 44px ${JSON.stringify(m.pequenos)}`);
  if (m.graficosSemTitulo) falha(`${nome}: ${m.graficosSemTitulo} gráfico(s) sem title/desc`);
  if (m.textoColchete) falha(`${nome}: texto [chave] na tela`);
  if (m.palavrasProibidas.length) falha(`${nome}: palavras proibidas ${m.palavrasProibidas}`);
  await pagina.close();
}

// App vazio: as duas telas precisam ficar de pé sem dado nenhum.
for (const tela of ["financas", "cartoes"]) {
  const { pagina, erros } = await abrir({ tela, largura: 390, tema: "light", idioma: "pt-BR", vazio: true });
  const m = await medir(pagina);
  await pagina.screenshot({ path: path.join(CAPTURAS, `${tela}-vazio.png`), fullPage: true });
  if (erros.length || m.faltando.length || m.styles || m.estouro > 0) falha(`${tela} vazio: ${JSON.stringify({ erros, ...m })}`);
  await pagina.close();
}

// ---------- interações: Finanças ----------
{
  const { pagina, erros } = await abrir({ tela: "financas", largura: 390, tema: "light", idioma: "pt-BR" });
  const estado = () => pagina.evaluate(() => window.harness.estado());
  const mudancas = () => pagina.evaluate(() => window.harness.mudancas);
  const idPrimeiro = await pagina.evaluate(() => document.querySelector(".fin-lanc")?.dataset.id);

  // Editar: muda a descrição pelo diálogo e grava por `editar` do esquema.
  await pagina.locator(".fin-lanc").first().getByRole("button", { name: /^Editar/ }).click();
  await pagina.waitForSelector("dialog[open]");
  await pagina.locator("dialog[open] input[name=descricao]").fill("Editado pelo teste");
  await pagina.locator("dialog[open] button[type=submit]").click();
  await pagina.waitForFunction(() => !document.querySelector("dialog[open]"));
  const editado = (await estado()).lancamentos.find((l) => l.id === idPrimeiro);
  assert.equal(editado.descricao, "Editado pelo teste", "edição gravou");
  assert.equal(await mudancas(), 1);
  relatorio.interacoes.push("editar: ok");

  // Apagar + Desfazer: some da lista na hora, só grava depois de 5 s; Desfazer traz de volta sem gravar.
  await pagina.locator(`.fin-lanc[data-id="${idPrimeiro}"]`).getByRole("button", { name: /^Apagar/ }).click();
  assert.equal(await pagina.locator(`.fin-lanc[data-id="${idPrimeiro}"]`).count(), 0, "linha sumiu na hora");
  assert.equal(await mudancas(), 1, "ainda não gravou");
  await pagina.getByRole("button", { name: "Desfazer" }).click();
  assert.equal(await pagina.locator(`.fin-lanc[data-id="${idPrimeiro}"]`).count(), 1, "Desfazer trouxe de volta");
  assert.equal(await mudancas(), 1);
  await pagina.locator(`.fin-lanc[data-id="${idPrimeiro}"]`).getByRole("button", { name: /^Apagar/ }).click();
  await pagina.waitForFunction((id) => !window.harness.estado().lancamentos.some((l) => l.id === id), idPrimeiro, { timeout: 8000 });
  assert.equal(await mudancas(), 2, "apagou de verdade depois do prazo");
  relatorio.interacoes.push("apagar + desfazer: ok");

  // Classificar em dois toques: o select da linha sem categoria grava a categoria.
  const semCatAntes = await pagina.locator(".fin-lanc.is-sem-categoria").count();
  assert.equal(semCatAntes, 2);
  await pagina.locator(".fin-lanc.is-sem-categoria .fin-classificar select").first().selectOption("cat-mercado");
  await pagina.waitForFunction(() => document.querySelectorAll(".fin-lanc.is-sem-categoria").length === 1);
  relatorio.interacoes.push("classificar: ok");

  // Confirmar previsto: muda a visão para o mês do aluguel previsto (outubro já é o mês) e confirma.
  const previstosAntes = (await estado()).lancamentos.filter((l) => l.status === "previsto").length;
  await pagina.getByRole("button", { name: "Confirmar" }).first().click();
  await pagina.waitForFunction((n) => window.harness.estado().lancamentos.filter((l) => l.status === "previsto").length === n - 1, previstosAntes);
  relatorio.interacoes.push("confirmar previsto: ok");

  // Período: 30 dias fica pressionado; voltar ao mês pelo seletor.
  const periodo = pagina.getByRole("group", { name: "Período rápido" });
  await periodo.getByRole("button", { name: "30 dias" }).click();
  assert.equal(await periodo.getByRole("button", { name: "30 dias" }).getAttribute("aria-pressed"), "true");
  await pagina.locator("#fin-mes").selectOption("2026-09");
  assert.equal(await periodo.getByRole("button", { name: "30 dias" }).getAttribute("aria-pressed"), "false");
  assert.ok((await pagina.locator(".fin-sec h3").first().textContent()).includes("setembro"));
  relatorio.interacoes.push("período: ok");

  // Busca sem acento.
  await pagina.locator("#fin-busca").fill("ACADEMIA");
  await pagina.waitForFunction(() => document.querySelectorAll(".fin-lanc").length === 1);
  await pagina.locator("#fin-busca").fill("");

  // Limites: define um valor novo pelo diálogo.
  await pagina.getByRole("button", { name: "Editar limites" }).click();
  await pagina.waitForSelector("dialog[open]");
  await pagina.locator('dialog[open] input[name="lim:cat-mercado"]').fill("950,00");
  await pagina.locator("dialog[open] button[type=submit]").click();
  await pagina.waitForFunction(() => window.harness.estado().orcamento.limites["cat-mercado"] === 95000);
  relatorio.interacoes.push("limites: ok");

  // Fluxo 90 dias.
  await pagina.getByRole("group", { name: "Janela da projeção" }).getByRole("button", { name: "90 dias" }).click();
  assert.ok((await pagina.locator(".fin-fluxo-resumo").textContent()).includes("90"));
  const m = await medir(pagina);
  if (m.styles || m.faltando.length || erros.length) falha(`financas após interações: ${JSON.stringify({ erros, styles: m.styles, faltando: m.faltando })}`);
  await pagina.screenshot({ path: path.join(CAPTURAS, "financas-apos-interacoes.png"), fullPage: true });
  await pagina.evaluate(() => window.harness.destruir());
  await pagina.close();
}

// ---------- interações: Cartões ----------
{
  const { pagina, erros } = await abrir({ tela: "cartoes", largura: 390, tema: "dark", idioma: "pt-BR" });
  const estado = () => pagina.evaluate(() => window.harness.estado());

  // Pagar fatura vencida: vira transferência conta → cartão com `fatura`, e o bloco "a pagar" some.
  assert.equal(await pagina.locator(".car-apagar").count(), 1);
  assert.ok((await pagina.locator(".car-rotativo").textContent()).includes("média de mercado"), "rotativo rotulado como média de mercado");
  await pagina.getByRole("button", { name: "Pagar fatura" }).click();
  await pagina.waitForSelector("dialog[open]");
  await pagina.locator("dialog[open] button[type=submit]").click();
  await pagina.waitForFunction(() => !document.querySelector("dialog[open]"));
  const pago = (await estado()).lancamentos.filter((l) => l.tipo === "transferencia" && l.fatura === "2026-09");
  assert.equal(pago.length, 1); assert.equal(pago[0].contaId, "conta-cc"); assert.equal(pago[0].cartaoId, "cartao-roxo");
  assert.ok((await estado()).faturas.some((f) => f.ym === "2026-09" && f.status === "paga"));
  assert.equal(await pagina.locator(".car-apagar").count(), 0);
  assert.ok((await pagina.locator(".fin-aviso").textContent()).includes("registrado"));
  relatorio.interacoes.push("pagar fatura: ok");

  // Estornar a parcela 2/6 do tênis: as 4 restantes ficam canceladas, nada é apagado.
  const antes = (await estado()).lancamentos.length;
  await pagina.locator("details").filter({ hasText: "na fatura atual" }).locator("summary").click();
  await pagina.locator(".car-itens li").filter({ hasText: "Tênis" }).getByRole("button").click();
  await pagina.waitForSelector("dialog[open]");
  await pagina.locator("dialog[open] button[type=submit]").click();
  await pagina.waitForFunction(() => !document.querySelector("dialog[open]"));
  const depois = await estado();
  assert.equal(depois.lancamentos.length, antes + 1, "só o estorno entrou");
  assert.equal(depois.lancamentos.filter((l) => l.status === "cancelado").length, 4, "parcelas 3 a 6 canceladas");
  assert.ok(depois.lancamentos.every((l) => l.atualizadoEm), "estorno e canceladas carimbadas");
  relatorio.interacoes.push("estornar: ok");

  // Novo cartão e edição.
  await pagina.getByRole("button", { name: "Novo cartão" }).click();
  await pagina.waitForSelector("dialog[open]");
  await pagina.locator("dialog[open] input[name=nome]").fill("Cartão Teste");
  await pagina.locator("dialog[open] input[name=limite]").fill("2.000,00");
  await pagina.locator("dialog[open] button[type=submit]").click();
  await pagina.waitForFunction(() => window.harness.estado().cartoes.length === 2);
  assert.equal((await estado()).cartoes[1].limiteCentavos, 200000);
  relatorio.interacoes.push("novo cartão: ok");

  // Calendário: mês seguinte.
  await pagina.getByRole("button", { name: "Mês seguinte" }).click();
  assert.ok((await pagina.locator(".car-calendario h3").textContent()).includes("novembro"));
  const m = await medir(pagina);
  if (m.styles || m.faltando.length || erros.length || m.estouro > 0) falha(`cartoes após interações: ${JSON.stringify({ erros, ...m })}`);
  await pagina.screenshot({ path: path.join(CAPTURAS, "cartoes-apos-interacoes.png"), fullPage: true });
  await pagina.close();
}

await navegador.close();
servidor.close();
console.log(JSON.stringify({ ...relatorio, paginas: relatorio.paginas.map((p) => ({ nome: p.nome, graficos: p.graficos, tabelas: p.tabelas, estouro: p.estouro, erros: p.erros.length })) }, null, 1));
if (falhas) { console.error(`${falhas} falha(s)`); process.exit(1); }
console.log(`OK: ${relatorio.paginas.length} páginas + ${relatorio.interacoes.length} interações; capturas em ${CAPTURAS}`);
