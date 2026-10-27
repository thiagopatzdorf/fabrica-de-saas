// Importação OFX/CSV do Fitrich v2: cada fixture → N lançamentos com centavos exatos, reimportar = 0
// novos, desfazer = estado idêntico. Node 18: `globalThis.crypto` não existe sem flag, por isso o
// digest vem injetado de node:crypto (no navegador é crypto.subtle).
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";
import { lerCentavos, lerDataExtrato, decodificar, decodificarCp1252 } from "../../app/js/v2/importar/comum.mjs";
import { lerOFX, movimentosDoOFX, tokenizar } from "../../app/js/v2/importar/ofx.mjs";
import { lerCSV, aplicarMapeamento, detectarSeparador, dividirTabela, salvarPerfil, PERFIS_CSV_BASE, LIMIAR_CONFIANCA } from "../../app/js/v2/importar/csv.mjs";
import { classificar } from "../../app/js/v2/importar/dedupe.mjs";
import { sugerirTransferencias, confirmarTransferencia } from "../../app/js/v2/importar/transferencias.mjs";
import { prepararImportacao, aplicarImportacao, desfazerImportacao } from "../../app/js/v2/importar/preview.mjs";

const fixture = (nome) => readFileSync(fileURLToPath(new URL(`../fixtures/${nome}`, import.meta.url)));
const digest = (bytes) => webcrypto.subtle.digest("SHA-256", bytes);
const injecoes = () => { let n = 0; return { novoId: () => `id-${++n}`, agora: () => "2026-10-05T12:00:00.000Z", digest }; };
const vazio = () => ({ versao: 2, lancamentos: [], importacoes: [] });

// ---------- comum ----------
test("dinheiro vira centavos sem float: vírgula, ponto, milhar, negativo, parênteses, espaço após o sinal", () => {
  assert.equal(lerCentavos("-150.00"), -15000);
  assert.equal(lerCentavos("1.234,56"), 123456);
  assert.equal(lerCentavos("1,234.56"), 123456);
  assert.equal(lerCentavos("1,234"), 123400); // milhar inglês: dinheiro não tem 3 decimais
  assert.equal(lerCentavos("1.234"), 123400);
  assert.equal(lerCentavos("\"94,59\""), null); // aspas são do CSV, não do número
  assert.equal(lerCentavos("94,59"), 9459);
  assert.equal(lerCentavos("(99,90)"), -9990);
  assert.equal(lerCentavos("- 1500,00"), -150000);
  assert.equal(lerCentavos("-R$ 45,90"), -4590);
  assert.equal(lerCentavos("R$ 1.234,56"), 123456);
  assert.equal(lerCentavos("0,10"), 10);
  assert.equal(lerCentavos("0"), 0);
  assert.equal(lerCentavos("150,00-"), -15000);
  assert.equal(lerCentavos("abc"), null);
  assert.equal(lerCentavos(""), null);
  assert.equal(lerCentavos("12,345"), 1234500); // doze mil: três decimais não existem em extrato
});

test("data do extrato: OFX com fuso NÃO vira o dia; DD/MM/AA vira 20AA; 31/02 é recusado", () => {
  assert.equal(lerDataExtrato("20260702000000[-3:BRT]"), "2026-07-02");
  assert.equal(lerDataExtrato("20260731235959[-3:BRT]"), "2026-07-31");
  assert.equal(lerDataExtrato("20260702"), "2026-07-02");
  assert.equal(lerDataExtrato("20260702120000.000[-3:BRT]"), "2026-07-02");
  assert.equal(lerDataExtrato("02/07/2026"), "2026-07-02");
  assert.equal(lerDataExtrato("2/7/2026 14:35"), "2026-07-02");
  assert.equal(lerDataExtrato("02/07/26"), "2026-07-02");
  assert.equal(lerDataExtrato("2026-07-02"), "2026-07-02");
  assert.equal(lerDataExtrato("31/02/2026"), null);
  assert.equal(lerDataExtrato("lixo"), null);
});

