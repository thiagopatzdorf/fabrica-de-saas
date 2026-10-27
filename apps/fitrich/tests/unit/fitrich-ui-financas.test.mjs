// Telas Finanças e Cartões (v2): lógica de apresentação pura (período, agregações, ordenação, calendário),
// paridade dos dicionários pt-BR/en, e as regras duras do contrato lidas do código (texto só por t(), sem
// `style`, sem innerHTML, sem palavras de culpa, sem rede). O DOM é coberto pelo teste de navegador em
// tests/ui/. Casos conferidos à mão nos comentários.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { paridade } from "../../app/js/v2/ui/i18n.mjs";
import { DIAS_FLUXO, MODOS, intervaloDoPeriodo, lancamentosDaLista, mesesAte, mesesDisponiveis, ordenarRecentes, resumoIntervalo, serieMensal, sinalDoLancamento, tagsDe, tendenciaPorCategoria } from "../../app/js/v2/ui/telas/financas.mjs";
import { ciclosDoCartao, eventosDoMes, faturasAPagar, gradeDoMes, itensDaFatura, percentualDoLimite } from "../../app/js/v2/ui/telas/cartoes.mjs";
import { CODIGOS_COM_TEXTO, centavosParaCampo, lerCentavos, nomeCategoria } from "../../app/js/v2/ui/telas/financas-comum.mjs";
import { resumoMes } from "../../app/js/v2/esquema.mjs";
import { HOJE, dadosExemplo } from "../ui/dados-exemplo.mjs";

const ler = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const DIC = { financas: (await import("../../app/js/v2/ui/telas/financas.i18n.mjs")).default, cartoes: (await import("../../app/js/v2/ui/telas/cartoes.i18n.mjs")).default };
const t = (chave, params) => { let s = DIC.financas["pt-BR"][chave] ?? DIC.cartoes["pt-BR"][chave] ?? `[${chave}]`; for (const [k, v] of Object.entries(params ?? {})) s = s.replace(`{${k}}`, v); return s; };
const d = dadosExemplo();

test("dados de exemplo passam no esquema e cobrem o que as telas mostram (previsto, importado sem categoria, transferência, parcelas, estorno, fatura paga)", () => {
  assert.ok(d.lancamentos.some((l) => l.status === "previsto"));
  assert.equal(d.lancamentos.filter((l) => l.origem === "importacao" && l.categoriaId == null).length, 2);
  assert.ok(d.lancamentos.some((l) => l.tipo === "transferencia" && l.contaDestinoId));
  assert.equal(d.lancamentos.filter((l) => l.parcela).length, 6);
  assert.ok(d.lancamentos.some((l) => l.tipo === "estorno" && l.refId === "compra-fone"));
  assert.deepEqual(d.faturas.map((f) => [f.ym, f.status]), [["2026-04", "paga"], ["2026-05", "paga"], ["2026-06", "paga"], ["2026-07", "paga"], ["2026-08", "paga"]]);
});

test("período: mês fecha no último dia; 30d/90d terminam hoje; 12m começa no dia 1 de 11 meses atrás; o mês de referência é o de hoje fora do modo mês", () => {
  assert.deepEqual(intervaloDoPeriodo({ modo: "mes", ym: "2026-02" }, HOJE), { de: "2026-02-01", ate: "2026-02-28", ymRef: "2026-02" });
  assert.deepEqual(intervaloDoPeriodo({ modo: "30d" }, HOJE), { de: "2026-09-06", ate: "2026-10-05", ymRef: "2026-10" }); // 30 dias contando hoje
  assert.deepEqual(intervaloDoPeriodo({ modo: "90d" }, HOJE), { de: "2026-07-08", ate: "2026-10-05", ymRef: "2026-10" });
  assert.deepEqual(intervaloDoPeriodo({ modo: "12m" }, HOJE), { de: "2025-11-01", ate: "2026-10-05", ymRef: "2026-10" });
  assert.deepEqual(MODOS, ["mes", "30d", "90d", "12m"]);
  assert.deepEqual(DIAS_FLUXO, [30, 60, 90]);
});

