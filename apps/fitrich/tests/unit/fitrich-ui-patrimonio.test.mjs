// Lógica de apresentação PURA das telas Patrimônio, Metas, Dívidas, Shape e Check-in (área B), em Node 18 sem
// DOM: agrupamentos, projeções em linguagem simples, paridade pt-BR/en dos cinco dicionários e as regras duras
// do contrato (nenhum `style=`/innerHTML nos módulos de tela; nenhuma palavra de culpa nos dicionários).
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { paridade } from "../../app/js/v2/ui/i18n.mjs";
import { centavosDeTexto, numeroDeTexto, textoDeCentavos, dadosExternos, reconciliarConta, gravarSnapshot } from "../../app/js/v2/ui/telas/_comum.mjs";
import { composicaoDivergente, serieDozeMeses, variacaoVsMesPassado } from "../../app/js/v2/ui/telas/patrimonio.mjs";
import { atualDaMeta, mesesNaMetaPoupanca, projecaoMeses, resumoPeso, ritmoMensal, alvoReserva } from "../../app/js/v2/ui/telas/metas.mjs";
import { efeitoExtra, reservaCompletaDe, somaMinimos, tabelaDaDivida } from "../../app/js/v2/ui/telas/dividas.mjs";
import { cruzamentos, mensalidadeAcademia, pontosDoGrafico, resumoPeso as resumoPesoShape } from "../../app/js/v2/ui/telas/shape.mjs";
import { dadosDoResumo, ehRecomeco, linhasDoCartao, semCategoria, ultimos7Dias } from "../../app/js/v2/ui/telas/checkin.mjs";
import { patrimonioLiquido } from "../../app/js/v2/patrimonio.mjs";
import { saldoDaConta, validar } from "../../app/js/v2/esquema.mjs";
import { criarFmt } from "../../app/js/v2/ui/fmt.mjs";
import { criarI18n } from "../../app/js/v2/ui/i18n.mjs";
import { dadosExemplo, HOJE } from "../ui/dados-exemplo-patrimonio.mjs";
import dicPatrimonio from "../../app/js/v2/ui/telas/patrimonio.i18n.mjs";
import dicMetas from "../../app/js/v2/ui/telas/metas.i18n.mjs";
import dicDividas from "../../app/js/v2/ui/telas/dividas.i18n.mjs";
import dicShape from "../../app/js/v2/ui/telas/shape.i18n.mjs";
import dicCheckin from "../../app/js/v2/ui/telas/checkin.i18n.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const TELAS = join(AQUI, "..", "..", "app", "js", "v2", "ui", "telas");
const NOMES = ["patrimonio", "metas", "dividas", "shape", "checkin"];
const DICS = { patrimonio: dicPatrimonio, metas: dicMetas, dividas: dicDividas, shape: dicShape, checkin: dicCheckin };
const dic = (n) => DICS[n];

test("dados de exemplo do harness passam no validador do esquema (senão todo teste de tela testaria lixo)", () => {
  const v = validar(dadosExemplo());
  assert.deepEqual(v.erros, []);
});

test("cada dicionário tem paridade pt-BR/en (mesmas chaves, mesmos placeholders) e só chaves com o prefixo da tela", () => {
  for (const n of NOMES) {
    const d = dic(n);
    assert.deepEqual(paridade(d), [], n);
    for (const k of Object.keys(d["pt-BR"])) assert.ok(k.startsWith(`${n}.`), `${n}: chave ${k} sem prefixo`);
  }
});

test("nenhuma palavra de culpa nos dicionários (estourou, falhou, sequência, streak, atrasado, culpa)", () => {
  const proibidas = /estourou|falhou|perdeu a sequ|sequência|sequencia|streak|atrasad|culpa|you broke|failed/i;
  for (const n of NOMES) for (const [idioma, d] of Object.entries(dic(n))) for (const [k, v] of Object.entries(d)) assert.ok(!proibidas.test(v), `${n} ${idioma} ${k}: "${v}"`);
});

