// Lógica de apresentação das telas Importar, Dados e Regras (Fitrich v2), pura, em Node 18. O que precisa de DOM
// está em tests/ui/navegador.mjs (Playwright). Aqui: contrato de tela, paridade pt-BR/en, as funções
// exportadas por cada tela e as proibições do contrato (innerHTML, style=, fetch) lidas do próprio código-fonte.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { paridade } from "../../app/js/v2/ui/i18n.mjs";
import { vazio, validar } from "../../app/js/v2/esquema.mjs";
import { tela as importar, detectarTipoArquivo, sanearCategorias, paresContaConta, fundirTransferencia, desfazerCompleto, trocarDiaMes, regrasAtivas, categoriasParaBase } from "../../app/js/v2/ui/telas/importar.mjs";
import { tela as regras, explicar, filtrarRegras, importadosRecentes, todasAsRegras } from "../../app/js/v2/ui/telas/regras.mjs";
import { tela as dados, exportarCSV, resumoColecoes, prepararMescla, forcaSenha, registrosDesdeBackup, webkitNaoInstalado, ehBackupCifrado, criarCifrador } from "../../app/js/v2/ui/telas/dados.mjs";
import { categorizar } from "../../app/js/v2/categorizar/regras.mjs";
import { dadosExemplo, AGORA } from "../ui/dados-exemplo-importar.mjs";

const arquivo = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const ler = (rel) => readFileSync(arquivo(rel), "utf-8");
const TELAS = { importar, regras, dados };

test("contrato de tela: id, chaves i18n, css e dicionário com paridade pt-BR/en sem chave sobrando", async () => {
  for (const [id, t] of Object.entries(TELAS)) {
    assert.equal(t.id, id); assert.equal(t.titulo, `${id}.titulo`); assert.equal(t.grupo, "mais"); assert.equal(typeof t.montar, "function");
    assert.equal(t.css, `/css/${id}.css`); assert.equal(t.i18n, `/js/v2/ui/telas/${id}.i18n.mjs`);
    const dic = (await import(`../../app/js/v2/ui/telas/${id}.i18n.mjs`)).default;
    assert.deepEqual(paridade(dic), [], `${id}: paridade`);
    assert.ok(Object.keys(dic["pt-BR"]).every((k) => k.startsWith(`${id}.`)), `${id}: prefixo das chaves`);
    assert.ok(readFileSync(arquivo(`../../app/css/${id}.css`), "utf-8").length > 100);
  }
});

test("o código das telas não usa innerHTML, atributo style, rede nem importa outra tela", () => {
  for (const id of Object.keys(TELAS)) {
    const codigo = ler(`../../app/js/v2/ui/telas/${id}.mjs`);
    for (const proibido of ["innerHTML", "outerHTML", "insertAdjacentHTML", "fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", " confirm(", " alert(", "localStorage", "indexedDB", 'style:', "style="]) assert.ok(!codigo.includes(proibido), `${id}.mjs usa ${proibido}`);
    for (const outra of Object.keys(TELAS).filter((x) => x !== id)) assert.ok(!codigo.includes(`telas/${outra}`), `${id} importa ${outra}`);
    // Toda string de interface passa por t(): nenhum h("p"|"span"|"h3"|"li"|"button", ..., "Texto literal") solto.
    assert.doesNotMatch(codigo, /h\("(p|span|h3|h4|li|button|label|legend|option|th|td)",\s*(null|\{[^}]*\}),\s*"[A-Za-zÀ-ú][^"]{3,}"\)/, `${id}: texto literal fora de t()`);
  }
});

test("detectarTipoArquivo: pelo conteúdo antes da extensão; PDF e JSON ganham mensagem própria", () => {
  assert.equal(detectarTipoArquivo("extrato.txt", "OFXHEADER:100\nDATA:OFXSGML"), "ofx");
  assert.equal(detectarTipoArquivo("x.ofx", "<?xml version='1.0'?><?OFX OFXHEADER='200'?>"), "ofx");
  assert.equal(detectarTipoArquivo("fatura.pdf", "%PDF-1.4"), "pdf");
  assert.equal(detectarTipoArquivo("backup.json", '{"versao":2}'), "json");
  assert.equal(detectarTipoArquivo("extrato.csv", "Data,Valor\n01/07/2026,-1"), "csv");
  assert.equal(detectarTipoArquivo("sem-extensao", "Data;Valor\n01/07/2026;-1"), "csv");
  assert.equal(detectarTipoArquivo("foto.bin", "\u0000\u0001"), "desconhecido");
});

test("sanearCategorias: sugestão de categoria do tipo errado (Salário numa despesa) vira sem categoria em vez de derrubar a importação", () => {
  const cats = vazio({ agora: () => AGORA }).categorias;
  const [a, b, c] = sanearCategorias([
    { tipo: "despesa", categoriaId: "cat-salario" }, { tipo: "receita", categoriaId: "cat-salario" }, { tipo: "despesa", categoriaId: "nao-existe" }], cats);
  assert.equal(a.categoriaId, null); assert.equal(b.categoriaId, "cat-salario"); assert.equal(c.categoriaId, null);
});