test("resumo do intervalo de um mês inteiro bate com resumoMes do esquema (transferência fora, previsto fora, estorno abate a categoria da compra)", () => {
  for (const ym of ["2026-09", "2026-10"]) {
    const r = resumoIntervalo(d, `${ym}-01`, `${ym}-31`), m = resumoMes(d, ym);
    assert.equal(r.receitas, m.receitas, ym); assert.equal(r.despesas, m.despesas, ym); assert.equal(r.saldo, m.saldo, ym);
    assert.deepEqual(r.porCategoria, m.porCategoria.filter((c) => c.centavos > 0), ym);
    assert.equal(r.taxaPoupancaBp == null ? null : Math.round(r.taxaPoupancaBp / 10) / 10, m.taxaPoupanca, `${ym}: bp e % com 1 casa concordam`);
  }
  // Outubro: o estorno do Fone (299,00, lazer) abate lazer, e a transferência de 500,00 não aparece.
  const out = resumoIntervalo(d, "2026-10-01", "2026-10-31");
  const lazer = out.porCategoria.find((c) => c.categoriaId === "cat-lazer");
  assert.equal(lazer.centavos, 36000 - 29900);
  assert.ok(out.porCategoria.some((c) => c.categoriaId === "sem-categoria"), "importado sem categoria aparece como grupo próprio");
  assert.equal(resumoIntervalo(d, "2030-01-01", "2030-01-31").taxaPoupancaBp, null, "sem receita, taxa null (não zero)");
});

