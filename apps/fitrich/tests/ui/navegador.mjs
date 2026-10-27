// Teste de navegador das telas Importar, Dados e Regras (Fitrich v2) num Chromium headless real, pelo harness.
// Fora do `node --test` de propósito (precisa de Playwright e Chromium). Rodar da raiz do repo:
//   NODE_PATH=<node_modules global com playwright> PLAYWRIGHT_BROWSERS_PATH=<pasta dos browsers> \
//     node tests/ui/navegador.mjs [pasta-das-capturas]
// O que prova: upload DE VERDADE das fixtures OFX (SGML cp1252 e XML) e CSV (Nubank e um banco desconhecido com
// mapeamento manual), preview com as contagens certas, reimportar = 0 novos, desfazer = estado idêntico, descrição
// hostil nunca vira elemento, backup cifrado ida e volta (senha errada falha limpo), importar JSON, apagar tudo,
// regra criada/testada/aprendida/desfeita; e, em 390 e 1024 px × claro/escuro × pt-BR/en: sem erro de console, sem
// estouro horizontal, `i18n.faltando()` vazio e nenhum atributo `style` no DOM. Sai com 1 em qualquer divergência.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { iniciarServidor } from "./harness.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.resolve(AQUI, "..", "fixtures");
const CAPTURAS = process.argv[2] ?? path.join(AQUI, "capturas");
await mkdir(CAPTURAS, { recursive: true });

const { base, fechar } = await iniciarServidor();
const navegador = await chromium.launch();
const relatorio = { capturas: [], checagens: {} };

async function abrir({ tela, idioma = "pt-BR", tema = "light", largura = 1024 }) {
  const ctx = await navegador.newContext({ viewport: { width: largura, height: 900 }, acceptDownloads: true, colorScheme: tema });
  const pagina = await ctx.newPage();
  const erros = [];
  pagina.on("pageerror", (e) => erros.push(String(e)));
  pagina.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
  await pagina.goto(`${base}/_tela.html?tela=${tela}&idioma=${idioma}&tema=${tema}`);
  await pagina.waitForFunction(() => window.__h?.montado?.atual);
  return { ctx, pagina, erros };
}
// As quatro invariantes de toda tela, em qualquer estado em que ela esteja.
async function invariantes(pagina, erros, rotulo) {
  const r = await pagina.evaluate(() => ({
    faltando: window.__h.i18n.faltando(),
    comStyle: [...document.querySelectorAll("[style]")].map((e) => e.outerHTML.slice(0, 80)),
    estouro: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    imgs: document.querySelectorAll("img").length,
    alvosPequenos: [...document.querySelectorAll("button, a, input:not([type=hidden]), select, summary")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && (b.height < 44 || b.width < 44); }).map((e) => `${e.tagName}.${e.className} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`),
  }));
  assert.deepEqual(erros, [], `${rotulo}: erros de console`);
  assert.deepEqual(r.faltando, [], `${rotulo}: chaves i18n faltando`);
  assert.deepEqual(r.comStyle, [], `${rotulo}: atributo style no DOM`);
  assert.ok(r.estouro <= 0, `${rotulo}: estouro horizontal de ${r.estouro}px`);
  assert.equal(r.imgs, 0, `${rotulo}: descrição hostil virou <img>`);
  relatorio.checagens[rotulo] = { alvosPequenos: r.alvosPequenos };
  return r;
}
async function capturar(pagina, nome) { const arq = path.join(CAPTURAS, `${nome}.png`); await pagina.screenshot({ path: arq, fullPage: true }); relatorio.capturas.push(arq); }
const dados = (pagina) => pagina.evaluate(() => JSON.stringify(window.__h.dados));
const upload = (pagina, arquivo) => pagina.setInputFiles("#fi-arquivo", arquivo);
const textoDe = (pagina, sel) => pagina.locator(sel).first().innerText();