test("transferência: só pares conta↔conta; fundir vira UM lançamento válido no esquema; desfazerCompleto devolve o estado idêntico", () => {
  const d = dadosExemplo();
  const saida = { id: "s", data: "2026-07-02", tipo: "despesa", centavos: 4590, categoriaId: null, descricao: "Pix enviado", contaId: "conta-nu", meio: "pix", moeda: "BRL", status: "efetivado", origem: "importacao", importacaoId: "imp-x", atualizadoEm: AGORA, tags: [] };
  const entrada = d.lancamentos.find((l) => l.id === "l-2");
  const sug = [{ saidaId: "s", entradaId: "l-2", saida, entrada, centavos: 4590 }, { saidaId: "s", entradaId: "x", saida, entrada: { cartaoId: "cartao-nu" } }, { saidaId: "s", entradaId: "y", saida, entrada: { contaId: "conta-nu" } }];
  assert.equal(paresContaConta(sug).length, 1, "cartão e mesma conta ficam de fora");
  const com = { ...d, lancamentos: [...d.lancamentos, saida], importacoes: [...d.importacoes, { id: "imp-x", arquivo: "a.csv", hashArquivo: "h", em: AGORA, contaId: "conta-nu", cartaoId: null, idsCriados: ["s"] }] };
  const r = fundirTransferencia(com.lancamentos, sug[0], { agora: () => AGORA });
  const fundida = r.lancamentos.find((l) => l.id === "s");
  assert.equal(fundida.tipo, "transferencia"); assert.equal(fundida.contaDestinoId, "conta-inter"); assert.equal(fundida.categoriaId, null);
  assert.equal(r.lancamentos.some((l) => l.id === "l-2"), false);
  assert.deepEqual(r.removidos.map((l) => l.id), ["l-2"]); assert.deepEqual(r.alterados.map((l) => l.id), ["s"]);
  const depois = { ...com, lancamentos: r.lancamentos, importacoes: com.importacoes.map((i) => (i.id === "imp-x" ? { ...i, alterados: [], removidosExistentes: r.removidos } : i)) };
  assert.deepEqual(validar(depois).erros, [], "o resultado passa no validador do esquema");
  const volta = desfazerCompleto(depois, "imp-x");
  assert.equal(JSON.stringify(volta), JSON.stringify(d), "desfazer repõe a perna removida e tira a criada");
});

test("trocarDiaMes só mexe na coluna de data e só nos dois primeiros grupos", () => {
  assert.deepEqual(trocarDiaMes([["07/02/2026", "07/02/2026"]], 0), [["02/07/2026", "07/02/2026"]]);
  assert.deepEqual(trocarDiaMes([["2026-07-02"]], 0), [["2026-07-02"]]);
  assert.deepEqual(trocarDiaMes([["x"]], undefined), [["x"]]);
});

test("regras da base resolvem 'Restaurante e delivery' → cat-delivery pelo mapa de aliases; nome sem par fica null", () => {
  const d = dadosExemplo();
  const r = regrasAtivas(d);
  assert.equal(categorizar("IFOOD *RESTAURANTE", r).categoriaId, "cat-delivery");
  assert.equal(categorizar("PETZ", r).categoriaId, "cat-pet");
  assert.equal(categorizar("NETFLIX", r).categoriaNome, "Assinaturas"); assert.equal(categorizar("NETFLIX", r).categoriaId, "cat-assinaturas");
  assert.equal(categorizar("AMAZON", r).categoriaId, null, "'Compras' não tem par e NÃO inventa categoria");
  assert.equal(categoriasParaBase([]).length, 0);
  assert.equal(categorizar("PADARIA DO JOAO", r).regraId, "regra-padaria", "regra do usuário vence a base");
});

test("explicar: vencedora, perdedoras em ordem e forma normalizada; filtrarRegras esconde a base até buscar", () => {
  const d = dadosExemplo();
  const todas = todasAsRegras(d);
  const ex = explicar("PG *PADARIA DO JOAO 2/3", todas);
  assert.equal(ex.normalizada, "padaria do joao"); assert.equal(ex.vencedora.id, "regra-padaria"); assert.ok(ex.perderam.length >= 1 && ex.perderam[0].origem === "base");
  assert.equal(explicar("", todas).vencedora, null);
  assert.deepEqual(filtrarRegras(todas).map((r) => r.id), ["regra-padaria"], "padrão: só as da pessoa");
  assert.ok(filtrarRegras(todas, { busca: "uber" }).some((r) => r.origem === "base"), "busca abre a base");
  assert.ok(filtrarRegras(todas, { origem: "base" }).length > 500);
  assert.deepEqual(importadosRecentes(d).map((l) => l.id), ["l-imp-2", "l-imp-1"]);
});

test("exportarCSV: ; vírgula decimal, nomes resolvidos, aspas dobradas e apóstrofo contra fórmula", () => {
  const csv = exportarCSV(dadosExemplo());
  const linhas = csv.split("\n");
  assert.equal(linhas[0], "data;tipo;categoria;valor;descricao;conta_ou_cartao;destino;meio;status");
  assert.ok(linhas.includes('2026-07-01;receita;"Salário";6500,00;"Salário";"Nubank";"";pix;efetivado'));
  assert.ok(csv.includes('"\'=HYPERLINK(""http://x"";""almoço"")"'), "célula que começa com = não vira fórmula na planilha");
});