test("meses disponíveis vão do mais novo ao mais antigo com lançamento, incluindo hoje; mesesAte termina no mês de referência", () => {
  const ms = mesesDisponiveis(d.lancamentos, HOJE);
  assert.equal(ms[0], "2026-11", "o previsto mais distante (salário de novembro) entra");
  assert.equal(ms[ms.length - 1], "2026-04");
  assert.deepEqual(mesesAte("2026-10", 3), ["2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(mesesDisponiveis([], "2026-10-05"), ["2026-10"]);
});

test("série mensal tem 6 meses em ordem e a tendência por categoria traz as mais gastas com 6 valores cada", () => {
  const s = serieMensal(d, "2026-10");
  assert.equal(s.length, 6); assert.equal(s[0].ym, "2026-05"); assert.equal(s[5].ym, "2026-10");
  assert.equal(s[4].receitas, 650000, "setembro só tem salário");
  const tend = tendenciaPorCategoria(d.lancamentos, "2026-10");
  assert.ok(tend.length <= 6 && tend.length >= 3);
  assert.equal(tend[0].categoriaId, "cat-moradia", "aluguel é o maior gasto acumulado");
  for (const l of tend) { assert.equal(l.valores.length, 6); assert.ok(l.valores.every((v) => v >= 0)); }
  assert.ok(!tend.some((l) => l.categoriaId === "null"), "sem categoria não vira série");
});

test("lista: mais recente primeiro, busca sem acento, filtro por tag, e o que espera o Desfazer some da lista", () => {
  const de = "2026-10-01", ate = "2026-10-31";
  const tudo = lancamentosDaLista(d, { busca: "", filtros: {}, de, ate });
  assert.ok(tudo.length > 5);
  for (let i = 1; i < tudo.length; i++) assert.ok(tudo[i - 1].data >= tudo[i].data, "ordem decrescente de data");
  assert.equal(lancamentosDaLista(d, { busca: "SUPERMERCADO", filtros: {}, de, ate }).length, 1);
  assert.deepEqual(tagsDe(d.lancamentos), ["viagem"]);
  assert.equal(lancamentosDaLista(d, { busca: "", filtros: { tag: "viagem" }, de, ate }).length, 1);
  assert.equal(lancamentosDaLista(d, { busca: "", filtros: { tipo: "transferencia", categoriaId: null }, de, ate }).length, 1, "filtro vazio (null) é ignorado");
  const oculto = tudo[0].id;
  assert.ok(!lancamentosDaLista(d, { busca: "", filtros: {}, de, ate, ocultos: new Set([oculto]) }).some((l) => l.id === oculto));
  assert.deepEqual(ordenarRecentes([{ data: "2026-01-01", id: "b" }, { data: "2026-01-02", id: "a" }, { data: "2026-01-01", id: "a" }]).map((l) => l.data + l.id), ["2026-01-02a", "2026-01-01a", "2026-01-01b"]);
  assert.equal(sinalDoLancamento({ tipo: "transferencia" }), 0); assert.equal(sinalDoLancamento({ tipo: "despesa" }), -1); assert.equal(sinalDoLancamento({ tipo: "estorno" }), 1);
});

test("lerCentavos aceita os jeitos de digitar dos dois idiomas e recusa lixo; centavosParaCampo é o inverso", () => {
  assert.equal(lerCentavos("1.234,56"), 123456); assert.equal(lerCentavos("1,234.56"), 123456); assert.equal(lerCentavos("R$ 49,90"), 4990);
  assert.equal(lerCentavos("$12.50"), 1250); assert.equal(lerCentavos("12,5"), 1250); assert.equal(lerCentavos("1.234"), 123400); assert.equal(lerCentavos("1,234"), 123400);
  assert.equal(lerCentavos("0"), null); assert.equal(lerCentavos("abc"), null); assert.equal(lerCentavos("1,2,3"), null); assert.equal(lerCentavos(""), null);
  assert.equal(centavosParaCampo(123456, "pt-BR"), "1234,56"); assert.equal(centavosParaCampo(500, "en"), "5.00");
});

test("nome de categoria: padrão não renomeada sai traduzida; renomeada ou criada sai como a pessoa escreveu; sem categoria e removida têm texto próprio", () => {
  const tt = (k) => ({ "financas.cat.cat-mercado": "Groceries", "financas.sem_categoria": "Uncategorized", "financas.categoria_removida": "Removed" })[k] ?? `[${k}]`;
  const cats = [{ id: "cat-mercado", nome: "Mercado" }, { id: "cat-lazer", nome: "Diversão" }, { id: "u1", nome: "Cachorro" }];
  assert.equal(nomeCategoria(cats, "cat-mercado", tt, "financas"), "Groceries");
  assert.equal(nomeCategoria(cats, "cat-lazer", tt, "financas"), "Diversão");
  assert.equal(nomeCategoria(cats, "u1", tt, "financas"), "Cachorro");
  assert.equal(nomeCategoria(cats, null, tt, "financas"), "Uncategorized");
  assert.equal(nomeCategoria(cats, "sumiu", tt, "financas"), "Removed");
});

test("cartões: três ciclos em volta da aberta, fatura vencida a pagar com restante, itens da fatura por data", () => {
  const c = d.cartoes[0], ciclos = ciclosDoCartao(c, d.lancamentos, HOJE);
  assert.deepEqual(ciclos.map((x) => [x.classe, x.ym, x.resumo.status]), [["anterior", "2026-09", "vencida"], ["aberta", "2026-10", "aberta"], ["proxima", "2026-11", "futura"]]);
  const pagar = faturasAPagar(c, d.lancamentos, HOJE);
  assert.deepEqual(pagar.map((r) => [r.ym, r.status]), [["2026-09", "vencida"]], "abril a agosto foram pagas; só setembro fechou sem pagamento");
  assert.ok(pagar[0].restanteCentavos > 0);
  const itens = itensDaFatura(c, d.lancamentos, "2026-10");
  assert.ok(itens.some((l) => l.tipo === "estorno"), "o estorno do Fone cai na fatura aberta");
  for (let i = 1; i < itens.length; i++) assert.ok(itens[i - 1].data <= itens[i].data);
  assert.equal(percentualDoLimite(125000, 500000), 25); assert.equal(percentualDoLimite(1, 0), null);
});

test("calendário: grade começa na segunda, outubro/2026 tem 5 semanas com dia 1 na quinta; eventos do mês trazem vencimento (dia 17) e fechamento (dia 10)", () => {
  const g = gradeDoMes("2026-10");
  assert.equal(g.length, 5); assert.deepEqual(g[0], [null, null, null, 1, 2, 3, 4]); assert.equal(g[4][5], 31);
  assert.equal(gradeDoMes("2026-02")[0][6], 1, "1º de fevereiro de 2026 é domingo");
  const ev = eventosDoMes(d.cartoes, d.lancamentos, "2026-10", HOJE);
  assert.deepEqual(ev.map((e) => [e.dia, e.tipo, e.ym]), [[10, "fecha", "2026-10"], [17, "vence", "2026-10"]]);
  assert.equal(ev[1].status, "aberta");
  const set = eventosDoMes(d.cartoes, d.lancamentos, "2026-09", HOJE);
  assert.equal(set.find((e) => e.tipo === "vence").status, "vencida");
});

test("dicionários: paridade pt-BR/en, todo t() do código tem chave nos dois idiomas, e nenhuma palavra de culpa", () => {
  for (const [tela, dic] of Object.entries(DIC)) {
    assert.deepEqual(paridade(dic), [], tela);
    const codigo = ler(`../../app/js/v2/ui/telas/${tela}.mjs`);
    const usadas = [...codigo.matchAll(/t\(`\$\{P\}\.([a-z_.0-9-]+)`/g)].map((m) => m[1]);
    const chaves = Object.keys(dic["pt-BR"]);
    for (const k of usadas) assert.ok(chaves.includes(`${tela}.${k}`) || chaves.includes(`${tela}.${k}.other`), `${tela}: falta ${tela}.${k}`);
    for (const l of ["pt-BR", "en"]) for (const [k, v] of Object.entries(dic[l])) for (const ruim of ["estourou", "falhou", "culpa", "atrasad", "perdeu a sequ", "streak"]) assert.ok(!v.toLowerCase().includes(ruim), `${l}:${k} usa "${ruim}"`);
    for (const estado of ["ok", "atencao", "passou", "sem_limite"]) if (tela === "financas") assert.ok(chaves.includes(`financas.orc.${estado}`));
    for (const st of ["futura", "aberta", "fechada", "vencida", "paga"]) if (tela === "cartoes") assert.ok(chaves.includes(`cartoes.status.${st}`));
    for (const id of ["cat-mercado", "cat-salario", "cat-outros-receita"]) assert.ok(chaves.includes(`${tela}.cat.${id}`));
  }
  for (const c of CODIGOS_COM_TEXTO) for (const tela of ["financas", "cartoes"]) assert.ok(DIC[tela]["pt-BR"][`${tela}.erro.${c}`], `${tela}.erro.${c}`);
  assert.equal(t("financas.orc.passou"), "Passou");
});

test("regras duras do contrato no código das telas: sem style/innerHTML/rede/confirm(), sem string de interface fora de t(), sem mínimo do cartão", () => {
  for (const arq of ["telas/financas.mjs", "telas/cartoes.mjs", "telas/financas-comum.mjs", "graficos-financas.mjs"]) {
    const s = ler(`../../app/js/v2/ui/${arq}`);
    for (const proibido of ["innerHTML", "outerHTML", "insertAdjacentHTML", 'style:', '"style"', "fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "confirm(", "alert(", "pagamentoMinimo", "estourou", "localStorage", "indexedDB"]) assert.ok(!s.includes(proibido), `${arq} contém ${proibido}`);
  }
  // Nenhum nó de texto literal em português/inglês: todo `h("tag", attrs, "Texto")` com letra passa por t(). Aceita só
  // símbolos (ícones, separadores) como literal.
  for (const tela of ["financas", "cartoes"]) {
    const s = ler(`../../app/js/v2/ui/telas/${tela}.mjs`);
    const literais = [...s.matchAll(/h\("(?:p|span|b|small|h2|h3|h4|li|option|button|summary|th|td)",\s*(?:null|\{[^}]*\}),\s*"([^"]+)"/g)].map((m) => m[1]).filter((x) => /[A-Za-zÀ-ÿ]{2,}/.test(x));
    assert.deepEqual(literais, [], `${tela}: texto literal fora de t()`);
  }
});
