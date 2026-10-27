// Teste de navegador da tela Plano (ver LEIA-ME.md) num Chromium headless (Playwright) sobre o app real:
// 390 e 1024 px, claro e escuro, pt-BR e /en/. Para cada combinação e cada uma das cinco abas: sem erro de
// console, sem estouro horizontal, `faltando()` vazio, nenhum `style=` no DOM, todo campo com <label>, todo
// gráfico com <title>/<desc>, alvos de clique >= 44 px. Depois, ponta a ponta: a renda digitada vira
// `perfil.plano` no armazém e sobrevive ao recarregar; a faixa de Monte Carlo é a mesma a cada cálculo.
// Capturas em capturas/ (fora do git) para OLHAR antes de entregar.
//
// Fora do `node --test` de propósito (precisa de Playwright e Chromium). Rodar da raiz do repo:
//   NODE_PATH=<node_modules global com playwright> PLAYWRIGHT_BROWSERS_PATH=<pasta dos navegadores> \
//     node tests/ui/plano.navegador.mjs
import assert from "node:assert/strict";
import http from "node:http";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(process.env.NODE_PATH ? path.join(process.env.NODE_PATH, "/") : import.meta.url);
const { chromium } = require("playwright");
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FITRICH = path.resolve(AQUI, "..", "..", "app");
const CAPTURAS = path.join(AQUI, "capturas");
mkdirSync(CAPTURAS, { recursive: true });
const TIPOS = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".xml": "application/xml" };
const ABAS = ["mensal", "reserva", "dividas", "independencia", "rendafixa"];

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
const resumo = { capturas: [], combinacoes: 0 };

async function novaPagina({ largura, tema, idioma }) {
  const contexto = await navegador.newContext({ viewport: { width: largura, height: 900 }, colorScheme: tema, locale: idioma === "en" ? "en-US" : "pt-BR" });
  const pagina = await contexto.newPage();
  const erros = [];
  pagina.on("pageerror", (e) => erros.push(`pageerror: ${e}`));
  pagina.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") erros.push(`${m.type()}: ${m.text()} (${m.location()?.url})`); });
  pagina.on("requestfailed", (r) => { if (r.failure()?.errorText !== "net::ERR_ABORTED") erros.push(`request: ${r.url()} ${r.failure()?.errorText}`); });
  await contexto.addInitScript(() => { try { if (sessionStorage.getItem("teste-iniciado")) return; sessionStorage.setItem("teste-iniciado", "1"); localStorage.clear(); } catch {} });
  return { contexto, pagina, erros };
}

// Dados "de verdade" (sem a marca de exemplo) para a tela ter o que calcular: o exemplo do app, uma meta de
// reserva e duas dívidas, gravados pelo mesmo `mudar` que a interface usa.
async function semearDados(pagina) {
  await pagina.evaluate(async () => {
    const { dadosExemplo } = await import("/js/v2/ui/dados-exemplo.mjs");
    const { adicionar } = await import("/js/v2/esquema.mjs");
    const { hojeISO } = await import("/js/datas.mjs");
    const agora = () => new Date().toISOString();
    let d = dadosExemplo({ hoje: hojeISO(), agora, idioma: "pt-BR" });
    const { exemplo, ...meta } = d.meta;
    d = { ...d, meta };
    d = adicionar(d, "metas", { id: "m-reserva", nome: "Reserva", tipo: "reserva", alvo: 1500000, atual: 400000, contaId: null }, { agora });
    d = adicionar(d, "dividas", { id: "dv-cartao", nome: "Cartão", saldoCentavos: 300000, taxaMensalBp: 1200, parcelaMinimaCentavos: 15000 }, { agora });
    d = adicionar(d, "dividas", { id: "dv-moto", nome: "Moto", saldoCentavos: 150000, taxaMensalBp: 300, parcelaMinimaCentavos: 8000 }, { agora });
    d = adicionar(d, "dividas", { id: "dv-amigo", nome: "Empréstimo de amigo", saldoCentavos: 40000, taxaMensalBp: 100, parcelaMinimaCentavos: 4000 }, { agora });
    await globalThis.__fitrich.mudar(() => d);
  });
}