test("bytes cp1252 com rótulo UTF-8 errado não viram mojibake, e UTF-8 de verdade continua UTF-8", () => {
  const cp = new Uint8Array([0x53, 0xe3, 0x6f, 0x20, 0x96, 0x20, 0x41, 0xe7]); // "São – Aç" em cp1252
  assert.equal(decodificar(cp, { charsetDeclarado: "1252" }).texto, "São – Aç");
  assert.equal(decodificarCp1252(new Uint8Array([0x80, 0x96])), "€–"); // 0x96 é traço, não controle (Node 22 ICU erra)
  const utf = new TextEncoder().encode("São Paulo");
  assert.deepEqual(decodificar(utf, { charsetDeclarado: "1252" }), { texto: "São Paulo", encoding: "utf-8" });
  assert.equal(decodificar(new Uint8Array([0xef, 0xbb, 0xbf, 0x61])).texto, "a"); // BOM fora
});

// ---------- OFX ----------
test("OFX SGML cp1252 do banco: 6 STMTTRN, acentos certos, vírgula decimal, [-3:BRT] no mesmo dia, conta e saldo", () => {
  const r = lerOFX(fixture("extrato-sgml-cp1252.ofx"));
  assert.equal(r.versao, "1");
  assert.equal(r.encoding, "windows-1252");
  assert.equal(r.cabecalho.CHARSET, "1252");
  assert.equal(r.instituicao.org, "Banco Fictício S.A.");
  assert.equal(r.contas.length, 1);
  const c = r.contas[0];
  assert.equal(c.tipo, "conta");
  assert.equal(c.acctid, "98765-4");
  assert.equal(c.branchid, "1234-5");
  assert.equal(c.accttype, "CHECKING");
  assert.deepEqual(c.saldo, { centavos: 234567, data: "2026-07-31" }); // "2.345,67"
  assert.deepEqual(c.periodo, { inicio: "2026-07-01", fim: "2026-07-31" });
  assert.equal(c.movimentos.length, 6);
  assert.deepEqual(c.movimentos.map((m) => [m.data, m.valorCentavos, m.fitid]), [
    ["2026-07-02", -15000, "2026070200001"],
    ["2026-07-02", -4590, "2026070200002"],
    ["2026-07-02", -4590, "2026070200002"],
    ["2026-07-05", 123456, "2026070500003"], // "1.234,56" com vírgula decimal; DTPOSTED só com a data
    ["2026-07-10", -8990, "2026071000004"], // "-89,90"
    ["2026-07-31", -1000, "2026073100005"], // 235959[-3:BRT] continua dia 31
  ]);
  assert.equal(c.movimentos[0].descricao, "Compra com Cartão – PÃO DE AÇÚCAR");
  assert.equal(c.movimentos[4].descricao, "Pagamento Convênio – ENEL SÃO PAULO");
  assert.equal(c.movimentos[3].descricao, "TED recebida Salário Empresa Ltda"); // NAME + MEMO
  assert.deepEqual(r.avisos, []);
});

test("OFX 2.x XML UTF-8 de cartão: tags fechadas no mesmo tokenizador, CCACCTFROM, entidades, descrição hostil intacta como texto", () => {
  const r = lerOFX(fixture("fatura-xml-utf8.ofx"));
  assert.equal(r.versao, "2");
  assert.equal(r.encoding, "utf-8");
  const c = r.contas[0];
  assert.equal(c.tipo, "cartao");
  assert.equal(c.acctid, "1234********5678");
  assert.deepEqual(c.saldo, { centavos: -12449, data: "2026-07-31" });
  assert.deepEqual(c.movimentos.map((m) => m.valorCentavos), [-9459, -2990, 150000]);
  assert.equal(c.movimentos[0].descricao, "Ifood *Restaurante Sabor & Arte 2/3"); // &amp; decodificado
  // O parser não executa nem perde: a UI escapa ao renderizar.
  assert.equal(c.movimentos[1].descricao, "<img src=x onerror=alert(1)> Netflix.com");
  assert.equal(movimentosDoOFX(r).length, 3);
  assert.equal(movimentosDoOFX(r)[0].acctid, "1234********5678");
});

