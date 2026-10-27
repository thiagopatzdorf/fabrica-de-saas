// Motor de insights, revisão da semana e equilíbrio (área "revisao"), em Node 18 sem DOM. Cada regra é exercitada nos dois
// lados do seu limiar, com números calculados à mão (comentados). Fixtures sintéticas: nenhuma regra é testada contra dado real.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOGO, porId } from "../../app/js/v2/insights/catalogo.mjs";
import { contexto, escoreModificado, mad, mediana } from "../../app/js/v2/insights/base.mjs";
import { LIMITES_DA_VISITA, avaliarTodos, dispensar, ordenar, paraOlhar, pontuacao, priorizar, restaurar } from "../../app/js/v2/insights/motor.mjs";
import { parametrosDoInsight } from "../../app/js/v2/insights/apresentar.mjs";
import { FAIXAS, equilibrio } from "../../app/js/v2/insights/equilibrio.mjs";
import { dadosDaSemana, revisaoDe, salvarRevisao, semanaDaRevisao, textoDaRevisao, vitoriasSugeridas } from "../../app/js/v2/insights/revisao.mjs";
import { posicaoNaRegua } from "../../app/js/v2/ui/telas/revisao.mjs";
import { definir, validar, vazio } from "../../app/js/v2/esquema.mjs";
import { somarDias, somarMeses } from "../../app/js/datas.mjs";
import { criarFmt } from "../../app/js/v2/ui/fmt.mjs";
import { criarI18n, paridade } from "../../app/js/v2/ui/i18n.mjs";
import dic from "../../app/js/v2/ui/telas/revisao.i18n.mjs";
import { dadosExemplo, HOJE as HOJE_EXEMPLO } from "../ui/dados-exemplo-patrimonio.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const FITRICH = join(AQUI, "..", "..", "app");
const HOJE = "2026-10-14"; // quarta-feira; mês fechado = 2026-09; semana fechada = 05 a 11/10
const AGORA = "2026-10-14T12:00:00.000Z";
const YM = "2026-10", ANT = "2026-09";

// ---------- construtores de fixture ----------
let seq = 0;
const L = (data, tipo, centavos, categoriaId, extra = {}) => ({ id: `l${++seq}`, data, tipo, centavos, categoriaId, moeda: "BRL", status: "efetivado", origem: "manual", contaId: "c1", descricao: "", tags: [], atualizadoEm: AGORA, ...extra });
// Despesa no cartão (não mexe no saldo da conta): serve para "histórico de gasto" sem alterar a liquidez das contas.
const noCartao = (data, centavos, categoriaId, extra = {}) => L(data, "despesa", centavos, categoriaId, { contaId: null, cartaoId: "k1", meio: "credito", ...extra });
const T = (data, extra = {}) => ({ id: `t${++seq}`, data, tipo: "Musculação", minutos: 60, esforco: 3, ...extra });
const P = (data, kg) => ({ id: `p${++seq}`, data, kg });
const conta = (extra = {}) => ({ id: "c1", nome: "Conta", tipo: "corrente", moeda: "BRL", saldoInicialCentavos: 0, dataSaldoInicial: "2026-01-01", arquivada: false, ...extra });
const doc = (parte = {}) => { const d = vazio({ agora: () => AGORA }); return { ...d, contas: [conta()], ...parte }; };
// Um mês de receita e despesa (centavos) em categorias dadas, na conta.
const mes = (ym, { receita = 0, despesas = [] } = {}) => [...(receita ? [L(`${ym}-05`, "receita", receita, "cat-salario", { descricao: "Salário" })] : []), ...despesas.map(([cat, c], i) => noCartao(`${ym}-${String(10 + i).padStart(2, "0")}`, c, cat, { descricao: `gasto ${cat} ${i}` }))];
const meses = (de, ate) => { const r = []; for (let m = de; m <= ate; m = somarMeses(m, 1)) r.push(m); return r; };
const rodar = (id, d, hoje = HOJE) => porId(id).avaliar(contexto(d, hoje));
const um = (id, d, hoje) => { const r = rodar(id, d, hoje); assert.equal(r.length, 1, `${id}: esperava 1 insight, veio ${r.length}`); return r[0]; };
const nenhum = (id, d, hoje, msg = "") => assert.deepEqual(rodar(id, d, hoje).map((i) => i.chave), [], `${id} não deveria disparar ${msg}`);