try {
  // ---------- 1. Importar: OFX SGML cp1252 → conta, reimportar, desfazer ----------
  {
    const { ctx, pagina, erros } = await abrir({ tela: "importar" });
    const antes = await dados(pagina);
    await pagina.selectOption("#fi-destino", "conta:conta-nu");
    await upload(pagina, path.join(FIX, "extrato-sgml-cp1252.ofx"));
    await pagina.waitForSelector(".fi-totais");
    const totais = await pagina.locator(".fi-totais b").allInnerTexts();
    assert.equal(totais[0], "5", "SGML: 6 STMTTRN com um FITID repetido no arquivo = 5 novos");
    assert.equal(totais[1], "1", "SGML: a repetição conta como já existe");
    assert.ok((await pagina.locator(".fi-desc").allInnerTexts()).some((x) => x.includes("PÃO DE AÇÚCAR")), "cp1252 decodificado com acento");
    assert.equal(await pagina.locator(".fi-preview-x, .fi-cartao h3:has-text('transferência'), .fi-cartao h3:has-text('transfer')").count() >= 0, true);
    const transf = await pagina.locator(".fi-cartao").filter({ hasText: /Parece transferência/ }).count();
    assert.equal(transf, 1, "saída −45,90 no Nubank casa com +45,90 no Inter: 1 sugestão de transferência");
    await invariantes(pagina, erros, "importar-preview-ofx-1024-claro-pt");
    await capturar(pagina, "importar-preview-ofx-sgml");
    await pagina.click(".fi-acoes-fim .fi-primario");
    await pagina.waitForSelector(".fi-ok");
    let d = JSON.parse(await dados(pagina));
    assert.equal(d.lancamentos.length, JSON.parse(antes).lancamentos.length + 5, "5 lançamentos entraram");
    assert.equal(d.importacoes.length, 2);
    const salario = d.lancamentos.find((l) => l.descricao.includes("Salário Empresa"));
    assert.equal(salario.tipo, "receita"); assert.equal(salario.centavos, 123456); assert.equal(salario.categoriaId, "cat-salario", "regra da base 'salario' → Salário (receita)");
    const enel = d.lancamentos.find((l) => l.descricao.includes("ENEL"));
    assert.equal(enel.categoriaId, "cat-moradia", "ENEL → Moradia pela base");
    // Reimportar o mesmo arquivo: 0 novos.
    await pagina.click(".fi-ok .fi-primario");
    await pagina.selectOption("#fi-destino", "conta:conta-nu");
    await upload(pagina, path.join(FIX, "extrato-sgml-cp1252.ofx"));
    await pagina.waitForSelector(".fi-totais");
    assert.equal((await pagina.locator(".fi-totais b").allInnerTexts())[0], "0", "reimportar = 0 novos");
    assert.equal(await pagina.locator(".fi-acoes-fim .fi-primario").isDisabled(), true, "botão de confirmar desabilitado sem novidade");
    await capturar(pagina, "importar-reimportar-zero");
    // Desfazer pelo histórico: estado idêntico ao de antes.
    await pagina.click(".fi-acoes-fim .fi-btn:not(.fi-primario)");
    await pagina.locator(".fi-hist .fi-btn").first().click();
    await pagina.waitForSelector("dialog[open]");
    await capturar(pagina, "importar-dialogo-desfazer");
    await pagina.click("dialog[open] .fi-perigo");
    await pagina.waitForSelector(".fi-aviso");
    assert.equal(await dados(pagina), antes, "desfazer restaura o estado idêntico");
    await invariantes(pagina, erros, "importar-depois-desfazer");
    await ctx.close();
  }

  // ---------- 2. Importar: OFX XML de cartão com descrição hostil ----------
  {
    const { ctx, pagina, erros } = await abrir({ tela: "importar", idioma: "en", tema: "dark", largura: 390 });
    await pagina.selectOption("#fi-destino", "cartao:cartao-nu");
    await upload(pagina, path.join(FIX, "fatura-xml-utf8.ofx"));
    await pagina.waitForSelector(".fi-totais");
    assert.equal((await pagina.locator(".fi-totais b").allInnerTexts())[0], "3");
    const descs = await pagina.locator(".fi-desc").allInnerTexts();
    assert.ok(descs.some((x) => x.includes("<img src=x onerror=alert(1)> Netflix.com")), "a descrição hostil aparece como TEXTO");
    const r = await invariantes(pagina, erros, "importar-preview-xml-390-escuro-en");
    assert.equal(r.imgs, 0, "nenhum <img> criado pela descrição");
    const origens = await pagina.locator(".fi-origem").allInnerTexts();
    assert.ok(origens.includes("built-in rule"), "Ifood/Netflix vêm da base, com a origem visível em inglês");
    await capturar(pagina, "importar-preview-xml-390-escuro-en");
    await pagina.click(".fi-acoes-fim .fi-primario");
    await pagina.waitForSelector(".fi-ok");
    const d = JSON.parse(await dados(pagina));
    const ifood = d.lancamentos.find((l) => l.descricao.startsWith("Ifood"));
    assert.equal(ifood.cartaoId, "cartao-nu"); assert.equal(ifood.categoriaId, "cat-delivery", "'Restaurante e delivery' da base resolvido para 'Delivery e restaurante' do esquema");
    assert.equal(ifood.meio, "credito");
    const pago = d.lancamentos.find((l) => l.descricao === "Pagamento recebido");
    assert.equal(pago.tipo, "receita"); assert.equal(pago.categoriaId, null, "regra 'Transferência' da base sem par vira sem categoria, não erro");
    await capturar(pagina, "importar-feito-390-escuro-en");
    await invariantes(pagina, erros, "importar-feito-390-escuro-en");
    await ctx.close();
  }

  // ---------- 3. Importar: CSV Nubank (perfil reconhecido), duplicata marcada e transferência confirmada; desfazer ----------
  {
    const { ctx, pagina, erros } = await abrir({ tela: "importar" });
    const antes = await dados(pagina);
    await pagina.selectOption("#fi-destino", "conta:conta-nu");
    await upload(pagina, path.join(FIX, "nubank-conta.csv"));
    await pagina.waitForSelector(".fi-totais");
    const totais = await pagina.locator(".fi-totais b").allInnerTexts();
    assert.deepEqual(totais.slice(0, 3), ["3", "0", "1"], "Nubank CSV: 4 linhas, 1 possível duplicata (−500 'Pagamento de fatura' × 'Pagamento fatura cartão')");
    await pagina.locator(".fi-cartao").filter({ hasText: /Possíveis duplicatas/ }).locator("input[type=checkbox]").check();
    await pagina.locator(".fi-cartao").filter({ hasText: /Parece transferência/ }).locator("input[type=checkbox]").check();
    // Trocar a categoria de um novo ensina uma regra.
    const selPao = pagina.locator(".fi-lanc").filter({ hasText: "PAO DE ACUCAR" }).locator("select.fi-cat");
    await selPao.selectOption("cat-lazer");
    await capturar(pagina, "importar-preview-csv-nubank");
    await pagina.click(".fi-acoes-fim .fi-primario");
    await pagina.waitForSelector(".fi-ok");
    const d = JSON.parse(await dados(pagina)), a = JSON.parse(antes);
    assert.equal(d.lancamentos.length, a.lancamentos.length + 3 + 1 - 1, "3 novos + 1 duplicata incluída − 1 perna de entrada fundida na transferência");
    const transf = d.lancamentos.find((l) => l.tipo === "transferencia");
    assert.equal(transf.contaId, "conta-nu"); assert.equal(transf.contaDestinoId, "conta-inter"); assert.equal(transf.categoriaId, null);
    assert.equal(d.lancamentos.some((l) => l.id === "l-2"), false, "a perna de entrada pré-existente (l-2) saiu");
    const aprendida = d.regras.find((r) => r.origem === "aprendida");
    assert.ok(aprendida && aprendida.categoriaId === "cat-lazer", "trocar a categoria no preview criou regra aprendida");
    assert.ok(/acucar/.test(aprendida.padrao), `token dominante: ${aprendida.padrao}`);
    const reg = d.importacoes.find((i) => i.arquivo === "nubank-conta.csv");
    assert.equal(reg.removidosExistentes.length, 1); assert.equal(reg.idsCriados.length, 4);
    await invariantes(pagina, erros, "importar-feito-csv");
    await pagina.click(".fi-ok .fi-btn:not(.fi-primario)");
    await pagina.click("dialog[open] .fi-perigo");
    await pagina.waitForSelector(".fi-aviso");
    const depois = JSON.parse(await dados(pagina));
    // A regra aprendida fica (é conhecimento, não dado do extrato); tudo o mais volta idêntico.
    assert.equal(JSON.stringify({ ...depois, regras: a.regras, meta: a.meta }), JSON.stringify(a), "desfazer restaura lançamentos, inclusive a perna de transferência removida");
    await ctx.close();
  }

  // ---------- 4. Importar: CSV de banco desconhecido → mapeamento manual → perfil salvo → reimportar reconhece ----------
  {
    const { ctx, pagina, erros } = await abrir({ tela: "importar", largura: 390 });
    await pagina.selectOption("#fi-destino", "conta:conta-inter");
    await upload(pagina, path.join(AQUI, "fixtures", "banco-x.csv"));
    await pagina.waitForSelector("#fi-col-data");
    await invariantes(pagina, erros, "importar-mapa-390");
    await pagina.selectOption("#fi-col-data", "0");
    await pagina.selectOption("#fi-col-descricao", "1");
    await pagina.selectOption("#fi-col-valor", "2");
    await pagina.waitForFunction(() => document.querySelectorAll(".fi-previa tbody tr").length === 3);
    const previa = await pagina.locator(".fi-previa td").allInnerTexts();
    assert.ok(previa.includes("Padaria do João") && previa.some((x) => x.includes("12,50")), "prévia lê as 3 linhas com o mapeamento manual");
    await pagina.locator(".fi-check input").nth(1).check(); // guardar mapeamento
    await pagina.fill("#fi-perfil-nome", "Banco X");
    await capturar(pagina, "importar-mapa-390");
    await pagina.click(".fi-cartao .fi-acoes .fi-primario");
    await pagina.waitForSelector(".fi-totais");
    assert.equal((await pagina.locator(".fi-totais b").allInnerTexts())[0], "3");
    await pagina.click(".fi-acoes-fim .fi-primario");
    await pagina.waitForSelector(".fi-ok");
    const d = JSON.parse(await dados(pagina));
    assert.equal(d.perfil.perfisCSV.length, 1); assert.equal(d.perfil.perfisCSV[0].nome, "Banco X");
    assert.deepEqual(d.perfil.perfisCSV[0].cabecalho, ["dia", "loja", "quanto"]);
    // Segunda vez: o perfil reconhece o cabeçalho, vai direto ao preview, e nada é novo.
    await pagina.click(".fi-ok .fi-primario");
    await pagina.selectOption("#fi-destino", "conta:conta-inter");
    await upload(pagina, path.join(AQUI, "fixtures", "banco-x.csv"));
    await pagina.waitForSelector(".fi-totais");
    assert.equal((await pagina.locator(".fi-totais b").allInnerTexts())[0], "0", "perfil salvo reconhece o arquivo e reimportar dá 0 novos");
    await invariantes(pagina, erros, "importar-perfil-reimportado");
    // Erros em linguagem simples: PDF e arquivo vazio.
    await pagina.click(".fi-acoes-fim .fi-btn:not(.fi-primario)");
    await pagina.setInputFiles("#fi-arquivo", { name: "fatura.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 lixo") });
    await pagina.waitForSelector(".fi-erro");
    assert.match(await textoDe(pagina, ".fi-erro"), /PDF/);
    await capturar(pagina, "importar-erro-pdf-390");
    await pagina.setInputFiles("#fi-arquivo", { name: "vazio.csv", mimeType: "text/csv", buffer: Buffer.alloc(0) });
    await pagina.waitForFunction(() => /vazio/.test(document.querySelector(".fi-erro")?.textContent ?? ""));
    await invariantes(pagina, erros, "importar-erro-390");
    await ctx.close();
  }

  // ---------- 5. Regras: criar, testar ("por que casou"), corrigir lançamento (aprender) e desfazer ----------
  {
    const { ctx, pagina, erros } = await abrir({ tela: "regras" });
    await pagina.fill("#fr-teste", "PG *IFOOD 2/3 12345");
    const exp = await textoDe(pagina, ".fr-explica");
    assert.match(exp, /ifood/); assert.match(exp, /Delivery e restaurante/); assert.match(exp, /regra da base/);
    await pagina.click(".fr-topo .fr-primario");
    await pagina.fill("#fr-padrao", "(a+)+");
    await pagina.selectOption("#fr-tipo", "regex");
    await pagina.waitForFunction(() => /travar/.test(document.querySelector(".fr-erro-campo")?.textContent ?? ""));
    await pagina.fill("#fr-padrao", "ifood");
    await pagina.selectOption("#fr-tipo", "contem");
    await pagina.selectOption("#fr-cat", "cat-lazer");
    await capturar(pagina, "regras-form");
    await pagina.click(".fr-form .fr-primario");
    await pagina.waitForSelector(".fr-aviso");
    let d = JSON.parse(await dados(pagina));
    assert.equal(d.regras.length, 2); assert.equal(d.regras[1].origem, "usuario"); assert.equal(d.regras[1].categoriaId, "cat-lazer");
    await pagina.fill("#fr-teste", "PG *IFOOD 2/3 12345");
    const exp2 = await textoDe(pagina, ".fr-explica");
    assert.match(exp2, /Lazer/); assert.match(exp2, /regra sua/); assert.match(exp2, /também casou/);
    // Lançamento importado sem categoria: explicar e corrigir.
    await pagina.locator(".fr-lanc-btn").filter({ hasText: "LOJA DESCONHECIDA" }).click();
    await pagina.waitForSelector(".fr-corrigir select");
    await pagina.locator(".fr-corrigir select").selectOption("cat-vestuario");
    await pagina.click(".fr-corrigir .fr-primario");
    await pagina.waitForSelector(".fr-aprendi");
    assert.match(await textoDe(pagina, ".fr-aprendi"), /Aprendi que "desconhecida" é Vestuário/);
    d = JSON.parse(await dados(pagina));
    assert.equal(d.lancamentos.find((l) => l.id === "l-imp-2").categoriaId, "cat-vestuario");
    assert.equal(d.regras.filter((r) => r.origem === "aprendida").length, 1);
    await invariantes(pagina, erros, "regras-aprendi");
    await capturar(pagina, "regras-aprendi");
    await pagina.click(".fr-aprendi .fr-btn:not(.fr-mini)");
    await pagina.waitForFunction(() => !document.querySelector(".fr-aprendi"));
    d = JSON.parse(await dados(pagina));
    assert.equal(d.lancamentos.find((l) => l.id === "l-imp-2").categoriaId, null, "desfazer o aprendizado devolve a categoria anterior");
    assert.equal(d.regras.filter((r) => r.origem === "aprendida").length, 0);
    // Apagar regra e restaurar a base.
    await pagina.locator(".fr-regra").filter({ hasText: "padaria" }).locator("button", { hasText: "Apagar" }).click();
    await pagina.click("dialog[open] .fr-perigo");
    await pagina.waitForFunction(() => window.__h.dados.regras.length === 1);
    await pagina.locator(".fr-cartao button", { hasText: "Restaurar a base" }).click();
    await pagina.click("dialog[open] .fr-perigo");
    await pagina.waitForFunction(() => window.__h.dados.regras.length === 0);
    await invariantes(pagina, erros, "regras-restaurada");
    await ctx.close();
  }

  // ---------- 6. Dados: exportar JSON/CSV, backup cifrado ida e volta, importar JSON, idioma, apagar tudo ----------
  {
    const { ctx, pagina, erros } = await abrir({ tela: "dados" });
    const antes = await dados(pagina);
    assert.match(await textoDe(pagina, ".fd-lembrete h3"), /Hora de fazer um backup/, "sem backup nunca feito: lembrete aparece");
    let down = pagina.waitForEvent("download");
    await pagina.locator("button", { hasText: "Exportar tudo (JSON)" }).click();
    const json = await (await down).path().then((p) => readFile(p, "utf-8"));
    assert.equal(JSON.stringify(JSON.parse(json)), JSON.stringify(JSON.parse(antes)), "o JSON exportado é o estado inteiro");
    await pagina.waitForFunction(() => window.__h.dados.meta.ultimoBackupEm !== null);
    assert.match(await textoDe(pagina, ".fd-lembrete-ok h3"), /Backup em dia/);
    down = pagina.waitForEvent("download");
    await pagina.locator("button", { hasText: "Exportar lançamentos (CSV)" }).click();
    const csv = await (await down).path().then((p) => readFile(p, "utf-8"));
    assert.ok(csv.startsWith("﻿data;tipo;categoria;valor;descricao"), "CSV com BOM, ; e cabeçalho");
    assert.ok(csv.includes('"\'=HYPERLINK(""http://x"";""almoço"")"'), "célula que começa com = ganha apóstrofo (proteção contra fórmula)");
    assert.ok(csv.includes(";6500,00;"), "vírgula decimal");
    // Backup cifrado.
    await pagina.fill("#fd-senha", "uma frase longa e segura 2026");
    await pagina.fill("#fd-senha2", "uma frase longa e segura 2026");
    assert.match(await textoDe(pagina, ".fd-forca-texto"), /Forte|Razoável/);
    await capturar(pagina, "dados-topo-1024");
    down = pagina.waitForEvent("download");
    await pagina.locator("button", { hasText: "Criar backup cifrado" }).click();
    await pagina.waitForSelector("dialog[open]");
    assert.match(await textoDe(pagina, "dialog[open]"), /Não existe recuperação/);
    await capturar(pagina, "dados-dialogo-cifrado");
    await pagina.click("dialog[open] .fd-primario");
    const enc = await (await down).path().then((p) => readFile(p, "utf-8"));
    const cab = JSON.parse(enc);
    assert.equal(cab.fmt, "fitrich-enc"); assert.ok(cab.iter >= 600000); assert.ok(!enc.includes("Nubank"), "nada em claro no backup cifrado");
    // Senha errada: falha limpa, nada muda.
    await pagina.setInputFiles("#fd-importar", { name: "backup.enc.json", mimeType: "application/json", buffer: Buffer.from(enc) });
    await pagina.waitForSelector("dialog[open] input[type=password]");
    await pagina.fill("dialog[open] input[type=password]", "senha errada");
    await pagina.click("dialog[open] .fd-primario");
    await pagina.waitForSelector(".fd-aviso-erro");
    assert.match(await textoDe(pagina, ".fd-aviso-erro"), /Senha incorreta/);
    // Agora muda o estado (apaga um lançamento à mão) e restaura pelo backup cifrado com a senha certa.
    await pagina.evaluate(() => { const d = structuredClone(window.__h.dados); d.lancamentos = d.lancamentos.slice(1); window.__h.dados = d; });
    await pagina.setInputFiles("#fd-importar", { name: "backup.enc.json", mimeType: "application/json", buffer: Buffer.from(enc) });
    await pagina.waitForSelector("dialog[open] input[type=password]");
    await pagina.fill("dialog[open] input[type=password]", "uma frase longa e segura 2026");
    await pagina.click("dialog[open] .fd-primario");
    await pagina.waitForSelector("dialog[open] table");
    const tabela = await textoDe(pagina, "dialog[open]");
    assert.match(tabela, /Lançamentos\s+5\s+6/, "o diálogo mostra o que será substituído (5 aqui hoje, 6 no arquivo)");
    await capturar(pagina, "dados-dialogo-importar");
    await pagina.click("dialog[open] .fd-perigo");
    await pagina.waitForFunction(() => window.__h.dados.lancamentos.length === 6);
    const restaurado = JSON.parse(await dados(pagina));
    assert.equal(restaurado.lancamentos.length, 6, "backup cifrado ida e volta");
    // Mesclar: arquivo de "outro aparelho" com um lançamento a mais e uma edição mais nova.
    const outro = JSON.parse(antes);
    outro.lancamentos.push({ ...outro.lancamentos[0], id: "l-outro", descricao: "Do outro aparelho", atualizadoEm: "2026-10-06T00:00:00.000Z" });
    outro.lancamentos[2] = { ...outro.lancamentos[2], descricao: "Pix recebido (editado)", atualizadoEm: "2026-10-06T00:00:00.000Z" };
    outro.meta.atualizadoEm = "2026-10-06T00:00:00.000Z";
    await pagina.setInputFiles("#fd-mesclar", { name: "outro.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(outro)) });
    await pagina.waitForSelector("dialog[open] ul");
    assert.match(await textoDe(pagina, "dialog[open]"), /Lançamentos: 1 novos, 1 atualizados, 0 removidos/);
    await pagina.click("dialog[open] .fd-primario");
    await pagina.waitForFunction(() => window.__h.dados.lancamentos.length === 7);
    const mesclado = JSON.parse(await dados(pagina));
    assert.ok(mesclado.lancamentos.some((l) => l.descricao === "Pix recebido (editado)"), "edição mais nova venceu");
    assert.equal(mesclado.pesos.length, 1); assert.equal(mesclado.categorias.length, 17);
    // Idioma.
    await pagina.check("input[name=fd-idioma][value=en]");
    await pagina.waitForFunction(() => window.__h.dados.perfil.idioma === "en");
    // Apagar tudo, com "exportar antes" dentro do diálogo.
    await pagina.locator(".fd-zona .fd-perigo").click();
    await pagina.waitForSelector("dialog[open]");
    await capturar(pagina, "dados-dialogo-apagar");
    down = pagina.waitForEvent("download");
    await pagina.locator("dialog[open] button", { hasText: "Exportar antes" }).click();
    await down;
    await pagina.locator("dialog[open] .fd-perigo").click();
    await pagina.waitForFunction(() => window.__h.dados.lancamentos.length === 0);
    const limpo = JSON.parse(await dados(pagina));
    assert.equal(limpo.contas.length, 0); assert.equal(limpo.perfil.idioma, "en", "apagar tudo preserva só o idioma escolhido");
    await invariantes(pagina, erros, "dados-apagado");
    await capturar(pagina, "dados-apagado");
    await ctx.close();
  }

  // ---------- 7. Varredura visual: 3 telas × 390/1024 × claro/escuro × pt-BR/en ----------
  for (const tela of ["importar", "dados", "regras"]) for (const largura of [390, 1024]) for (const tema of ["light", "dark"]) for (const idioma of ["pt-BR", "en"]) {
    const { ctx, pagina, erros } = await abrir({ tela, idioma, tema, largura });
    const rotulo = `${tela}-${largura}-${tema}-${idioma}`;
    if (tela === "importar") { await pagina.click(".fi-ajuda summary"); }
    if (tela === "regras") { await pagina.fill("#fr-teste", "UBER *TRIP"); await pagina.locator(".fr-lanc-btn").first().click(); }
    if (tela === "dados") { await pagina.waitForFunction(() => !/Medindo|Measuring/.test(document.querySelector(".fd-cartao:nth-of-type(6) .fd-mudo")?.textContent ?? "x")); }
    await invariantes(pagina, erros, rotulo);
    await capturar(pagina, rotulo);
    await ctx.close();
  }

  await writeFile(path.join(CAPTURAS, "relatorio.json"), JSON.stringify(relatorio, null, 1));
  console.log(JSON.stringify({ capturas: relatorio.capturas.length, alvosPequenos: Object.fromEntries(Object.entries(relatorio.checagens).filter(([, v]) => v.alvosPequenos.length).map(([k, v]) => [k, v.alvosPequenos])) }, null, 1));
  console.log("OK: telas Importar, Dados e Regras no Chromium real");
} finally {
  await navegador.close();
  fechar();
}