test("tokenizador SGML: folha vazia seguida de outra tag não engole a tag seguinte", () => {
  const raiz = tokenizar("<OFX><STMTTRN><MEMO>\n<NAME>Loja\n<TRNAMT>-1.00\n</STMTTRN></OFX>");
  const trn = raiz.filhos[0].filhos[0];
  assert.deepEqual(trn.filhos.map((f) => f.tag), ["MEMO", "NAME", "TRNAMT"]);
  assert.equal(trn.filhos[1].texto, "Loja");
});

test("arquivo que não é OFX lança erro legível em vez de devolver lista vazia", () => {
  assert.throws(() => lerOFX("isto é um PDF disfarçado"), /OFX/);
});

// ---------- CSV ----------
test("Nubank conta: perfil reconhecido, DD/MM/AAAA, sinal do banco, vírgula dentro de aspas não quebra a linha", () => {
  const r = lerCSV(fixture("nubank-conta.csv"));
  assert.equal(r.perfil, "nubank-conta");
  assert.equal(r.separador, ",");
  assert.equal(r.confianca, 1);
  assert.deepEqual(r.colunasNaoMapeadas, []);
  assert.deepEqual(r.linhas.map((l) => [l.data, l.valorCentavos, l.identificador]), [
    ["2026-07-01", -15000, "66a1b2c3-aaaa-0001"], ["2026-07-02", -4590, "66a1b2c3-aaaa-0002"],
    ["2026-07-05", 123456, "66a1b2c3-aaaa-0003"], ["2026-07-10", -50000, "66a1b2c3-aaaa-0004"],
  ]);
  assert.equal(r.linhas[2].descricao, "Transferência Recebida - EMPRESA LTDA, ME - 12.345.678/0001-90");
});

test("Nubank cartão nos dois formatos de amount (\"94,59\" e 94.59): mesmos centavos, compra negativa, pagamento positivo, BOM fora", () => {
  const a = lerCSV(fixture("nubank-cartao-virgula.csv")), b = lerCSV(fixture("nubank-cartao-ponto.csv"));
  for (const r of [a, b]) {
    assert.equal(r.perfil, "nubank-cartao");
    assert.equal(r.mapeamentoDetectado.sinal, "cartao");
    assert.deepEqual(r.linhas.map((l) => [l.data, l.valorCentavos]), [["2026-07-03", -9459], ["2026-07-04", -2990], ["2026-07-06", -1875], ["2026-07-10", 150000]]);
  }
  assert.equal(a.cabecalho[0], "date"); // o BOM não ficou grudado na primeira célula
});

test("Inter: 6 linhas de resumo antes da tabela, `;`, \"R$ 1.234,56\", Histórico + Descrição juntos, `;` dentro de aspas", () => {
  const r = lerCSV(fixture("inter-conta.csv"));
  assert.equal(r.perfil, "inter-conta");
  assert.equal(r.linhaCabecalho, 6);
  assert.equal(r.separador, ";");
  assert.deepEqual(r.linhas.map((l) => [l.data, l.valorCentavos, l.saldoCentavos]), [
    ["2026-07-02", -4590, 95410], ["2026-07-05", 123456, 218866], ["2026-07-10", -8990, 209876], ["2026-07-15", -6010, 203866],
  ]);
  assert.equal(r.linhas[3].descricao, "Pagamento efetuado - FATURA CARTAO; INTER");
  assert.equal(r.erros.length, 0); // as linhas de resumo não viram erro: ficaram antes do cabeçalho
});

test("CSV `;` em latin1 com \\r\\n, DD/MM/AA e negativo entre parênteses: detecção genérica sem perfil, confiança 1", () => {
  const r = lerCSV(fixture("generico-ponto-virgula-latin1.csv"));
  assert.equal(r.perfil, null);
  assert.equal(r.encoding, "windows-1252");
  assert.equal(r.confianca, 1);
  assert.deepEqual(r.linhas.map((l) => [l.data, l.valorCentavos, l.descricao, l.identificador]), [
    ["2026-07-01", -9990, "Mensalidade Academia Smart Fit", "0001"],
    ["2026-07-03", -104530, "Farmácia Drogasil", "0002"],
    ["2026-07-05", 350000, "Salário", "0003"],
  ]);
});