// Todo insight positivo tem de renderizar nos dois idiomas sem sobrar {placeholder} nem [chave]: texto quebrado é defeito.
function textoCompleto(i, d = doc()) {
  for (const idioma of ["pt-BR", "en"]) {
    const { t } = criarI18n({ idioma, dicionarios: [dic] }), fmt = criarFmt(idioma);
    const ins = { ...i, texto: `revisao.i.${i.id}${i.variante ? `.${i.variante}` : ""}` };
    const p = parametrosDoInsight(ins, fmt, (id) => id, (x) => t(`revisao.tipo.${x}`));
    for (const sufixo of ["t", "p"]) { const s = t(`${ins.texto}.${sufixo}`, p); assert.ok(!/[{}]|\[revisao/.test(s), `${idioma} ${ins.texto}.${sufixo}: "${s}"`); }
  }
}

// ---------- estatística ----------
test("mediana e MAD: números calculados à mão (9 valores: mediana 10000, MAD 200)", () => {
  const h = [10000, 11000, 9000, 10500, 9500, 10200, 9800, 10100, 9900];
  assert.equal(mediana(h), 10000); // ordenados: 9000 9500 9800 9900 [10000] 10100 10200 10500 11000
  assert.equal(mad(h), 200); // |x-10000| ordenados: 0 100 100 200 [200] 500 500 1000 1000
  assert.equal(mediana([1, 2, 3, 4]), 2.5);
  assert.equal(mediana([]), null);
  // z modificado = 0,6745 · (25000 − 10000) / 200 = 50,5875
  assert.ok(Math.abs(escoreModificado(25000, h).z - 50.5875) < 1e-9);
  assert.equal(escoreModificado(5, [3, 3, 3, 3]).z, null, "MAD zero não tem escala");
});

// ---------- catálogo ----------
test("catálogo: pelo menos 25 regras, ids únicos, impacto e acionabilidade de 1 a 5, limiares documentados e texto pt/en", () => {
  assert.ok(CATALOGO.length >= 25, `só ${CATALOGO.length} regras`);
  assert.equal(new Set(CATALOGO.map((r) => r.id)).size, CATALOGO.length);
  for (const r of CATALOGO) {
    assert.ok(["dinheiro", "corpo"].includes(r.eixo), r.id);
    assert.ok(r.impacto >= 1 && r.impacto <= 5 && r.acionavel >= 1 && r.acionavel <= 5, `${r.id}: impacto/acionável fora de 1..5`);
    assert.ok(r.limiares && Object.keys(r.limiares).length > 0, `${r.id}: limiar não documentado`);
    const chaves = Object.keys(dic["pt-BR"]).filter((k) => k.startsWith(`revisao.i.${r.id}.`));
    assert.ok(chaves.some((k) => /\.t(\.one|\.other)?$/.test(k)) && chaves.some((k) => k.endsWith(".p")), `${r.id}: falta frase (.t) ou próximo passo (.p) no dicionário`);
  }
});

test("dados vazios: nenhuma regra lança nem inventa insight (coleções ausentes valem como vazias)", () => {
  const r = avaliarTodos(doc(), HOJE);
  assert.deepEqual(r.erros, []);
  assert.deepEqual(r.insights, []);
  const semColecoes = { ...doc(), treinos: undefined, pesos: undefined, medidas: undefined, metas: undefined, snapshots: undefined, dividas: undefined, recorrencias: undefined, cartoes: undefined };
  assert.deepEqual(avaliarTodos(semColecoes, HOJE).erros, []);
});

test("dados de exemplo do app: nenhum erro de regra, resultado idêntico em duas execuções (determinismo)", () => {
  const d = dadosExemplo();
  const a = avaliarTodos(d, HOJE_EXEMPLO), b = avaliarTodos(structuredClone(d), HOJE_EXEMPLO);
  assert.deepEqual(a.erros, []);
  assert.deepEqual(a.insights, b.insights);
  assert.ok(validar(d).ok);
});

// ---------- dinheiro: cada regra dos dois lados ----------

test("assinatura-repetida: 3 cobranças mensais parecidas fora das recorrências disparam; 2, valor variável, recorrência registrada, categoria essencial, intervalo semanal ou cobrança antiga não", () => {
  const net = (datas, valores = [3990, 3990, 3990, 3990], extra = {}) => datas.map((x, i) => noCartao(x, valores[i], "cat-assinaturas", { descricao: `NETFLIX.COM ${x.slice(8)}/${x.slice(5, 7)}`, ...extra }));
  const tres = net(["2026-07-15", "2026-08-15", "2026-09-15"]);
  const i = um("assinatura-repetida", doc({ lancamentos: tres }));
  // 3990 × 12 = 47880 por ano
  assert.deepEqual([i.numeros.mensalCentavos, i.numeros.anualCentavos, i.numeros.meses], [3990, 47880, 3]);
  assert.equal(i.evidencia.lancamentos.length, 3);
  textoCompleto(i);
  nenhum("assinatura-repetida", doc({ lancamentos: tres.slice(1) }), HOJE, "(2 cobranças)");
  nenhum("assinatura-repetida", doc({ lancamentos: net(["2026-07-15", "2026-08-15", "2026-09-15"], [3990, 5990, 3990]) }), HOJE, "(valor variou 50%)");
  nenhum("assinatura-repetida", doc({ lancamentos: tres, recorrencias: [{ id: "r1", nome: "Netflix", tipo: "despesa", ativa: true, centavos: 3990, freq: "mensal", inicio: "2026-01-15", categoriaId: "cat-assinaturas", contaId: "c1" }] }), HOJE, "(já é recorrência)");
  nenhum("assinatura-repetida", doc({ lancamentos: net(["2026-07-15", "2026-08-15", "2026-09-15"], undefined, { categoriaId: "cat-moradia" }) }), HOJE, "(aluguel não é assinatura)");
  nenhum("assinatura-repetida", doc({ lancamentos: net(["2026-09-01", "2026-09-08", "2026-09-15"]) }), HOJE, "(semanal)");
  nenhum("assinatura-repetida", doc({ lancamentos: net(["2026-05-15", "2026-06-15", "2026-07-15"]) }), HOJE, "(última há 91 dias: provavelmente cancelada)");
  // variação de exatamente 10% ainda vale; 11% não
  assert.equal(rodar("assinatura-repetida", doc({ lancamentos: net(["2026-07-15", "2026-08-15", "2026-09-15"], [1000, 1100, 1000]) })).length, 1);
  nenhum("assinatura-repetida", doc({ lancamentos: net(["2026-07-15", "2026-08-15", "2026-09-15"], [1000, 1120, 1000]) }), HOJE, "(variação de 12%)");
});

test("cobranca-duplicada: dois valores iguais em até 3 dias disparam; valor diferente, 4 dias e valor abaixo de R$ 20 não", () => {
  const par = (v1, v2, d1 = "2026-09-30", d2 = "2026-10-01") => [noCartao(d1, v1, "cat-outros", { descricao: "Oficina Silva" }), noCartao(d2, v2, "cat-outros", { descricao: "Oficina Silva" })];
  const i = um("cobranca-duplicada", doc({ lancamentos: par(15000, 15000) }));
  assert.deepEqual([i.numeros.valorCentavos, i.numeros.dias], [15000, 1]);
  assert.equal(i.evidencia.lancamentos.length, 2);
  textoCompleto(i);
  nenhum("cobranca-duplicada", doc({ lancamentos: par(15000, 15100) }), HOJE, "(valores diferentes)");
  nenhum("cobranca-duplicada", doc({ lancamentos: par(15000, 15000, "2026-09-27", "2026-10-01") }), HOJE, "(4 dias)");
  assert.equal(rodar("cobranca-duplicada", doc({ lancamentos: par(15000, 15000, "2026-09-28", "2026-10-01") })).length, 1, "3 dias ainda vale");
  nenhum("cobranca-duplicada", doc({ lancamentos: par(1999, 1999) }), HOJE, "(abaixo de R$ 20)");
  assert.equal(rodar("cobranca-duplicada", doc({ lancamentos: par(2000, 2000) })).length, 1, "R$ 20 exatos entram");
});

test("assinaturas-total: 5% da receita do mês passado dispara; 4,98% não", () => {
  const d = (centavos) => doc({ lancamentos: [L("2026-09-05", "receita", 500000, "cat-salario"), noCartao("2026-09-12", centavos, "cat-assinaturas")] });
  const i = um("assinaturas-total", d(25000)); // 25000 / 500000 = 5,00%
  assert.equal(i.numeros.taxaBp, 500);
  textoCompleto(i);
  nenhum("assinaturas-total", d(24900), HOJE, "(498 bp)");
});

test("gasto-fora-do-padrao: escore modificado > 3,5 E ao menos 2× a mediana E ao menos R$ 50, com 8+ gastos de histórico", () => {
  const hist = [10000, 11000, 9000, 10500, 9500, 10200, 9800, 10100, 9900].map((v, k) => noCartao(somarDias("2026-09-30", -k * 10), v, "cat-mercado")); // mediana 10000, MAD 200
  const com = (v, extra = []) => doc({ lancamentos: [...hist, ...extra, noCartao("2026-10-10", v, "cat-mercado", { descricao: "Compra grande" })] });
  const i = um("gasto-fora-do-padrao", com(25000)); // z = 50,6; 25000 ≥ 2 × 10000
  assert.deepEqual([i.numeros.valorCentavos, i.numeros.tipicoCentavos], [25000, 10000]);
  textoCompleto(i);
  assert.equal(rodar("gasto-fora-do-padrao", com(20000)).length, 1, "exatamente 2× vale");
  nenhum("gasto-fora-do-padrao", com(19900), HOJE, "(z alto, mas menos de 2× a mediana)");
  // histórico muito espalhado: 50000 passa de 2× a mediana (25000) mas z = 0,6745 × 25000 / 10000 = 1,69
  const largo = [5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000].map((v, k) => noCartao(somarDias("2026-09-30", -k * 10), v, "cat-lazer"));
  nenhum("gasto-fora-do-padrao", doc({ lancamentos: [...largo, noCartao("2026-10-10", 50000, "cat-lazer")] }), HOJE, "(z = 1,69)");
  // MAD zero: valores todos iguais exigem 3× a mediana
  const iguais = Array.from({ length: 9 }, (_, k) => noCartao(somarDias("2026-09-30", -k * 10), 10000, "cat-transporte"));
  nenhum("gasto-fora-do-padrao", doc({ lancamentos: [...iguais, noCartao("2026-10-10", 29000, "cat-transporte")] }), HOJE, "(29000 < 3 × 10000)");
  assert.equal(rodar("gasto-fora-do-padrao", doc({ lancamentos: [...iguais, noCartao("2026-10-10", 30000, "cat-transporte")] })).length, 1);
  // piso de R$ 50
  const baratos = Array.from({ length: 9 }, (_, k) => noCartao(somarDias("2026-09-30", -k * 10), 1000, "cat-outros"));
  nenhum("gasto-fora-do-padrao", doc({ lancamentos: [...baratos, noCartao("2026-10-10", 4900, "cat-outros")] }), HOJE, "(abaixo de R$ 50)");
  // histórico curto (7) e gasto fora da janela de 7 dias
  nenhum("gasto-fora-do-padrao", doc({ lancamentos: [...hist.slice(0, 7), noCartao("2026-10-10", 25000, "cat-mercado")] }), HOJE, "(7 amostras)");
  nenhum("gasto-fora-do-padrao", doc({ lancamentos: [...hist, noCartao("2026-10-01", 25000, "cat-mercado")] }), HOJE, "(gasto de 13 dias atrás)");
});

test("fatura-passara-limite: projeção do ritmo do ciclo acima do limite dispara; abaixo, ou com menos de 7 dias de ciclo, não", () => {
  // Cartão fecha dia 10 (exclusivo): em 20/10 a fatura aberta é a de novembro; ciclo de 11/10 a 10/11 = 31 dias; 10 decorridos.
  const k = { id: "k1", nome: "Roxo", diaFechamento: 10, diaVencimento: 17, fechaInclusivo: false, limiteCentavos: 100000, contaPagamentoId: "c1" };
  const d = (gasto, dia = "2026-10-12") => doc({ cartoes: [k], lancamentos: [noCartao(dia, gasto, "cat-lazer", { descricao: "compra" })] });
  const i = um("fatura-passara-limite", d(35000), "2026-10-20"); // 35000 / 10 × 31 = 108500 > 100000
  assert.equal(i.numeros.projetadoCentavos, 108500); assert.equal(i.severidade, "atencao"); assert.equal(i.numeros.dias, 21);
  textoCompleto(i);
  nenhum("fatura-passara-limite", d(30000), "2026-10-20", "(30000/10×31 = 93000)");
  nenhum("fatura-passara-limite", d(90000), "2026-10-16", "(só 6 dias de ciclo: projetar de pouco dado engana)");
  assert.equal(rodar("fatura-passara-limite", d(90000), "2026-10-17").length, 1, "7 dias de ciclo já projeta");
  // parcela já é certa: não é multiplicada pelo ritmo
  const p = doc({ cartoes: [k], lancamentos: [noCartao("2026-10-12", 60000, "cat-lazer", { parcela: { grupoId: "g", de: 3, n: 1, totalCentavos: 180000 } }), noCartao("2026-10-13", 20000, "cat-lazer")] });
  // 60000 fixo + 20000 ÷ 10 dias × 31 = 122000 (se a parcela também fosse multiplicada seriam 248000)
  assert.equal(um("fatura-passara-limite", p, "2026-10-20").numeros.projetadoCentavos, 122000);
});

test("dinheiro-parado: sobra acima de 6 meses essenciais + 1 mês de giro (e ao menos R$ 1.000 e 1 mês essencial) dispara", () => {
  const gastos = meses("2026-07", "2026-09").flatMap((m) => [noCartao(`${m}-10`, 100000, "cat-moradia")]); // essencial 100000/mês; giro 100000
  const com = (saldoInicial) => doc({ contas: [conta({ saldoInicialCentavos: saldoInicial })], lancamentos: gastos });
  // referência = 6 × 100000 + 100000 = 700000 (as despesas estão no cartão: o saldo da conta é o inicial); parado = saldo − 700000 ≥ max(100000, 100000)
  const i = um("dinheiro-parado", com(800000));
  assert.deepEqual([i.numeros.referenciaCentavos, i.numeros.paradoCentavos], [700000, 100000]);
  textoCompleto(i);
  nenhum("dinheiro-parado", com(799999), HOJE, "(parado de 99999)");
  // poupança não conta como "parada"
  nenhum("dinheiro-parado", doc({ contas: [conta({ tipo: "poupanca", saldoInicialCentavos: 5000000 })], lancamentos: gastos }), HOJE, "(poupança)");
  nenhum("dinheiro-parado", doc({ contas: [conta({ saldoInicialCentavos: 5000000 })] }), HOJE, "(sem despesa essencial medida)");
});

test("reserva-curta: abaixo de 1 mês é atenção, de 1 a 3 meses informa, 3 meses ou mais não dispara", () => {
  const gastos = meses("2026-07", "2026-09").map((m) => noCartao(`${m}-10`, 100000, "cat-moradia")); // essencial 100000
  const com = (liquidez) => doc({ contas: [conta({ saldoInicialCentavos: liquidez })], lancamentos: gastos });
  const a = um("reserva-curta", com(50000)); // 0,5 mês
  assert.deepEqual([a.variante, a.severidade, a.numeros.meses], ["baixa", "atencao", 0.5]);
  textoCompleto(a);
  const b = um("reserva-curta", com(299999)); // 2,99999 → 3,0 arredondado a 1 casa, mas ainda < 3
  assert.deepEqual([b.variante, b.severidade], ["meio", "info"]); textoCompleto(b);
  assert.equal(um("reserva-curta", com(100000)).variante, "meio", "exatamente 1 mês já é 'meio'");
  nenhum("reserva-curta", com(300000), HOJE, "(3 meses)");
});

test("poupanca-vs-mediana: diferença de 10 pontos ou mais contra a mediana dos 6 meses anteriores; 9,99 não; menos de 3 meses de base não", () => {
  const base = meses("2026-03", "2026-08").flatMap((m) => mes(m, { receita: 100000, despesas: [["cat-outros", 80000]] })); // taxa 20% em todos
  const com = (despSet, b = base) => doc({ lancamentos: [...b, ...mes(ANT, { receita: 100000, despesas: [["cat-outros", despSet]] })] });
  const a = um("poupanca-vs-mediana", com(60000)); // 40% − 20% = 20 pp
  assert.deepEqual([a.variante, a.numeros.taxaBp, a.numeros.medianaBp, a.numeros.diferencaBp], ["acima", 4000, 2000, 2000]); textoCompleto(a);
  assert.equal(um("poupanca-vs-mediana", com(70000)).numeros.diferencaBp, 1000, "exatamente 10 pp vale");
  nenhum("poupanca-vs-mediana", com(70010), HOJE, "(29,99% − 20% = 9,99 pp)");
  const b = um("poupanca-vs-mediana", com(95000)); // 5% − 20% = −15 pp
  assert.deepEqual([b.variante, b.numeros.diferencaBp], ["abaixo", 1500]); textoCompleto(b);
  nenhum("poupanca-vs-mediana", com(60000, meses("2026-06", "2026-08").slice(1).flatMap((m) => mes(m, { receita: 100000, despesas: [["cat-outros", 80000]] }))), HOJE, "(só 2 meses de base)");
});

test("categoria-mais-cresceu: +R$ 50 e +30% contra a mediana de 3 meses; um dos dois lados não basta", () => {
  const com = (base, atual) => doc({ lancamentos: [...["2026-06", "2026-07", "2026-08"].flatMap((m) => mes(m, { despesas: [["cat-lazer", base]] })), ...mes(ANT, { despesas: [["cat-lazer", atual]] })] });
  const i = um("categoria-mais-cresceu", com(10000, 15000)); // +5000 (50%)
  assert.deepEqual([i.numeros.categoriaId, i.numeros.aumentoCentavos], ["cat-lazer", 5000]); assert.ok(i.evidencia.lancamentos.length >= 1); textoCompleto(i);
  nenhum("categoria-mais-cresceu", com(10000, 14999), HOJE, "(+R$ 49,99)");
  nenhum("categoria-mais-cresceu", com(40000, 45000), HOJE, "(+R$ 50 mas só 12,5%)");
  assert.equal(rodar("categoria-mais-cresceu", com(40000, 52000)).length, 1, "+30% exatos (12000 de 40000)");
  nenhum("categoria-mais-cresceu", com(40000, 51999), HOJE, "(29,99%)");
  nenhum("categoria-mais-cresceu", doc({ lancamentos: [...mes("2026-08", { despesas: [["cat-lazer", 10000]] }), ...mes(ANT, { despesas: [["cat-lazer", 90000]] })] }), HOJE, "(só 1 mês de base)");
});

test("parcelas-comprometem-renda: 15% da renda média informa, 30% é atenção, abaixo não dispara", () => {
  const renda = meses("2026-07", "2026-09").map((m) => L(`${m}-05`, "receita", 1000000, "cat-salario")); // renda média 1.000.000
  const parcela = (c, n = 1) => noCartao(`2026-10-0${n}`, c, "cat-vestuario", { parcela: { grupoId: `g${n}`, de: 3, n: 1, totalCentavos: c * 3 } });
  const com = (c) => doc({ lancamentos: [...renda, parcela(c)] });
  const a = um("parcelas-comprometem-renda", com(150000)); // 1.500 bp
  assert.deepEqual([a.severidade, a.numeros.taxaBp], ["info", 1500]); textoCompleto(a);
  nenhum("parcelas-comprometem-renda", com(149000), HOJE, "(14,9%)");
  assert.equal(um("parcelas-comprometem-renda", com(299000)).severidade, "info");
  assert.equal(um("parcelas-comprometem-renda", com(300000)).severidade, "atencao");
  nenhum("parcelas-comprometem-renda", doc({ lancamentos: [parcela(500000)] }), HOJE, "(sem renda lançada)");
});

test("dividas-minimos-renda: 20% da renda média informa, 36% pede atenção", () => {
  const renda = meses("2026-07", "2026-09").map((m) => L(`${m}-05`, "receita", 1000000, "cat-salario"));
  const com = (min) => doc({ lancamentos: renda, dividas: [{ id: "dv1", nome: "Empréstimo", saldoCentavos: 5000000, taxaMensalBp: 300, parcelaMinimaCentavos: min, parcelasRestantes: null }] });
  assert.deepEqual([um("dividas-minimos-renda", com(200000)).severidade, um("dividas-minimos-renda", com(200000)).numeros.taxaBp], ["info", 2000]);
  nenhum("dividas-minimos-renda", com(199000), HOJE, "(19,9%)");
  assert.equal(um("dividas-minimos-renda", com(350000)).severidade, "info");
  const i = um("dividas-minimos-renda", com(360000)); assert.equal(i.severidade, "atencao"); textoCompleto(i);
});

test("metas: prazo que chegou, ritmo acima da folga e meta folgada, cada uma de um lado do limite", () => {
  const sobra = meses("2026-07", "2026-09").flatMap((m) => mes(m, { receita: 1000000, despesas: [["cat-outros", 800000]] })); // folga média 200000
  const meta = (extra) => ({ id: "m1", nome: "Viagem", tipo: "objetivo", alvo: 1200000, atual: 0, prazo: "2027-10-14", taxaBp: 0, ...extra });
  const com = (m) => doc({ lancamentos: sobra, metas: [m] });
  // 12 meses restantes, sem juros: aporte = 1200000 / 12 = 100000 = metade da folga → "folgada" (≤ 50%)
  const f = um("meta-folgada", com(meta())); assert.equal(f.numeros.aporteCentavos, 100000); textoCompleto(f);
  nenhum("meta-ritmo-acima-da-folga", com(meta()), HOJE, "(aporte 100000 ≤ folga 200000)");
  nenhum("meta-folgada", com(meta({ alvo: 1200012 })), HOJE, "(aporte 100001 > metade da folga)");
  const r = um("meta-ritmo-acima-da-folga", com(meta({ alvo: 2640000 }))); // 220000 > 200000
  assert.deepEqual([r.numeros.aporteCentavos, r.numeros.folgaCentavos], [220000, 200000]); textoCompleto(r);
  nenhum("meta-ritmo-acima-da-folga", com(meta({ alvo: 2400000 })), HOJE, "(aporte 200000 = folga)");
  const v = um("meta-prazo-passou", com(meta({ prazo: "2026-09-30", atual: 300000 })));
  assert.equal(v.numeros.faltaCentavos, 900000); textoCompleto(v);
  nenhum("meta-prazo-passou", com(meta({ prazo: "2026-09-30", atual: 1200000 })), HOJE, "(meta atingida)");
  nenhum("meta-prazo-passou", com(meta({ prazo: "2026-10-31" })), HOJE, "(prazo ainda é deste mês, não chegou)");
});

test("receita-caiu: 20% abaixo da mediana dos 3 meses anteriores dispara; 19,5% não; com 1 mês de base não", () => {
  const base = meses("2026-06", "2026-08").map((m) => L(`${m}-05`, "receita", 100000, "cat-salario"));
  const com = (r, b = base) => doc({ lancamentos: [...b, L("2026-09-05", "receita", r, "cat-salario")] });
  const i = um("receita-caiu", com(80000)); assert.equal(i.numeros.quedaBp, 2000); textoCompleto(i);
  nenhum("receita-caiu", com(80500), HOJE, "(19,5%)");
  nenhum("receita-caiu", com(80000, base.slice(2)), HOJE, "(1 mês de base)");
});

test("mes-no-vermelho: despesa maior que a receita do mês fechado dispara; igual não", () => {
  const com = (g) => doc({ lancamentos: [L("2026-09-05", "receita", 100000, "cat-salario"), noCartao("2026-09-12", g, "cat-outros")] });
  const i = um("mes-no-vermelho", com(100001)); assert.deepEqual([i.severidade, i.numeros.diferencaCentavos], ["atencao", 1]); textoCompleto(i);
  nenhum("mes-no-vermelho", com(100000), HOJE, "(empate)");
  nenhum("mes-no-vermelho", doc({ lancamentos: [noCartao("2026-09-12", 500000, "cat-outros")] }), HOJE, "(sem receita lançada não é 'vermelho')");
});

test("limite-categoria: 80% do limite informa, acima de 100% é atenção, 78% não", () => {
  const com = (g) => doc({ orcamento: { metodo: "limites", rollover: false, limites: { "cat-lazer": 50000 } }, lancamentos: [noCartao("2026-10-03", g, "cat-lazer")] });
  const a = um("limite-categoria", com(40000)); assert.deepEqual([a.variante, a.numeros.pct], ["perto", 80]); textoCompleto(a);
  nenhum("limite-categoria", com(39000), HOJE, "(78%)");
  const b = um("limite-categoria", com(51000)); assert.deepEqual([b.variante, b.severidade], ["passou", "atencao"]); textoCompleto(b);
});

test("sem-categoria-pendentes: 5 lançamentos importados sem categoria disparam; 4 não", () => {
  const sem = (n) => doc({ lancamentos: Array.from({ length: n }, (_, k) => L(`2026-10-0${k + 1}`, "despesa", 1000, null, { origem: "importacao", descricao: `X${k}` })) });
  const i = um("sem-categoria-pendentes", sem(5)); assert.equal(i.numeros.n, 5); textoCompleto(i);
  nenhum("sem-categoria-pendentes", sem(4), HOJE, "(4)");
});

test("desejos e necessidades: 35% e 60% da receita são o teto da margem (acima dispara, igual não); desejos quase zero é o outro lado", () => {
  const com = (cat, c) => doc({ lancamentos: mes(ANT, { receita: 100000, despesas: [[cat, c]] }) });
  const a = um("desejos-acima-da-faixa", com("cat-lazer", 35100)); assert.equal(a.numeros.taxaBp, 3510); textoCompleto(a);
  nenhum("desejos-acima-da-faixa", com("cat-lazer", 35000), HOJE, "(35,0%)");
  const b = um("necessidades-altas", com("cat-moradia", 60100)); assert.equal(b.numeros.taxaBp, 6010); textoCompleto(b);
  nenhum("necessidades-altas", com("cat-moradia", 60000), HOJE, "(60,0%)");
  const tres = (c) => doc({ lancamentos: meses("2026-07", "2026-09").flatMap((m) => mes(m, { receita: 100000, despesas: [["cat-lazer", c]] })) });
  const z = um("desejos-quase-zero", tres(5000)); assert.equal(z.numeros.taxaBp, 500); textoCompleto(z);
  nenhum("desejos-quase-zero", tres(5100), HOJE, "(5,1%)");
  nenhum("desejos-quase-zero", doc({ lancamentos: meses("2026-08", "2026-09").flatMap((m) => mes(m, { receita: 100000, despesas: [["cat-lazer", 0 + 1]] })) }), HOJE, "(só 2 meses)");
});

test("patrimonio-variacao: 5% entre os dois últimos snapshots (para cima ou para baixo) dispara; 4,9% não", () => {
  const snap = (b) => doc({ snapshots: [{ ym: "2026-08", patrimonioCentavos: 1000000, ativos: 1000000, passivos: 0 }, { ym: "2026-09", patrimonioCentavos: b, ativos: b, passivos: 0 }] });
  const a = um("patrimonio-variacao", snap(1050000)); assert.deepEqual([a.variante, a.numeros.taxaBp], ["subiu", 500]); textoCompleto(a);
  assert.equal(um("patrimonio-variacao", snap(950000)).variante, "caiu");
  nenhum("patrimonio-variacao", snap(1049000), HOJE, "(4,9%)");
  nenhum("patrimonio-variacao", doc({ snapshots: [{ ym: "2026-09", patrimonioCentavos: 1050000, ativos: 1, passivos: 0 }] }), HOJE, "(1 snapshot)");
});

test("lancamentos-parados: 5 dias sem lançar (com 10+ lançamentos) dispara; 4 dias ou 9 lançamentos não", () => {
  const dez = (ultimo, n = 10) => doc({ lancamentos: Array.from({ length: n }, (_, k) => L(somarDias(ultimo, -k), "despesa", 1000, "cat-outros")) });
  const i = um("lancamentos-parados", dez("2026-10-09")); assert.equal(i.numeros.dias, 5); textoCompleto(i);
  nenhum("lancamentos-parados", dez("2026-10-10"), HOJE, "(4 dias)");
  nenhum("lancamentos-parados", dez("2026-10-01", 9), HOJE, "(9 lançamentos)");
});

// ---------- corpo: cada regra dos dois lados ----------
// Semanas fechadas a partir de 05/10: ult = 05/10; base = 28/09, 21/09, 14/09, 07/09 (60 min cada: média 60).
const baseSemanas = (n = 4) => [["2026-09-28"], ["2026-09-21"], ["2026-09-14"], ["2026-09-07"]].slice(0, n).map(([d]) => T(d, { minutos: 60 }));
test("treino-volume-vs-media: 150% da média das 4 semanas anteriores dispara (alto), 50% dispara (baixo); 148% e 52% não; base com 2 semanas não", () => {
  const com = (min, base = baseSemanas()) => doc({ treinos: [...base, T("2026-10-06", { minutos: min })] });
  const a = um("treino-volume-vs-media", com(90)); assert.deepEqual([a.variante, a.severidade, a.numeros.razaoBp, a.numeros.mediaMinutos], ["alto", "atencao", 15000, 60]); textoCompleto(a);
  nenhum("treino-volume-vs-media", com(89), HOJE, "(148%)");
  const b = um("treino-volume-vs-media", com(30)); assert.deepEqual([b.variante, b.numeros.razaoBp], ["baixo", 5000]); textoCompleto(b);
  nenhum("treino-volume-vs-media", com(31), HOJE, "(51,7%)");
  nenhum("treino-volume-vs-media", com(90, baseSemanas(2)), HOJE, "(base com 2 semanas)");
});

test("grupo-muscular-esquecido: grupo que apareceu 2+ vezes antes e sumiu das últimas 2 semanas dispara; 1 vez, ou presente no período recente, ou sem dado de grupo não", () => {
  const antes = [T("2026-09-10", { grupos: ["Costas"] }), T("2026-09-20", { grupos: ["costas", "bíceps"] })];
  const recente = T("2026-10-05", { grupos: ["pernas"] });
  const i = um("grupo-muscular-esquecido", doc({ treinos: [...antes, recente] }));
  assert.deepEqual([i.numeros.grupo, i.numeros.vezes, i.numeros.dias], ["costas", 2, 24]); // 20/09 → 14/10 = 24 dias
  textoCompleto(i);
  nenhum("grupo-muscular-esquecido", doc({ treinos: [antes[0], recente] }), HOJE, "(1 vez)");
  nenhum("grupo-muscular-esquecido", doc({ treinos: [...antes, T("2026-10-08", { grupos: ["costas"] })] }), HOJE, "(voltou)");
  nenhum("grupo-muscular-esquecido", doc({ treinos: [T("2026-09-10"), T("2026-09-20"), T("2026-10-05")] }), HOJE, "(sem grupos registrados)");
  assert.equal(rodar("grupo-muscular-esquecido", doc({ treinos: [T("2026-09-10", { exercicios: [{ grupo: "Costas" }] }), T("2026-09-20", { musculos: ["costas"] }), recente] })).length, 1, "aceita `exercicios[].grupo` e `musculos`");
});

test("tipo-de-treino-esquecido: 3+ do mesmo tipo antes e nenhum nas 2 semanas dispara; 2 vezes não; semana toda sem treino fica com a retomada", () => {
  const corridas = (n) => ["2026-09-08", "2026-09-15", "2026-09-22"].slice(0, n).map((d) => T(d, { tipo: "Corrida" }));
  const i = um("tipo-de-treino-esquecido", doc({ treinos: [...corridas(3), T("2026-10-05")] })); assert.deepEqual([i.numeros.tipo, i.numeros.vezes], ["Corrida", 3]); textoCompleto(i);
  nenhum("tipo-de-treino-esquecido", doc({ treinos: [...corridas(2), T("2026-10-05")] }), HOJE, "(2 vezes)");
  nenhum("tipo-de-treino-esquecido", doc({ treinos: corridas(3) }), HOJE, "(nada treinado: é caso da retomada)");
  nenhum("tipo-de-treino-esquecido", doc({ treinos: [...corridas(3), T("2026-10-05", { tipo: "Corrida" })] }), HOJE, "(correu de novo)");
});

// Peso: 3 pesagens com 14 dias de intervalo (28 dias no total, a janela da tendência); a média de 7 dias na última é a própria pesagem.
// A inclinação é (última − primeira) ÷ 4 semanas.
const pesos3 = (a, b, c) => [P("2026-09-16", a), P("2026-09-30", b), P("2026-10-14", c)];
test("peso-ritmo-rapido: 1% da média por semana (perda ou ganho) dispara; 0,99% não; menos de 3 pesagens não", () => {
  const perda = um("peso-ritmo-rapido", doc({ pesos: pesos3(83.2, 81.6, 80.0) })); // (80,0 − 83,2) ÷ 4 = −0,8 kg/semana ÷ 80,0 = 1,0%
  assert.deepEqual([perda.variante, perda.severidade, perda.numeros.kgPorSemana, perda.numeros.pctPorSemana], ["perda", "atencao", 0.8, 1]); textoCompleto(perda);
  nenhum("peso-ritmo-rapido", doc({ pesos: pesos3(83.16, 81.58, 80.0) }), HOJE, "(−0,79 kg/semana = 0,99%)");
  assert.equal(um("peso-ritmo-rapido", doc({ pesos: pesos3(76.8, 78.4, 80.0) })).variante, "ganho");
  nenhum("peso-ritmo-rapido", doc({ pesos: pesos3(80.0, 80.1, 80.0) }), HOJE, "(estável)");
  nenhum("peso-ritmo-rapido", doc({ pesos: [P("2026-09-30", 82), P("2026-10-14", 80)] }), HOJE, "(2 pesagens)");
});

test("peso-direcao-oposta e peso-no-caminho: com meta de peso, a tendência para o lado errado (≥ 0,1 kg/sem e ≥ 1 kg da meta) ou para o lado certo (projeção)", () => {
  const meta = (alvo) => [{ id: "m-peso", nome: "Meta", tipo: "peso", alvo }];
  const subindo = doc({ pesos: pesos3(77.5, 78.0, 78.5), metas: meta(75) }); // +0,25 kg/sem, meta 3,5 kg abaixo
  const o = um("peso-direcao-oposta", subindo); assert.deepEqual([o.numeros.kgPorSemana, o.numeros.mediaKg, o.numeros.metaKg], [0.25, 78.5, 75]); textoCompleto(o);
  nenhum("peso-no-caminho", subindo, HOJE, "(rumo errado)");
  nenhum("peso-direcao-oposta", doc({ pesos: pesos3(77.5, 78.0, 78.5), metas: meta(78) }), HOJE, "(meta a 0,5 kg: perto demais)");
  nenhum("peso-direcao-oposta", doc({ pesos: pesos3(78.5, 78.5, 78.52), metas: meta(75) }), HOJE, "(ritmo de 0,01 kg/sem)");
  const descendo = doc({ pesos: pesos3(79.5, 79.0, 78.5), metas: meta(75) }); // −0,25 kg/sem: 3,5 kg ÷ 0,25 = 14 semanas
  const c = um("peso-no-caminho", descendo); assert.deepEqual([c.variante, c.numeros.semanas], ["indo", 14]); textoCompleto(c);
  nenhum("peso-direcao-oposta", descendo, HOJE, "(rumo certo)");
  const chegou = um("peso-no-caminho", doc({ pesos: pesos3(75.3, 75.15, 75.0), metas: meta(75) })); assert.equal(chegou.variante, "atingida"); textoCompleto(chegou);
  nenhum("peso-no-caminho", doc({ pesos: pesos3(79.5, 79.0, 78.5) }), HOJE, "(sem meta de peso)");
  nenhum("peso-no-caminho", doc({ pesos: pesos3(83.2, 81.6, 80.0), metas: meta(75) }), HOJE, "(ritmo rápido: quem fala é peso-ritmo-rapido)");
});

test("consistencia-semanas: 6 das últimas 8 semanas fechadas na meta celebra, 2 acolhe; 5 e 3 não; sem meta ou com menos de 4 semanas de uso não", () => {
  // meta 3 por semana; semanas fechadas: a mais recente começa em 05/10; as outras 7 vão de 14 em 14... de 7 em 7 dias para trás
  const semana = (k, n) => Array.from({ length: n }, (_, j) => T(somarDias(somarDias("2026-10-05", -7 * k), j)));
  const com = (naMeta, { meta = 3 } = {}) => doc({ metas: meta ? [{ id: "m-t", nome: "Treinar", tipo: "treino", alvo: meta }] : [], treinos: Array.from({ length: 8 }, (_, k) => semana(k, k < naMeta ? 3 : 1)).flat() });
  const alta = um("consistencia-semanas", com(6)); assert.deepEqual([alta.variante, alta.numeros.x, alta.numeros.de], ["alta", 6, 8]); textoCompleto(alta);
  nenhum("consistencia-semanas", com(5), HOJE, "(5 de 8)");
  const baixa = um("consistencia-semanas", com(2)); assert.equal(baixa.variante, "baixa"); textoCompleto(baixa);
  nenhum("consistencia-semanas", com(3), HOJE, "(3 de 8)");
  nenhum("consistencia-semanas", com(6, { meta: 0 }), HOJE, "(sem meta de treino)");
  nenhum("consistencia-semanas", doc({ metas: [{ id: "m-t", nome: "T", tipo: "treino", alvo: 3 }], treinos: [T("2026-10-06"), T("2026-10-07"), T("2026-10-08")] }), HOJE, "(primeiro treino há 8 dias)");
});

test("pesagem-esparsa: 21 dias sem pesar (com 3+ pesagens) dispara; 20 dias ou 2 pesagens não", () => {
  const com = (ultima, n = 3) => doc({ pesos: Array.from({ length: n }, (_, k) => P(somarDias(ultima, -7 * k), 80)) });
  const i = um("pesagem-esparsa", com("2026-09-23")); assert.equal(i.numeros.dias, 21); textoCompleto(i);
  nenhum("pesagem-esparsa", com("2026-09-24"), HOJE, "(20 dias)");
  nenhum("pesagem-esparsa", com("2026-09-23", 2), HOJE, "(2 pesagens)");
});

test("retomada: 4+ treinos antes e nenhum nas últimas 2 semanas dispara; 3 treinos antes ou um treino há 13 dias não", () => {
  const antes = (n) => ["2026-09-10", "2026-09-12", "2026-09-14", "2026-09-16"].slice(0, n).map((d) => T(d));
  const i = um("retomada", doc({ treinos: antes(4) })); assert.deepEqual([i.numeros.treinosAntes, i.numeros.minutos], [4, 240]); textoCompleto(i);
  nenhum("retomada", doc({ treinos: antes(3) }), HOJE, "(3 treinos antes)");
  nenhum("retomada", doc({ treinos: [...antes(4), T("2026-10-01")] }), HOJE, "(treinou há 13 dias)");
  assert.equal(rodar("retomada", doc({ treinos: [...antes(4), T("2026-09-30")] })).length, 1, "14 dias sem treino já conta");
});

test("academia-ociosa: mensalidade ativa e 14 dias sem treino disparam; 13 dias ou sem mensalidade não", () => {
  const acad = { id: "r-ac", nome: "Academia", tipo: "despesa", centavos: 12900, categoriaId: "cat-saude-fitness", contaId: "c1", freq: "mensal", intervalo: 1, diaDoMes: 10, inicio: "2026-01-10", ativa: true };
  const i = um("academia-ociosa", doc({ recorrencias: [acad], treinos: [T("2026-09-30")] })); assert.deepEqual([i.numeros.mensalidadeCentavos, i.numeros.dias], [12900, 14]); textoCompleto(i);
  nenhum("academia-ociosa", doc({ recorrencias: [acad], treinos: [T("2026-10-01")] }), HOJE, "(13 dias)");
  nenhum("academia-ociosa", doc({ treinos: [T("2026-09-01")] }), HOJE, "(sem mensalidade)");
  nenhum("academia-ociosa", doc({ recorrencias: [{ ...acad, ativa: false }], treinos: [T("2026-09-01")] }), HOJE, "(plano inativo)");
});

test("sem-dia-de-descanso: 7 dias seguidos treinando, ou 6 com esforço médio ≥ 4, dispara; 6 com esforço 3 ou média 3,83 não", () => {
  const dias = (n, esforcos) => Array.from({ length: n }, (_, k) => T(somarDias("2026-10-14", -k), { esforco: esforcos[k % esforcos.length] }));
  const a = um("sem-dia-de-descanso", doc({ treinos: dias(7, [2]) })); assert.equal(a.numeros.dias, 7); assert.equal(a.severidade, "atencao"); textoCompleto(a);
  nenhum("sem-dia-de-descanso", doc({ treinos: dias(6, [3]) }), HOJE, "(6 dias, esforço 3)");
  assert.equal(rodar("sem-dia-de-descanso", doc({ treinos: dias(6, [4]) })).length, 1);
  nenhum("sem-dia-de-descanso", doc({ treinos: dias(6, [4, 4, 4, 4, 4, 3]) }), HOJE, "(média 3,83)");
});

// ---------- priorização por meio-termo ----------
const ins = (id, eixo, { sev = "info", impacto = 3, acionavel = 3, alvo = null } = {}) => ({ id, chave: alvo ? `${id}:${alvo}` : id, eixo, severidade: sev, impacto, acionavel, pontuacao: pontuacao({ severidade: sev, impacto, acionavel }) });
test("pontuação: impacto × acionabilidade, com peso 1,5 para atenção; ordem estável por chave em empate", () => {
  assert.equal(pontuacao({ severidade: "info", impacto: 4, acionavel: 5 }), 20);
  assert.equal(pontuacao({ severidade: "atencao", impacto: 4, acionavel: 5 }), 30);
  const a = ins("b", "dinheiro"), b = ins("a", "dinheiro");
  assert.deepEqual(ordenar([a, b]).map((x) => x.id), ["a", "b"]);
});

test("priorizar: no máximo 3, no máximo 2 por eixo, no máximo 2 de atenção, 1 por regra; embaralhar a entrada não muda o resultado", () => {
  const lista = [
    ins("a", "dinheiro", { impacto: 5, acionavel: 5 }), ins("b", "dinheiro", { impacto: 5, acionavel: 4 }), ins("c", "dinheiro", { impacto: 5, acionavel: 3 }),
    ins("d", "corpo", { impacto: 2, acionavel: 2 }), ins("e", "corpo", { impacto: 1, acionavel: 1 }),
  ];
  assert.deepEqual(priorizar(lista).map((x) => x.id), ["a", "b", "d"], "o terceiro de dinheiro fica de fora (máx. 2 por eixo) e o corpo entra");
  assert.deepEqual(priorizar([...lista].reverse()).map((x) => x.id), ["a", "b", "d"]);
  const alertas = [ins("a1", "dinheiro", { sev: "atencao", impacto: 5, acionavel: 5 }), ins("a2", "corpo", { sev: "atencao", impacto: 5, acionavel: 5 }), ins("a3", "corpo", { sev: "atencao", impacto: 5, acionavel: 4 }), ins("i1", "dinheiro", { impacto: 1, acionavel: 1 })];
  assert.deepEqual(priorizar(alertas).map((x) => x.id), ["a1", "a2", "i1"], "só 2 alertas por visita: o terceiro cede a vez a um informativo");
  const mesmaRegra = [ins("r", "dinheiro", { alvo: "x", impacto: 5, acionavel: 5 }), ins("r", "dinheiro", { alvo: "y", impacto: 5, acionavel: 5 }), ins("s", "corpo")];
  assert.deepEqual(priorizar(mesmaRegra).map((x) => x.chave), ["r:x", "s"], "uma instância por regra");
  assert.equal(priorizar(Array.from({ length: 9 }, (_, k) => ins(`z${k}`, k % 2 ? "corpo" : "dinheiro"))).length, LIMITES_DA_VISITA.maximo);
});

test("dispensar: o dispensado nunca volta, mesmo sendo o de maior prioridade; restaurar traz de volta; a lista tem teto e não duplica", () => {
  const lista = [ins("a", "dinheiro", { impacto: 5, acionavel: 5 }), ins("b", "corpo"), ins("c", "dinheiro")];
  assert.deepEqual(priorizar(lista, { dispensados: ["a"] }).map((x) => x.id), ["b", "c"]);
  let guardados = dispensar([], "a"); guardados = dispensar(guardados, "a");
  assert.deepEqual(guardados, ["a"]);
  assert.deepEqual(restaurar(guardados, "a"), []);
  const cheia = Array.from({ length: 300 }, (_, k) => `x${k}`);
  const depois = dispensar(cheia, "novo");
  assert.equal(depois.length, 300); assert.equal(depois[299], "novo"); assert.ok(!depois.includes("x0"), "o mais antigo sai");
});

test("paraOlhar com dados reais: dispensar cada insight mostrado faz ele nunca mais aparecer, até esgotar", () => {
  const d0 = dadosExemplo(); // várias regras disparam
  let d = d0, vistos = new Set();
  for (let volta = 0; volta < 12; volta++) {
    const { itens } = paraOlhar(d, HOJE_EXEMPLO);
    for (const i of itens) assert.ok(!vistos.has(i.chave), `${i.chave} voltou depois de dispensado`);
    if (!itens.length) break;
    assert.ok(itens.length <= 3);
    for (const i of itens) vistos.add(i.chave);
    d = definir(d, "perfil", { insightsDispensados: [...(d.perfil.insightsDispensados ?? []), ...itens.map((i) => i.chave)] }, { agora: () => AGORA });
    assert.ok(validar(d).ok, JSON.stringify(validar(d).erros));
  }
  assert.ok(vistos.size >= 3, "o exemplo deveria ter pelo menos 3 insights para o teste valer");
  assert.equal(paraOlhar(d, HOJE_EXEMPLO).itens.length, 0);
});

// ---------- esquema: extras do perfil ----------
test("esquema: perfil com insightsDispensados e revisoes válidos passa; formas inválidas são recusadas com código", () => {
  const ok = (p) => validar({ ...doc(), perfil: { ...doc().perfil, ...p } });
  assert.ok(ok({}).ok, "perfil antigo, sem os extras, continua válido");
  assert.ok(ok({ insightsDispensados: ["a:b"], revisoes: { "2026-10-05": { vitorias: ["x", "", ""], ajuste: "a", intencao: "i", atualizadoEm: AGORA } } }).ok);
  const codigos = (p) => ok(p).erros.map((e) => e.codigo);
  assert.deepEqual(codigos({ insightsDispensados: "nao-lista" }), ["perfil.insights_dispensados_invalidos"]);
  assert.deepEqual(codigos({ insightsDispensados: Array.from({ length: 301 }, (_, k) => `c${k}`) }), ["perfil.insights_dispensados_invalidos"]);
  assert.deepEqual(codigos({ insightsDispensados: [""] }), ["perfil.insights_dispensados_invalidos"]);
  assert.deepEqual(codigos({ revisoes: { "nao-e-data": { vitorias: [], ajuste: "", intencao: "" } } }), ["perfil.revisoes_invalidas"]);
  assert.deepEqual(codigos({ revisoes: { "2026-10-05": { vitorias: ["a", "b", "c", "d"], ajuste: "", intencao: "" } } }), ["perfil.revisoes_invalidas"]);
  assert.deepEqual(codigos({ revisoes: { "2026-10-05": { vitorias: [], ajuste: "x".repeat(281), intencao: "" } } }), ["perfil.revisoes_invalidas"]);
});

// ---------- revisão da semana ----------
test("semanaDaRevisao: sábado e domingo fecham a semana corrente; de segunda a sexta a revisão é da semana passada", () => {
  const casos = { "2026-10-05": ["2026-09-28", false], "2026-10-09": ["2026-09-28", false], "2026-10-10": ["2026-10-05", true], "2026-10-11": ["2026-10-05", true], "2026-10-12": ["2026-10-05", false] };
  for (const [hoje, [inicio, fecha]] of Object.entries(casos)) { const s = semanaDaRevisao(hoje); assert.deepEqual([s.inicio, s.fim === somarDias(inicio, 6), s.fechaAgora], [inicio, true, fecha], hoje); }
});

test("dadosDaSemana: entrou, saiu, sobrou e variação contra a semana anterior (números à mão); corpo da semana", () => {
  const d = doc({
    lancamentos: [
      L("2026-10-05", "receita", 300000, "cat-salario"),
      L("2026-10-06", "despesa", 10000, "cat-mercado", { descricao: "Feira" }), L("2026-10-08", "despesa", 25000, "cat-lazer", { descricao: "Show" }),
      L("2026-10-09", "estorno", 5000, "cat-lazer", { refId: "x" }),
      L("2026-09-30", "despesa", 20000, "cat-mercado"),
      L("2026-10-07", "transferencia", 99999, null, { contaDestinoId: "c2" }),
    ],
    treinos: [T("2026-10-06", { minutos: 45 }), T("2026-10-08", { minutos: 30 })], pesos: [P("2026-10-05", 80.4), P("2026-10-09", 79.8)],
    metas: [{ id: "m-t", nome: "T", tipo: "treino", alvo: 2 }],
  });
  const w = dadosDaSemana(d, "2026-10-05", HOJE);
  // entrou 300000; saiu 10000 + 25000 − 5000 = 30000; sobrou 270000; semana anterior saiu 20000 → +50%
  assert.deepEqual([w.dinheiro.entrouCentavos, w.dinheiro.saiuCentavos, w.dinheiro.poupouCentavos, w.dinheiro.saiuAnteriorCentavos, w.dinheiro.variacaoSaiuBp], [300000, 30000, 270000, 20000, 5000]);
  assert.deepEqual(w.dinheiro.maiorGasto && [w.dinheiro.maiorGasto.centavos, w.dinheiro.maiorGasto.descricao], [25000, "Show"]);
  // cat-lazer: 25000 − 5000 = 20000 (delta +20000 vs. 0); cat-mercado: 10000 (delta −10000)
  assert.deepEqual(w.dinheiro.topCategorias.map((c) => [c.categoriaId, c.centavos, c.deltaCentavos]), [["cat-lazer", 20000, 20000], ["cat-mercado", 10000, -10000]]);
  assert.deepEqual([w.corpo.treinos, w.corpo.minutos, w.corpo.metaTreinos, w.corpo.pesagens, w.corpo.deltaKg], [2, 75, 2, 2, -0.6]);
  assert.equal(w.emAndamento, false, "em 14/10 a semana 05–11/10 já terminou");
  assert.equal(dadosDaSemana(d, "2026-10-05", "2026-10-09").emAndamento, true);
  assert.equal(w.diasComRegistro, 5, "dias 05, 06, 07 (transferência), 08 e 09");
});

test("dadosDaSemana lê sono e refeições se existirem; sem as coleções, nada quebra", () => {
  const d = { ...doc(), sonos: [{ data: "2026-10-06", horas: 7 }, { data: "2026-10-07", horas: 8 }], refeicoes: [{ data: "2026-10-06" }, { data: "2026-10-12" }] };
  const w = dadosDaSemana(d, "2026-10-05", HOJE);
  assert.deepEqual([w.corpo.sonoMedioHoras, w.corpo.noites, w.corpo.refeicoes], [7.5, 2, 1]);
  assert.equal(dadosDaSemana(doc(), "2026-10-05", HOJE).corpo.sonoMedioHoras, null);
});

test("vitoriasSugeridas: sempre pelo menos 3, todas com texto nos dois idiomas; os números certos entram", () => {
  const vazia = dadosDaSemana(doc(), "2026-10-05", HOJE);
  assert.ok(vitoriasSugeridas(vazia).length >= 3, "semana vazia ainda tem 3 sugestões (olhar os números já é vitória)");
  const d = doc({ lancamentos: [L("2026-10-05", "receita", 300000, "cat-salario"), L("2026-10-06", "despesa", 10000, "cat-outros")], treinos: [T("2026-10-06"), T("2026-10-07"), T("2026-10-08")], metas: [{ id: "m-t", nome: "T", tipo: "treino", alvo: 3 }], pesos: [P("2026-10-07", 80)] });
  const v = vitoriasSugeridas(dadosDaSemana(d, "2026-10-05", HOJE));
  assert.deepEqual(v.slice(0, 3).map((x) => x.chave), ["treinos_meta", "poupou", "registrou_dias"]);
  for (const idioma of ["pt-BR", "en"]) { const { t } = criarI18n({ idioma, dicionarios: [dic] }), fmt = criarFmt(idioma); for (const x of v) { const s = t(`revisao.vit.${x.chave}`, parametrosDoInsight(x, fmt)); assert.ok(!/[{}]|\[revisao/.test(s), `${idioma} ${x.chave}: ${s}`); } }
});

test("salvarRevisao: guarda a revisão da semana, corta em 280 caracteres, o documento continua válido e revisaoDe devolve o mesmo; 104 semanas no máximo", () => {
  let d = doc();
  d = salvarRevisao(d, "2026-10-05", { vitorias: ["  treinei  ", "", "x".repeat(400)], ajuste: "dormir antes das 23h", intencao: "treinar terça e quinta" }, { agora: () => AGORA });
  assert.ok(validar(d).ok, JSON.stringify(validar(d).erros));
  const r = revisaoDe(d, "2026-10-05");
  assert.deepEqual([r.vitorias[0], r.vitorias[1], r.vitorias[2].length, r.ajuste, r.intencao, r.atualizadoEm], ["treinei", "", 280, "dormir antes das 23h", "treinar terça e quinta", AGORA]);
  assert.deepEqual(revisaoDe(d, "2026-09-28"), { vitorias: ["", "", ""], ajuste: "", intencao: "", atualizadoEm: null });
  for (let k = 0; k < 110; k++) d = salvarRevisao(d, somarDias("2024-01-01", 7 * k), { vitorias: ["a"], ajuste: "", intencao: "" }, { agora: () => AGORA });
  assert.equal(Object.keys(d.perfil.revisoes).length, 104);
  assert.ok(!(("2024-01-01") in d.perfil.revisoes) || false, "as semanas mais antigas saíram");
  assert.ok(validar(d).ok);
});

test("textoDaRevisao: exporta dinheiro, corpo, vitórias, ajuste e intenção em Markdown, nos dois idiomas", () => {
  const d = doc({ lancamentos: [L("2026-10-05", "receita", 300000, "cat-salario"), L("2026-10-06", "despesa", 10000, "cat-outros")], treinos: [T("2026-10-06", { minutos: 45 })] });
  const w = dadosDaSemana(d, "2026-10-05", HOJE), rev = { vitorias: ["treinei", "", "li"], ajuste: "dormir cedo", intencao: "caminhar" };
  const pt = textoDaRevisao({ dados: w, revisao: rev, t: criarI18n({ idioma: "pt-BR", dicionarios: [dic] }).t, fmt: criarFmt("pt-BR") }).replace(/\u00a0/g, " "); // o Intl separa R$ do valor com espaço inseparável
  assert.match(pt, /^# Revisão da semana de 05\/10\/2026 a 11\/10\/2026/);
  for (const trecho of ["Entrou: R$ 3.000,00", "Saiu: R$ 100,00", "Sobrou: R$ 2.900,00", "Treinos: 1 (45 min)", "1. treinei", "2. li", "dormir cedo", "caminhar"]) assert.ok(pt.includes(trecho), trecho);
  const en = textoDaRevisao({ dados: w, revisao: rev, t: criarI18n({ idioma: "en", dicionarios: [dic] }).t, fmt: criarFmt("en") });
  assert.match(en, /^# Weekly review, 10\/05\/2026 to 10\/11\/2026/);
  assert.ok(!/[{}]|\[revisao/.test(pt + en));
});

// ---------- equilíbrio ----------
test("equilibrio: cada eixo em cada faixa, com a conta à vista (valores à mão)", () => {
  const eixo = (d, id) => equilibrio(d, HOJE).eixos.find((e) => e.id === id);
  const taxa = (g) => doc({ lancamentos: meses("2026-07", "2026-09").flatMap((m) => mes(m, { receita: 100000, despesas: [["cat-outros", g]] })) });
  // dinheiro: poupança 5% / 20% / 60% da receita → falta / equilíbrio / excesso (faixa 10% a 50%); mediana de 3 meses
  assert.deepEqual([eixo(taxa(95000), "dinheiro").faixa, eixo(taxa(95000), "dinheiro").valor], ["falta", 500]);
  assert.equal(eixo(taxa(80000), "dinheiro").faixa, "equilibrio");
  assert.equal(eixo(taxa(40000), "dinheiro").faixa, "excesso");
  assert.equal(eixo(taxa(90000), "dinheiro").faixa, "equilibrio", "10% exatos estão dentro");
  assert.equal(eixo(taxa(50000), "dinheiro").faixa, "equilibrio", "50% exatos estão dentro");
  assert.deepEqual(eixo(taxa(80000), "dinheiro").conta.map((c) => c.bp), [2000, 2000, 2000]);
  // corpo: média de minutos por semana nas 4 semanas fechadas
  const min = (m) => doc({ treinos: ["2026-10-05", "2026-09-28", "2026-09-21", "2026-09-14"].map((s) => T(s, { minutos: m })) });
  assert.deepEqual([eixo(min(149), "corpo").faixa, eixo(min(150), "corpo").faixa, eixo(min(450), "corpo").faixa, eixo(min(451), "corpo").faixa], ["falta", "equilibrio", "equilibrio", "excesso"]);
  // descanso por folga: 7 dias − dias com treino por semana; 2 a 7 é equilíbrio
  const folga = (n) => doc({ treinos: ["2026-10-05", "2026-09-28", "2026-09-21", "2026-09-14"].flatMap((s) => Array.from({ length: n }, (_, k) => T(somarDias(s, k)))) });
  assert.deepEqual([eixo(folga(6), "descanso").faixa, eixo(folga(6), "descanso").valor, eixo(folga(5), "descanso").faixa], ["falta", 1, "equilibrio"]);
  // descanso por sono (≥ 7 registros em 14 dias): 6,9 h falta; 7 h equilíbrio; 9,1 h excesso
  const sono = (h) => ({ ...doc(), sonos: Array.from({ length: 7 }, (_, k) => ({ data: somarDias(HOJE, -k), horas: h })) });
  assert.deepEqual([eixo(sono(6.9), "descanso").faixa, eixo(sono(7), "descanso").faixa, eixo(sono(9.1), "descanso").faixa, eixo(sono(7), "descanso").variante], ["falta", "equilibrio", "excesso", "sono"]);
  // constância: semanas fechadas (de 8) com algum registro; 5 a 8
  const reg = (n) => doc({ pesos: Array.from({ length: n }, (_, k) => P(somarDias("2026-10-05", -7 * k), 80)), lancamentos: [L("2026-08-01", "despesa", 100, "cat-outros")] });
  assert.deepEqual([eixo(reg(4), "constancia").faixa, eixo(reg(5), "constancia").faixa, eixo(reg(8), "constancia").valor], ["falta", "equilibrio", 8]);
});

test("equilibrio: eixo sem dado fica 'sem_dado' (nunca zero), e o resumo só conta eixos com dado", () => {
  const e = equilibrio(doc(), HOJE);
  assert.deepEqual(e.eixos.map((x) => x.faixa), ["sem_dado", "sem_dado", "sem_dado", "sem_dado"]);
  assert.deepEqual([e.comDado, e.emEquilibrio], [0, 0]);
  assert.ok(e.eixos.every((x) => x.valor === null));
  const poucoUso = equilibrio(doc({ pesos: [P("2026-10-10", 80)] }), HOJE).eixos.find((x) => x.id === "constancia");
  assert.equal(poucoUso.faixa, "sem_dado", "menos de 4 semanas de uso não pune quem acabou de chegar");
  for (const k of Object.keys(FAIXAS)) assert.ok(FAIXAS[k].lo < FAIXAS[k].hi, k);
});

test("posicaoNaRegua: a faixa de equilíbrio ocupa o terço do meio; abaixo cai no 1º terço, acima no último, sempre dentro de 0 a 100", () => {
  const f = { lo: 150, hi: 450 };
  assert.equal(posicaoNaRegua(150, f), 33); assert.equal(posicaoNaRegua(450, f), 67); assert.equal(posicaoNaRegua(300, f), 50);
  assert.ok(posicaoNaRegua(0, f) >= 2 && posicaoNaRegua(0, f) < 33); assert.ok(posicaoNaRegua(75, f) < posicaoNaRegua(149, f));
  assert.ok(posicaoNaRegua(9999, f) <= 98 && posicaoNaRegua(9999, f) > 67);
});

// ---------- dicionário e fontes ----------
test("dicionário: paridade pt-BR/en, prefixo revisao., e nenhuma palavra de culpa nem 'sequência'", () => {
  assert.deepEqual(paridade(dic), []);
  for (const k of Object.keys(dic["pt-BR"])) assert.ok(k.startsWith("revisao."), k);
  const proibidas = /estourou|falhou|perdeu a sequ|sequência|sequencia|streak|atrasad|culpa|you broke|failed|preguiç|lazy|gordo|fat\b|engordou|vergonha|shame/i;
  for (const [idioma, d] of Object.entries(dic)) for (const [k, v] of Object.entries(d)) assert.ok(!proibidas.test(v), `${idioma} ${k}: "${v}"`);
});

test("dicionário: nenhuma chave morta (toda chave `revisao.i.*` pertence a uma regra do catálogo)", () => {
  const ids = new Set(CATALOGO.map((r) => r.id));
  for (const k of Object.keys(dic["pt-BR"]).filter((x) => x.startsWith("revisao.i."))) assert.ok([...ids].some((id) => k.startsWith(`revisao.i.${id}.`)), `chave sem regra: ${k}`);
});

test("saúde: nenhum texto de insight dá meta de déficit, piso de caloria ou diagnóstico; o ritmo rápido de peso manda procurar profissional", () => {
  const proibido = /dieta|jejum|kcal|caloria|diagn|doença|disease|diet\b|fasting|calorie/i;
  for (const [idioma, d] of Object.entries(dic)) for (const [k, v] of Object.entries(d)) assert.ok(!proibido.test(v), `${idioma} ${k}: "${v}"`);
  for (const k of ["revisao.i.peso-ritmo-rapido.perda.p", "revisao.i.peso-ritmo-rapido.ganho.p"]) { assert.match(dic["pt-BR"][k], /médico/); assert.match(dic.en[k], /doctor/); }
  assert.match(dic["pt-BR"]["revisao.eq.aviso"], /profissional/); assert.match(dic.en["revisao.eq.aviso"], /professional/);
});

test("módulos de insights são puros: sem DOM, rede, relógio, aleatório nem innerHTML; telas e cartão sem style= nem innerHTML", () => {
  const pasta = join(FITRICH, "js", "v2", "insights");
  for (const arq of readdirSync(pasta).filter((f) => f.endsWith(".mjs"))) {
    const src = readFileSync(join(pasta, arq), "utf8").replace(/\/\/.*$/gm, "");
    for (const proibido of [/\bdocument\b/, /\bwindow\b/, /\bfetch\(/, /Date\.now/, /new Date\(\)/, /Math\.random/, /innerHTML/, /localStorage/, /XMLHttpRequest/]) assert.ok(!proibido.test(src), `${arq}: ${proibido}`);
  }
  for (const arq of ["ui/telas/revisao.mjs", "ui/insights-ui.mjs", "ui/cartao-para-olhar.mjs"]) {
    const src = readFileSync(join(FITRICH, "js", "v2", arq), "utf8").replace(/\/\/.*$/gm, "");
    for (const proibido of [/innerHTML/, /\bstyle\s*:/, /style=/, /\bfetch\(/, /eval\(/, /new Function/]) assert.ok(!proibido.test(src), `${arq}: ${proibido}`);
  }
});

test("cartão da Hoje: a Hoje só importa o cartão sob demanda (import dinâmico), para o motor não pesar no carregamento inicial", () => {
  const src = readFileSync(join(FITRICH, "js", "v2", "ui", "telas", "hoje.mjs"), "utf8");
  const slots = readFileSync(join(FITRICH, "js", "v2", "ui", "slots-hoje.mjs"), "utf8");
  assert.match(slots, /carregar: \(\) => import\("\.\/telas\/hoje-insights\.mjs"\)/, "o cartão entra pelo slot, carregado sob demanda");
  assert.ok(!/^import .*insights/m.test(src), "import estático de insights na Hoje");
  assert.ok(!/^import .*cartao-para-olhar/m.test(src));
});