async function invariantes(pagina, rotulo) {
  const r = await pagina.evaluate(() => {
    const doc = document;
    const alvos = [...doc.querySelectorAll("#vista button, #vista summary, #vista select, #vista input:not([type=checkbox]):not([type=hidden])")].filter((e) => e.offsetParent !== null).map((e) => { const b = e.getBoundingClientRect(); return { alto: Math.round(b.height), nome: (e.textContent || e.name || e.id).trim().slice(0, 30) }; }).filter((a) => a.alto < 44);
    return {
      faltando: globalThis.__fitrich.faltando(),
      comStyle: [...doc.querySelectorAll("[style]")].map((e) => e.outerHTML.slice(0, 80)).filter((s) => !/^<(html|body)/.test(s)),
      estouro: doc.documentElement.scrollWidth - doc.documentElement.clientWidth,
      semLabel: [...doc.querySelectorAll("#vista input:not([type=hidden]),#vista select")].filter((i) => !(i.labels && i.labels.length) && !i.getAttribute("aria-label")).map((i) => i.name || i.id),
      graficosSemTexto: [...doc.querySelectorAll("#vista svg.grafico")].filter((s) => !s.querySelector("title") || !s.querySelector("desc")).length,
      alvosPequenos: alvos,
      embutido: [...doc.querySelectorAll("#vista .rolar")].some((e) => e.scrollWidth > e.clientWidth) ? "tabela rola dentro do cartão (esperado em 390 px)" : "",
    };
  });
  assert.deepEqual(r.faltando, [], `${rotulo}: chaves de tradução faltando`);
  assert.deepEqual(r.comStyle, [], `${rotulo}: atributo style no DOM`);
  assert.ok(r.estouro <= 0, `${rotulo}: estouro horizontal de ${r.estouro}px`);
  assert.deepEqual(r.semLabel, [], `${rotulo}: campo sem label`);
  assert.equal(r.graficosSemTexto, 0, `${rotulo}: gráfico sem title/desc`);
  assert.deepEqual(r.alvosPequenos, [], `${rotulo}: alvo de clique menor que 44 px`);
}

async function captura(pagina, nome) {
  const arq = path.join(CAPTURAS, `plano-${nome}.png`);
  await pagina.evaluate(() => window.scrollTo(0, 0));
  await pagina.screenshot({ path: arq, fullPage: true, animations: "disabled" });
  resumo.capturas.push(path.relative(process.cwd(), arq));
}