test("CSV só com débito e crédito em colunas separadas: débito sai negativo, crédito positivo", () => {
  const r = lerCSV(fixture("generico-debito-credito.csv"));
  assert.equal(r.mapeamentoDetectado.colunas.valor, undefined);
  assert.deepEqual(r.linhas.map((l) => l.valorCentavos), [-25000, 30000, -1875]);
  assert.equal(r.confianca, 1);
});

test("CSV sem cabeçalho reconhecível: confiança 0, nenhuma linha, tabela devolvida para a tela de mapeamento manual", () => {
  const r = lerCSV("x;y;z\n01/07/2026;Loja A;-10,00\n02/07/2026;Loja B;20,00\n");
  assert.equal(r.confianca, 0);
  assert.ok(r.confianca < LIMIAR_CONFIANCA);
  assert.equal(r.motivo, "cabecalho_nao_encontrado");
  assert.deepEqual(r.linhas, []);
  assert.equal(r.tabela.length, 3);
});

test("mapeamento manual por índice sem cabeçalho e por nome de coluna; perfil salvo é reconhecido na próxima leitura", () => {
  const texto = "x;y;z\n01/07/2026;Loja A;-10,00\n02/07/2026;Loja B;20,00\n";
  const porIndice = aplicarMapeamento(texto, { linhaCabecalho: -1, separador: ";", colunas: { data: 0, descricao: 1, valor: 2 }, sinal: "banco" });
  // a linha "x;y;z" não é data nem valor: vira erro listado, não lançamento
  assert.equal(porIndice.erros.length, 1);
  assert.deepEqual(porIndice.linhas.map((l) => [l.data, l.valorCentavos, l.descricao]), [["2026-07-01", -1000, "Loja A"], ["2026-07-02", 2000, "Loja B"]]);
  const comNomes = aplicarMapeamento("Dia;Loja;Quanto\n01/07/2026;Loja A;-10,00\n", { linhaCabecalho: 0, separador: ";", colunas: { data: "Dia", descricao: "loja", valor: "QUANTO" } });
  assert.deepEqual(comNomes.linhas.map((l) => l.valorCentavos), [-1000]);
  const cartao = aplicarMapeamento("Dia;Loja;Quanto\n01/07/2026;Loja A;10,00\n", { colunas: { data: "Dia", descricao: "Loja", valor: "Quanto" }, sinal: "cartao" });
  assert.equal(cartao.linhas[0].valorCentavos, -1000);
  // perfil salvo
  const perfis = salvarPerfil(PERFIS_CSV_BASE, { id: "meu-banco", nome: "Meu banco", cabecalho: ["Dia", "Loja", "Quanto"], mapeamento: { colunas: { data: 0, descricao: 1, valor: 2 }, sinal: "banco" } });
  assert.equal(perfis.length, PERFIS_CSV_BASE.length + 1);
  const r = lerCSV("Dia;Loja;Quanto\n01/07/2026;Loja A;-10,00\n", { perfis });
  assert.equal(r.perfil, "meu-banco");
  assert.equal(r.confianca, 1);
  assert.equal(lerCSV("Dia;Loja;Quanto\n01/07/2026;Loja A;-10,00\n").confianca, 0); // sem o perfil: "Quanto" não é sinônimo
});

test("detector de separador ignora vírgula dentro de aspas e divisor respeita quebra de linha entre aspas", () => {
  assert.equal(detectarSeparador('date,title,amount\n2026-07-03,"Loja, filial","94,59"\n'), ",");
  assert.equal(detectarSeparador("a;b;c\n1;2;3\n"), ";");
  assert.equal(detectarSeparador("a\tb\tc\n1\t2\t3\n"), "\t");
  assert.deepEqual(dividirTabela('a;"linha\nquebrada";c\r\n1;"com ""aspas""";3', ";"), [["a", "linha\nquebrada", "c"], ["1", 'com "aspas"', "3"]]);
});