test("módulos de tela não usam innerHTML, atributo style nem texto literal fora de t() nos elementos (CSP e i18n)", () => {
  for (const arq of readdirSync(TELAS).filter((f) => f.endsWith(".mjs") && !f.endsWith(".i18n.mjs"))) {
    const src = readFileSync(join(TELAS, arq), "utf8");
    assert.ok(!/import[^;]*\bwith\s*\{|\bassert\s*\{\s*type/.test(src), `${arq} usa import de JSON (o Node 18.19.1 do CI não aceita)`);
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(src), `${arq} usa innerHTML`);
    assert.ok(!/\bstyle:\s*["'`]/.test(src) && !/setAttribute\(\s*["']style/.test(src), `${arq} usa atributo style`);
    assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|sendBeacon/.test(src), `${arq} fala com a rede`);
    assert.ok(!/from "\.\/(patrimonio|metas|dividas|shape|checkin)\.mjs"/.test(src), `${arq} importa outra tela`);
  }
});

test("centavosDeTexto entende vírgula, ponto de milhar, R$ e recusa lixo; textoDeCentavos volta pelo idioma", () => {
  assert.equal(centavosDeTexto("1.234,56"), 123456);
  assert.equal(centavosDeTexto("1234.56"), 123456);
  assert.equal(centavosDeTexto("R$ 1.234"), 123400);
  assert.equal(centavosDeTexto("−12,5"), -1250);
  assert.equal(centavosDeTexto("abc"), null);
  assert.equal(centavosDeTexto("1,234"), 123400, "três dígitos depois do separador é milhar, não centavos");
  assert.equal(centavosDeTexto("1.234.567,8"), 123456780);
  assert.equal(centavosDeTexto("12,345"), 1234500);
  assert.equal(centavosDeTexto(""), null);
  assert.equal(textoDeCentavos(123456, "pt-BR"), "1234,56");
  assert.equal(textoDeCentavos(123456, "en"), "1234.56");
  assert.equal(numeroDeTexto("80,5"), 80.5);
  assert.equal(numeroDeTexto(""), null);
});

test("série de 12 meses: só meses com snapshot, mês corrente calculado ao vivo quando falta; variação vs mês passado em centavos e bp", () => {
  const snaps = [{ ym: "2026-07", patrimonioCentavos: 100000 }, { ym: "2026-09", patrimonioCentavos: 120000 }, { ym: "2025-01", patrimonioCentavos: 5 }];
  const s = serieDozeMeses(snaps, "2026-10", 150000);
  assert.deepEqual(s.map((x) => x.ym), ["2026-07", "2026-09", "2026-10"], "2025-01 fica fora da janela; agosto não tem registro");
  assert.equal(s[2].aoVivo, true); assert.equal(s[0].aoVivo, false);
  assert.deepEqual(variacaoVsMesPassado(snaps, "2026-10", 150000), { centavos: 30000, bp: 2500 });
  assert.equal(variacaoVsMesPassado(snaps, "2026-09", 1), null, "sem snapshot de agosto não há comparação para setembro");
  assert.equal(variacaoVsMesPassado([{ ym: "2026-09", patrimonioCentavos: -100 }], "2026-10", 50).bp, null, "porcentagem sobre patrimônio negativo não existe");
});

test("composição divergente: ativos por tipo de um lado, dívidas e faturas (laranja) do outro; zeros somem", () => {
  const d = dadosExemplo(), p = patrimonioLiquido(d, dadosExternos(d, HOJE));
  const c = composicaoDivergente(p);
  assert.deepEqual(c.ativos.map((a) => a.tipo), ["corrente", "investimento", "poupanca"]);
  assert.deepEqual(c.passivos.map((x) => [x.tipo, x.classe]), [["dividas", "s2"], ["faturas", "s2"]]);
  assert.equal(c.ativos.find((a) => a.tipo === "poupanca").classe, "s3");
  assert.equal(c.ativos.reduce((s, a) => s + a.valor, 0), p.ativos);
});

test("reconciliar saldo: o informado vale no início de amanhã e o snapshot do mês é um só", () => {
  const d = dadosExemplo(), agora = () => "2026-10-05T10:00:00.000Z";
  const n = reconciliarConta(d, "c-corrente", 99900, HOJE, { agora });
  assert.equal(saldoDaConta(n, "c-corrente", HOJE), 99900);
  assert.equal(n.contas.find((c) => c.id === "c-corrente").dataSaldoInicial, "2026-10-06");
  const s1 = gravarSnapshot(n, HOJE, agora), s2 = gravarSnapshot(s1, HOJE, agora);
  assert.equal(s2.snapshots.filter((s) => s.ym === "2026-10").length, 1);
  assert.equal(s2.snapshots.find((s) => s.ym === "2026-10").patrimonioCentavos, patrimonioLiquido(n, dadosExternos(n, HOJE)).liquido);
  assert.deepEqual(validar(s2).erros, []);
});

test("metas: ritmo pela conta vinculada (3 meses de transferências) e projeção em meses com o mês de chegada", () => {
  const d = dadosExemplo(), m = d.metas.find((x) => x.id === "m-reserva");
  assert.equal(atualDaMeta(d, m, HOJE), 1440000, "900 + 9 × 60");
  assert.equal(ritmoMensal(d, m, HOJE), 60000);
  assert.deepEqual(projecaoMeses(360000, 60000, "2026-10"), { meses: 6, ym: "2027-04" });
  assert.equal(projecaoMeses(360000, 0, "2026-10"), null, "ritmo zero não leva lá");
  assert.equal(projecaoMeses(360000, -5, "2026-10"), null);
  assert.deepEqual(projecaoMeses(0, null, "2026-10"), { meses: 0, ym: "2026-10" });
  assert.equal(projecaoMeses(100, 1, "2026-10").meses, 100);
  assert.equal(projecaoMeses(601, 1, "2026-10"), null, "acima de 50 anos não é projeção, é ruído");
});

test("metas: X dos últimos 6 meses na meta de poupança ignora mês sem receita; reserva por meses de cobertura", () => {
  const d = dadosExemplo();
  const p = mesesNaMetaPoupanca(d.lancamentos, "2026-10", 2000);
  assert.equal(p.meses.length, 6); assert.equal(p.de, 6); assert.ok(p.naMeta >= 1);
  const vazio = mesesNaMetaPoupanca([], "2026-10", 2000);
  assert.equal(vazio.de, 0, "sem receita nenhum mês conta de nenhum lado");
  assert.equal(alvoReserva(300000, 6), 1800000);
  assert.equal(alvoReserva(null, 6), null);
  const r = resumoPeso(d.pesos, 78, HOJE);
  assert.ok(r.atualKg > 80 && r.atualKg < 82); assert.ok(r.ritmo.kgPorSemana < 0); assert.ok(r.semanas > 0);
});

test("dívidas: soma dos mínimos limitada ao saldo, tabela só com parcelas conhecidas, extra reduz meses e juros, reserva como trava", () => {
  const d = dadosExemplo();
  assert.equal(somaMinimos([{ saldoCentavos: 100, parcelaMinimaCentavos: 500 }, { saldoCentavos: 1000, parcelaMinimaCentavos: 300 }]), 400);
  assert.equal(tabelaDaDivida(d.dividas.find((x) => x.id === "d-parc")), null);
  const tab = tabelaDaDivida(d.dividas.find((x) => x.id === "d-emp"));
  assert.equal(tab.parcelas.length, 16); assert.equal(tab.parcelas[15].saldoCentavos, 0);
  const ef = efeitoExtra(d.dividas, somaMinimos(d.dividas), 50000, "avalanche");
  assert.ok(ef.mesesAMenos > 0 && ef.jurosAMenos > 0);
  assert.equal(efeitoExtra(d.dividas, somaMinimos(d.dividas), 0, "avalanche"), null);
  assert.equal(reservaCompletaDe(d, HOJE), false, "reserva em 80% não está completa");
  assert.equal(reservaCompletaDe({ ...d, metas: [] }, HOJE), null, "sem meta de reserva: desconhecido, não falso");
});

test("shape: mensalidade da academia vem das recorrências fitness ativas; cruzamentos devolvem números e códigos", () => {
  const d = dadosExemplo();
  assert.equal(mensalidadeAcademia(d, "2026-10"), 12900);
  assert.equal(mensalidadeAcademia(d, "2020-01"), 0, "antes do início da recorrência");
  const c = cruzamentos(d, HOJE);
  assert.equal(c.custo.custoPorTreinoCentavos, Math.round(12900 / c.custo.treinos));
  assert.ok(c.poupancaBp > 0); assert.equal(c.saude.ym, "2026-10");
  assert.ok(Array.isArray(c.academia.alertas));
  const r = resumoPesoShape(d.pesos, 78, HOJE);
  assert.equal(r.ult.data, HOJE); assert.ok(r.ritmo.pontos >= 3);
  const g = pontosDoGrafico(d.pesos, r.mm);
  assert.ok(g.ult60.length <= 60); assert.equal(g.media.length, g.ult60.length); assert.equal(g.marcas.length, 3);
  assert.equal(resumoPesoShape([], 78, HOJE), null);
});

test("check-in: recomeço na segunda e no dia 1; só importados sem categoria; 7 dias até hoje; cartão sem R$", () => {
  assert.equal(ehRecomeco("2026-10-05"), true, "segunda-feira");
  assert.equal(ehRecomeco("2026-10-07"), false);
  assert.equal(ehRecomeco("2026-11-01"), true, "dia 1 (domingo)");
  const d = dadosExemplo();
  assert.equal(semCategoria(d).length, 3);
  assert.ok(semCategoria(d).every((l) => l.origem === "importacao"));
  assert.deepEqual(ultimos7Dias("2026-10-05"), ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"]);
  const r = dadosDoResumo(d, HOJE);
  assert.equal(r.metaTreino, 3); assert.equal(r.semanasDe, 8); assert.ok(r.poupancaBp > 0); assert.ok(r.variacaoPatrimonioBp != null); assert.ok(r.deltaKg != null);
  const i18n = criarI18n({ idioma: "pt-BR", dicionarios: [dic("checkin")] });
  const linhas = linhasDoCartao(r, i18n.t, criarFmt("pt-BR"));
  assert.equal(linhas.length, 4);
  for (const l of linhas) assert.doesNotMatch(l, /R\$|\d\.\d{3},\d{2}/, `cartão com valor em dinheiro: ${l}`);
  assert.deepEqual(i18n.faltando(), []);
});