try {
  for (const idioma of ["pt-BR", "en"]) for (const largura of [390, 1024]) for (const tema of ["light", "dark"]) {
    const rotulo = `${idioma} ${largura} ${tema}`;
    const { contexto, pagina, erros } = await novaPagina({ largura, tema, idioma });
    await pagina.goto(`${base}${idioma === "en" ? "/en/" : "/"}`);
    await pagina.waitForSelector("#vista .hoje", { timeout: 15000 });
    await semearDados(pagina);
    await pagina.evaluate(() => { location.hash = "#/plano"; });
    await pagina.waitForSelector(".tela-plano .abas", { timeout: 15000 });
    await pagina.waitForFunction(() => document.fonts.status === "loaded");
    for (const aba of ABAS) {
      await pagina.click(`#plano-aba-${aba}`);
      await pagina.waitForSelector(`#plano-painel-${aba}`);
      // O botão "Calcular" de cada aba entrega um resultado; aqui só se confere que a aba tem conteúdo útil.
      assert.ok((await pagina.locator(`#plano-painel-${aba} .cartao`).count()) >= 1, `${rotulo} ${aba}: sem cartão`);
      await invariantes(pagina, `${rotulo} ${aba}`);
      await captura(pagina, `${aba}-${idioma === "en" ? "en" : "pt"}-${largura}-${tema}`);
    }
    // Navegação por teclado: seta para a direita troca a aba e leva o foco junto.
    await pagina.click("#plano-aba-mensal");
    await pagina.keyboard.press("ArrowRight");
    assert.equal(await pagina.evaluate(() => document.activeElement?.id), "plano-aba-reserva", `${rotulo}: seta não moveu o foco para a aba seguinte`);
    assert.deepEqual(erros, [], `${rotulo}: erros de console ou rede`);
    resumo.combinacoes++;
    await contexto.close();
  }

  // ---- ponta a ponta (pt-BR, 390 claro) ----
  {
    const { contexto, pagina, erros } = await novaPagina({ largura: 390, tema: "light", idioma: "pt-BR" });
    await pagina.goto(`${base}/`);
    await pagina.waitForSelector("#vista .hoje", { timeout: 15000 });
    await semearDados(pagina);
    await pagina.evaluate(() => { location.hash = "#/plano"; });
    await pagina.waitForSelector(".tela-plano .abas");

    // Renda digitada: vira perfil.plano, o plano mensal soma a renda digitada e sobrevive ao recarregar.
    await pagina.fill("input[name=renda]", "8000,00");
    await pagina.click("#plano-painel-mensal form button[type=submit]");
    await pagina.waitForFunction(() => globalThis.__fitrich.estado().perfil.plano?.rendaCentavos === 800000);
    await pagina.waitForSelector("#plano-resultado");
    assert.match(await pagina.locator("#plano-resultado").textContent(), /8\.000,00/);
    const somaTela = await pagina.evaluate(() => [...document.querySelectorAll(".passo-valor")].map((e) => e.textContent));
    assert.ok(somaTela.length >= 3, "as linhas do plano mensal aparecem (as zeradas somem, o investimento fica)");
    await pagina.reload(); await pagina.waitForSelector(".tela-plano .abas");
    assert.equal(await pagina.evaluate(() => globalThis.__fitrich.estado().perfil.plano.rendaCentavos), 800000, "a renda não sobreviveu ao recarregar");

    // Independência: mesma faixa (mesma semente) em dois cálculos seguidos, e o gráfico tem texto.
    await pagina.click("#plano-aba-independencia");
    const lerFaixa = () => pagina.evaluate(() => [...document.querySelectorAll("#plano-painel-independencia details.tab")].pop().querySelector("tbody").textContent);
    await pagina.fill("input[name=despesa]", "6000,00"); await pagina.fill("input[name=aporte]", "2500,00");
    await pagina.click("#plano-painel-independencia form button[type=submit]");
    await pagina.waitForFunction(() => globalThis.__fitrich.estado().perfil.plano?.aporteMensalCentavos === 250000);
    const a = await lerFaixa();
    await pagina.click("#plano-painel-independencia form button[type=submit]");
    await pagina.waitForTimeout(150);
    assert.equal(await lerFaixa(), a, "Monte Carlo mudou entre dois cálculos com a mesma entrada");
    assert.ok((await pagina.locator("#plano-painel-independencia svg.grafico").count()) === 1);
    const estadoPlano = await pagina.evaluate(() => globalThis.__fitrich.estado().perfil.plano);
    assert.deepEqual([estadoPlano.despesaDesejadaCentavos, estadoPlano.aporteMensalCentavos], [600000, 250000]);

    // Taxas fora de ordem são recusadas com aviso e nada é gravado.
    await pagina.locator("#plano-painel-independencia details.avancado summary").click();
    await pagina.fill("input[name=tpes]", "9");
    await pagina.click("#plano-painel-independencia form button[type=submit]");
    await pagina.waitForSelector(".tela-plano .aviso");
    assert.match(await pagina.locator(".tela-plano .aviso").first().textContent(), /ordem/);
    assert.notEqual(await pagina.evaluate(() => globalThis.__fitrich.estado().perfil.plano.taxasReaisBp?.pessimistaBp), 900);

    // Dívidas: três métodos, ordem de quitação e o extra recalcula sem gravar nada.
    await pagina.click("#plano-aba-dividas");
    assert.equal(await pagina.locator(".metodo-card").count(), 3);
    const antes = await pagina.locator(".metodo-card b").allTextContents();
    await pagina.fill("input[name=extra]", "1500,00");
    await pagina.click("#plano-painel-dividas form button[type=submit]");
    await pagina.waitForTimeout(150);
    const depois = await pagina.locator(".metodo-card b").allTextContents();
    assert.notDeepEqual(depois, antes, "mais extra por mês não mudou a data de quitação");

    // Renda fixa: a tabela traz as seis linhas e o aviso de FGC; valor inválido é recusado.
    await pagina.click("#plano-aba-rendafixa");
    assert.equal(await pagina.locator("#plano-painel-rendafixa tbody tr").count(), 6);
    assert.match(await pagina.locator(".ressalvas").textContent(), /FGC/);
    await pagina.fill("input[name=rfvalor]", "abc");
    await pagina.click("#plano-painel-rendafixa form button[type=submit]");
    await pagina.waitForSelector(".tela-plano .aviso");
    assert.deepEqual(erros, [], "erros de console ou rede no ponta a ponta");
    await contexto.close();
  }
  console.log(JSON.stringify({ ok: true, combinacoes: resumo.combinacoes, capturas: resumo.capturas.length }, null, 1));
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await navegador.close();
  servidor.close();
}