// ---------- dedupe ----------
test("FITID repetido no arquivo com data e valor iguais é 1 lançamento; FITID igual com valor diferente é novo", async () => {
  const movs = movimentosDoOFX(lerOFX(fixture("extrato-sgml-cp1252.ofx")));
  const r = await classificar(movs, [], { contaId: "c1" }, { digest });
  assert.deepEqual(r.map((x) => x.status), ["novo", "novo", "jaExiste", "novo", "novo", "novo"]);
  assert.equal(r[2].motivo, "fitid_repetido_no_arquivo");
  const existentes = [{ id: "e1", contaId: "c1", data: "2026-07-01", tipo: "despesa", centavos: 4500, descricao: "Pix pendente", fitid: "2026070200002", hash: "h" }];
  const r2 = await classificar([movs[1]], existentes, { contaId: "c1" }, { digest });
  assert.equal(r2[0].status, "novo");
  assert.equal(r2[0].motivo, "fitid_reemitido");
});

test("sem FITID: hash por conta|data|centavos|descrição; mesma data e valor com outra descrição é possível duplicata; outra conta não interfere", async () => {
  const mov = { data: "2026-07-01", valorCentavos: -1000, descricao: "Café  Ótimo" };
  const [a] = await classificar([mov], [], { contaId: "c1" }, { digest });
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  const [b] = await classificar([{ ...mov, descricao: "cafe otimo" }], [], { contaId: "c1" }, { digest });
  assert.equal(a.hash, b.hash); // acento, caixa e espaço duplo não mudam a chave
  const [outraConta] = await classificar([mov], [], { contaId: "c2" }, { digest });
  assert.notEqual(a.hash, outraConta.hash);
  const salvo = { id: "e1", contaId: "c1", data: "2026-07-01", tipo: "despesa", centavos: 1000, descricao: "Café Ótimo", hash: a.hash };
  const [ja] = await classificar([mov], [salvo], { contaId: "c1" }, { digest });
  assert.equal(ja.status, "jaExiste");
  assert.equal(ja.existenteId, "e1");
  const [dup] = await classificar([{ ...mov, descricao: "Padaria" }], [salvo], { contaId: "c1" }, { digest });
  assert.equal(dup.status, "possivelDuplicata");
  const [livre] = await classificar([mov], [salvo], { contaId: "c2" }, { digest });
  assert.equal(livre.status, "novo");
});

test("duas linhas idênticas no mesmo arquivo CSV são dois lançamentos, e reimportar acha os dois", async () => {
  const movs = [{ data: "2026-07-01", valorCentavos: -500, descricao: "Café" }, { data: "2026-07-01", valorCentavos: -500, descricao: "Café" }];
  const r = await classificar(movs, [], { contaId: "c1" }, { digest });
  assert.deepEqual(r.map((x) => x.status), ["novo", "novo"]);
  assert.notEqual(r[0].hash, r[1].hash);
  const salvos = r.map((x, i) => ({ id: `e${i}`, contaId: "c1", data: x.data, tipo: "despesa", centavos: 500, descricao: "Café", hash: x.hash }));
  const de_novo = await classificar(movs, salvos, { contaId: "c1" }, { digest });
  assert.deepEqual(de_novo.map((x) => x.status), ["jaExiste", "jaExiste"]);
});

// ---------- transferências ----------
test("transferência é sugerida (−v em A, +v em B em d±1, descrição com pix/transf), nunca aplicada sozinha; pix para terceiro não vira par", () => {
  const lancs = [
    { id: "a", contaId: "c1", data: "2026-07-02", tipo: "despesa", centavos: 50000, descricao: "Pix enviado para conta Inter" },
    { id: "b", contaId: "c2", data: "2026-07-03", tipo: "receita", centavos: 50000, descricao: "Pix recebido" },
    { id: "c", contaId: "c1", data: "2026-07-05", tipo: "despesa", centavos: 10000, descricao: "Pix enviado João" },
    { id: "d", contaId: "c3", data: "2026-07-05", tipo: "receita", centavos: 10000, descricao: "Rendimento" }, // descrição não cheira a transferência
    { id: "e", contaId: "c1", data: "2026-07-10", tipo: "despesa", centavos: 20000, descricao: "Transf entre contas" },
    { id: "f", contaId: "c2", data: "2026-07-13", tipo: "receita", centavos: 20000, descricao: "Transf recebida" }, // 3 dias: fora da janela
  ];
  const s = sugerirTransferencias(lancs);
  assert.deepEqual(s.map((x) => [x.saidaId, x.entradaId, x.centavos, x.diasDiferenca]), [["a", "b", 50000, 1]]);
  assert.equal(lancs[0].tipo, "despesa"); // sugerir não muda nada
  const depois = confirmarTransferencia(lancs, s[0], { agora: () => "t" });
  assert.equal(depois.find((l) => l.id === "a").tipo, "transferencia");
  assert.equal(depois.find((l) => l.id === "a").contaDestinoId, "c2");
  assert.equal(depois.find((l) => l.id === "b").refId, "a");
  assert.equal(depois.find((l) => l.id === "c").tipo, "despesa");
  assert.equal(sugerirTransferencias(lancs, { janelaDias: 3 }).length, 2);
});