test("resumoColecoes e prepararMescla: tombstone lista↔objeto, faturas e snapshots preservados, resultado válido e resumo por coleção", () => {
  const a = dadosExemplo();
  const b = structuredClone(a);
  b.lancamentos = [...b.lancamentos, { ...b.lancamentos[0], id: "l-outro", descricao: "Do outro", atualizadoEm: "2026-10-06T00:00:00.000Z" }];
  b.lancamentos = b.lancamentos.filter((l) => l.id !== "l-4");
  b.meta.removidos = [{ id: "l-4", colecao: "lancamentos", removidoEm: "2026-10-06T00:00:00.000Z" }];
  b.faturas = [{ cartaoId: "cartao-nu", ym: "2026-07", status: "aberta", pagoCentavos: 0 }];
  b.snapshots = [{ ym: "2026-09", patrimonioCentavos: 1, ativos: 1, passivos: 0 }];
  b.meta.atualizadoEm = "2026-10-06T00:00:00.000Z";
  const r = prepararMescla(a, b);
  assert.equal(r.ok, true, JSON.stringify(r.erros));
  assert.deepEqual(validar(r.dados).erros, []);
  assert.ok(r.dados.lancamentos.some((l) => l.id === "l-outro")); assert.ok(!r.dados.lancamentos.some((l) => l.id === "l-4"), "tombstone apaga dos dois lados");
  assert.deepEqual(r.dados.meta.removidos, [{ id: "l-4", colecao: "lancamentos", removidoEm: "2026-10-06T00:00:00.000Z" }]);
  assert.equal(r.dados.faturas.length, 1); assert.equal(r.dados.snapshots.length, 1);
  assert.deepEqual(r.resumo, [{ colecao: "lancamentos", novos: 1, atualizados: 0, removidos: 1 }]);
  assert.equal(JSON.stringify(prepararMescla(a, b).dados), JSON.stringify(prepararMescla(b, a).dados), "comutativa");
  assert.deepEqual(prepararMescla(a, structuredClone(a)).resumo, [], "mesclar consigo mesmo não muda nada");
  assert.deepEqual(resumoColecoes(a, vazio()).find((x) => x.colecao === "lancamentos"), { colecao: "lancamentos", antes: 6, depois: 0 });
});

test("forcaSenha, registrosDesdeBackup, webkitNaoInstalado e ehBackupCifrado", () => {
  assert.deepEqual(forcaSenha("1234567"), { nivel: 0, codigo: "curta" });
  assert.equal(forcaSenha("12345678").codigo, "fraca");
  assert.equal(forcaSenha("Senha-2026ok").codigo, "razoavel");
  assert.equal(forcaSenha("uma frase longa e Segura 2026").codigo, "forte");
  const d = dadosExemplo();
  assert.equal(registrosDesdeBackup(d), 30, "sem backup tudo conta: 2 contas + 1 cartão + 17 categorias + 6 lançamentos + 1 regra + 1 importação + 1 peso + 1 treino");
  assert.equal(registrosDesdeBackup({ ...d, meta: { ...d.meta, ultimoBackupEm: "2026-10-05T13:00:00.000Z" } }), 0);
  assert.equal(registrosDesdeBackup({ ...d, meta: { ...d.meta, ultimoBackupEm: "2026-10-01T00:00:00.000Z" } }), 6);
  const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  assert.equal(webkitNaoInstalado(safari), true);
  assert.equal(webkitNaoInstalado(safari, { standalone: true }), false);
  assert.equal(webkitNaoInstalado("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36"), false);
  assert.equal(ehBackupCifrado('{"fmt":"fitrich-enc"}'), false); assert.equal(ehBackupCifrado("lixo"), false);
});

test("criarCifrador sem Worker cai na thread da página e faz ida e volta; senha errada falha limpo", async () => {
  const { webcrypto } = await import("node:crypto");
  globalThis.crypto ??= webcrypto;
  const c = criarCifrador({ WorkerImpl: undefined });
  const arq = await c.cifrar('{"a":1}', "senha boa 12345");
  assert.equal(ehBackupCifrado(arq), true);
  assert.equal(await c.decifrar(arq, "senha boa 12345"), '{"a":1}');
  await assert.rejects(c.decifrar(arq, "errada"), /senha incorreta/);
});

test("categorias-br.mjs é a cópia exata do categorias-br.json (o .mjs carrega no Node 18.19 e em navegador velho; o JSON é a fonte)", async () => {
  const { readFileSync } = await import("node:fs");
  const { default: modulo } = await import("../../app/js/v2/categorizar/categorias-br.mjs");
  const json = JSON.parse(readFileSync(new URL("../../app/js/v2/categorizar/categorias-br.json", import.meta.url), "utf8"));
  assert.deepEqual(modulo, json, "rode: node app/js/v2/categorizar/gerar-categorias.mjs");
});