// ---------- preview / importação / desfazer ----------
test("fluxo inteiro com OFX: preview com 5 novos e totais; reimportar = 0 novos; desfazer devolve estado idêntico", async () => {
  const bytes = fixture("extrato-sgml-cp1252.ofx");
  const movs = movimentosDoOFX(lerOFX(bytes));
  const inj = injecoes();
  const antes = vazio();
  const congelado = JSON.stringify(antes);
  const p1 = await prepararImportacao({ arquivo: { nome: "extrato.ofx", bytes }, movimentos: movs, dados: antes, dono: { contaId: "c1" }, ...inj });
  assert.equal(p1.preview.novos.length, 5);
  assert.equal(p1.preview.jaExistem.length, 1);
  assert.deepEqual(p1.preview.totais, { n: 5, somaCentavos: -15000 - 4590 + 123456 - 8990 - 1000, jaExistem: 1, possiveisDuplicatas: 0 });
  assert.match(p1.importacao.hashArquivo, /^[0-9a-f]{64}$/);
  assert.equal(p1.importacao.contaId, "c1");
  const l = p1.preview.novos[0];
  assert.equal(l.tipo, "despesa"); assert.equal(l.centavos, 15000); assert.equal(l.origem, "importacao");
  assert.equal(l.importacaoId, p1.importacao.id); assert.equal(l.fitid, "2026070200001"); assert.equal(l.contaId, "c1");
  assert.equal(p1.preview.novos[1].meio, "pix");
  const depois = aplicarImportacao(antes, p1);
  assert.equal(depois.lancamentos.length, 5);
  assert.deepEqual(depois.importacoes[0].idsCriados, p1.preview.novos.map((x) => x.id));
  assert.equal(JSON.stringify(antes), congelado); // o original não foi mexido
  const p2 = await prepararImportacao({ arquivo: { nome: "extrato.ofx", bytes }, movimentos: movs, dados: depois, dono: { contaId: "c1" }, ...inj });
  assert.equal(p2.preview.novos.length, 0);
  assert.equal(p2.preview.jaExistem.length, 6);
  assert.equal(p2.importacao.hashArquivo, p1.importacao.hashArquivo);
  const desfeito = desfazerImportacao(depois, p1.importacao.id);
  assert.deepEqual(desfeito, antes);
  assert.throws(() => desfazerImportacao(desfeito, p1.importacao.id), /não encontrada/);
});

test("fluxo com CSV sem identificador: reimportar o mesmo arquivo dá 0 novos; desfazer só remove os ids daquela importação", async () => {
  const bytes = fixture("inter-conta.csv");
  const movs = lerCSV(bytes).linhas;
  const inj = injecoes();
  const antes = { ...vazio(), lancamentos: [{ id: "manual-1", contaId: "c1", data: "2026-07-01", tipo: "despesa", centavos: 100, descricao: "Manual" }] };
  const p1 = await prepararImportacao({ arquivo: { nome: "inter.csv", bytes }, movimentos: movs, dados: antes, dono: { contaId: "c1" }, ...inj });
  assert.equal(p1.preview.novos.length, 4);
  const d1 = aplicarImportacao(antes, p1);
  const p2 = await prepararImportacao({ arquivo: { nome: "inter.csv", bytes }, movimentos: movs, dados: d1, dono: { contaId: "c1" }, ...inj });
  assert.equal(p2.preview.novos.length, 0);
  assert.equal(p2.preview.jaExistem.length, 4);
  // segunda importação, de outro arquivo (cartão), e desfazer só a primeira
  const cartao = lerCSV(fixture("nubank-cartao-ponto.csv")).linhas;
  const p3 = await prepararImportacao({ arquivo: { nome: "cartao.csv", bytes: fixture("nubank-cartao-ponto.csv") }, movimentos: cartao, dados: d1, dono: { cartaoId: "k1" }, ...inj });
  assert.equal(p3.preview.novos.length, 4);
  assert.equal(p3.preview.novos[0].cartaoId, "k1");
  assert.equal(p3.preview.novos[0].meio, "credito");
  const d2 = aplicarImportacao(d1, p3);
  assert.equal(d2.lancamentos.length, 9);
  const d3 = desfazerImportacao(d2, p1.importacao.id);
  assert.equal(d3.lancamentos.length, 5);
  assert.deepEqual(d3.lancamentos.map((l) => l.id), ["manual-1", ...p3.preview.novos.map((l) => l.id)]);
  assert.deepEqual(d3.importacoes.map((i) => i.id), [p3.importacao.id]);
});

test("duplicata possível só entra se a pessoa marcar; transferência entre conta e cartão vira sugestão no preview", async () => {
  const inj = injecoes();
  const antes = { ...vazio(), lancamentos: [
    { id: "e1", contaId: "c1", data: "2026-07-10", tipo: "despesa", centavos: 50000, descricao: "Pagamento fatura Nubank", hash: "x" },
    { id: "e2", contaId: "c1", data: "2026-07-03", tipo: "despesa", centavos: 9459, descricao: "Outra coisa", hash: "y" },
  ] };
  const cartao = lerCSV(fixture("nubank-cartao-ponto.csv")).linhas; // tem "Pagamento recebido" +1500,00 em 10/07
  const movs = [...cartao, { data: "2026-07-10", valorCentavos: 50000, descricao: "Pagamento recebido" }];
  const p = await prepararImportacao({ arquivo: { nome: "c.csv", texto: "x" }, movimentos: movs, dados: antes, dono: { cartaoId: "k1" }, ...inj });
  assert.equal(p.preview.novos.length, 5);
  assert.equal(p.preview.transferenciasSugeridas.length, 1);
  assert.equal(p.preview.transferenciasSugeridas[0].saidaId, "e1");
  assert.equal(p.preview.transferenciasSugeridas[0].centavos, 50000);
  // duplicata: mesmo cartão, mesma data e valor, descrição diferente
  const comDup = { ...vazio(), lancamentos: [{ id: "e3", cartaoId: "k1", data: "2026-07-03", tipo: "despesa", centavos: 9459, descricao: "Restaurante Sabor", hash: "z" }] };
  const p2 = await prepararImportacao({ arquivo: { nome: "c.csv", texto: "x" }, movimentos: cartao, dados: comDup, dono: { cartaoId: "k1" }, ...inj });
  assert.equal(p2.preview.possiveisDuplicatas.length, 1);
  assert.equal(p2.preview.possiveisDuplicatas[0].existenteId, "e3");
  assert.equal(p2.preview.novos.length, 3);
  assert.equal(aplicarImportacao(comDup, p2).lancamentos.length, 1 + 3);
  const comTudo = aplicarImportacao(comDup, p2, { incluirDuplicatas: [p2.preview.possiveisDuplicatas[0].id] });
  assert.equal(comTudo.lancamentos.length, 1 + 4);
  assert.equal(comTudo.lancamentos.at(-1).existenteId, undefined); // campo do preview não vai para o lançamento
  assert.deepEqual(desfazerImportacao(comTudo, p2.importacao.id), comDup);
});

test("nenhum módulo da importação usa rede (fetch/XHR/beacon/WebSocket)", () => {
  for (const nome of ["comum", "ofx", "csv", "dedupe", "transferencias", "preview"]) {
    const codigo = readFileSync(fileURLToPath(new URL(`../../app/js/v2/importar/${nome}.mjs`, import.meta.url)), "utf-8");
    for (const proibido of ["fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "document.", "window."]) assert.ok(!codigo.includes(proibido), `${nome}.mjs usa ${proibido}`);
  }
});
