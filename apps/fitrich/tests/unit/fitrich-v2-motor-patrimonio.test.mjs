// Motor v2 (área 3): aritmética, índices, dívidas, metas e patrimônio. Todo caso numérico está
// conferido à mão no comentário ao lado; o nome do teste descreve a FALHA que ele pega.
import assert from "node:assert/strict";
import { test } from "node:test";
import { aaParaAm, aaParaAmBp, arredondar, taxaReal } from "../../app/js/v2/taxas.mjs";
import { DIAS_PARA_DESATUALIZADO, SNAPSHOT_INDICES, idadeDoSnapshotEmDias, indicesVigentes } from "../../app/js/v2/indices.mjs";
import { cet, compararMetodos, parcelaPrice, quitarOuInvestir, simularQuitacao, tabelaPrice } from "../../app/js/v2/dividas.mjs";
import {
  aporteMensal, aporteMensalReal, despesaEssencialMedia, independenciaFinanceira, progressoMetas, reservaEmergencia, sugestaoCobertura, taxaRealMensal,
} from "../../app/js/v2/metas.mjs";
import { patrimonioLiquido, registrarSnapshot, snapshotMensal, variacaoMensal } from "../../app/js/v2/patrimonio.mjs";

const IDX = indicesVigentes(SNAPSHOT_INDICES);

// ---------- aritmética ----------

test("arredondar é half-up sobre o módulo: −2,5 vira −3 (Math.round daria −2) e 2,5 vira 3", () => {
  assert.equal(arredondar(2.5), 3);
  assert.equal(arredondar(-2.5), -3);
  assert.equal(Math.round(-2.5), -2, "o motivo de não usar Math.round direto");
  assert.equal(arredondar(-2.4), -2);
  assert.equal(arredondar(0), 0);
});

test("taxa anual vira mensal pela geométrica, não por /12: 13,65 % a.a. → 1,0720 % a.m., não 1,1375 %", () => {
  const am = aaParaAm(1365);
  assert.ok(Math.abs(am - 0.010720) < 0.0000005, String(am)); // (1,1365)^(1/12) − 1 = 0,0107198…
  assert.equal(aaParaAmBp(1365), 107);
  assert.notEqual(Math.round((1365 / 12) * 100) / 100, aaParaAmBp(1365), "/12 daria 113,75 bp");
  assert.throws(() => aaParaAm(13.65), /taxa_invalida/, "taxa tem que ser bp inteiro");
  // Fisher: (1,1365)/(1,0422) − 1 = 9,048 % a.a., e não 13,65 − 4,22 = 9,43
  assert.ok(Math.abs(taxaReal(0.1365, 0.0422) - 0.090481) < 0.000001);
});

// ---------- índices ----------

test("snapshot de índices tem os valores da pesquisa, data e fonte; a idade passa a `desatualizado` depois de 45 dias", () => {
  assert.equal(SNAPSHOT_INDICES.selicBp, 1375);
  assert.equal(SNAPSHOT_INDICES.cdiBp, 1365);
  assert.equal(SNAPSHOT_INDICES.ipca12Bp, 422);
  assert.equal(SNAPSHOT_INDICES.rotativoPfBp, 44489);
  assert.equal(SNAPSHOT_INDICES.parceladoPfBp, 19208);
  assert.equal(SNAPSHOT_INDICES.ptax.USD.vendaBp, 52238);
  assert.equal(SNAPSHOT_INDICES.ptax.USD.data, "2026-10-02");
  assert.equal(SNAPSHOT_INDICES.ptax.USD.compraBp, null, "compra não foi conferida: null, não número inventado");
  assert.ok(SNAPSHOT_INDICES.fonte && SNAPSHOT_INDICES.atualizadoEm);
  assert.equal(DIAS_PARA_DESATUALIZADO, 45);
  assert.deepEqual(idadeDoSnapshotEmDias(SNAPSHOT_INDICES, "2026-11-16"), { dias: 45, codigo: "ok" }); // 02/10 → 16/11 = 29 + 16
  assert.deepEqual(idadeDoSnapshotEmDias(SNAPSHOT_INDICES, "2026-11-17"), { dias: 46, codigo: "desatualizado" });
  assert.throws(() => idadeDoSnapshotEmDias(SNAPSHOT_INDICES, "17/11/2026"), /data_invalida/);
});

test("o que a pessoa digita passa por cima do snapshot e fica marcado como `usuario`; taxa quebrada ou negativa é recusada", () => {
  const v = indicesVigentes(SNAPSHOT_INDICES, { selicBp: 1500 });
  assert.equal(v.selicBp, 1500);
  assert.equal(v.cdiBp, 1365);
  assert.equal(v.origem.selicBp, "usuario");
  assert.equal(v.origem.cdiBp, "snapshot");
  assert.throws(() => indicesVigentes(SNAPSHOT_INDICES, { selicBp: 15.5 }), /override_invalido:selicBp/);
  assert.throws(() => indicesVigentes(SNAPSHOT_INDICES, { cdiBp: -1 }), /override_invalido:cdiBp/);
  assert.equal(indicesVigentes(SNAPSHOT_INDICES, { inventado: 1 }).inventado, undefined, "campo desconhecido não entra");
});

// ---------- dívidas ----------

test("Price: 1.000,00 a 2 % em 12x dá 94,56; a tabela zera o saldo e o resto dos centavos vai para a última parcela", () => {
  // PMT = 1000 × 0,02 / (1 − 1,02^−12) = 20 / 0,211513 = 94,5596 → 94,56
  assert.equal(parcelaPrice(100000, 200, 12), 9456);
  const t = tabelaPrice(100000, 200, 12);
  assert.equal(t.parcelaCentavos, 9456);
  assert.equal(t.parcelas.length, 12);
  assert.equal(t.parcelas[11].saldoCentavos, 0, "última parcela zera");
  assert.equal(t.parcelas.reduce((s, p) => s + p.amortizacaoCentavos, 0), 100000, "Σ amortização = principal");
  assert.equal(t.parcelas[0].jurosCentavos, 2000); // 1000 × 2 %
  assert.equal(t.parcelas[0].amortizacaoCentavos, 7456);
  // 12 × 94,56 = 1.134,72 é o total sem arredondar por período. Arredondando os juros de cada mês
  // (regra do plano) o saldo antes da última é 92,69 + juros 1,85 → última 94,54 e total 1.134,70:
  // 2 centavos abaixo do nominal, e é a tabela que fecha, não o produto.
  assert.equal(t.parcelas[11].parcelaCentavos, 9454);
  assert.equal(t.totalPagoCentavos, 113470);
  assert.equal(t.totalJurosCentavos, 13470);
  assert.ok(Math.abs(t.totalPagoCentavos - 12 * 9456) <= 2);
});

test("fronteiras do Price: n = 1 paga principal + juros, taxa 0 divide em partes iguais, prazo 0 e juros negativos são recusados", () => {
  assert.equal(parcelaPrice(100000, 200, 1), 102000);
  assert.equal(parcelaPrice(100000, 0, 12), 8333); // 1000/12 = 83,333…
  const t0 = tabelaPrice(100000, 0, 12);
  assert.equal(t0.parcelas[11].parcelaCentavos, 8337, "100000 − 11 × 8333 = 8337 na última");
  assert.equal(t0.totalJurosCentavos, 0);
  assert.throws(() => parcelaPrice(100000, 200, 0), /prazo_invalido/);
  assert.throws(() => parcelaPrice(100000, -50, 12), /juros_negativos/);
  assert.throws(() => parcelaPrice(1000.5, 200, 12), /centavos_invalidos/);
});

test("CET por bisseção: sem tarifa, 12 × 94,56 por 1.000,00 devolve ~2 % a.m. (26,82 % a.a.); tarifa e IOF sobem o CET acima da taxa nominal", () => {
  const puro = cet({ valorLiberadoCentavos: 100000, parcelaCentavos: 9456, n: 12 });
  assert.equal(puro.mensalBp, 200); // 94,56 é 94,5596 arredondado: a taxa implícita é 2,0008 % → 200 bp
  assert.equal(puro.anualBp, 2683); // 1,020008^12 − 1 = 26,83 %
  assert.equal(puro.codigo, "ok");
  // Recebeu 1.000 − 50 de tarifa − 10 de IOF = 940 e paga as mesmas 12 × 94,56: PV(i) = 940 → i ≈ 2,99 % a.m.
  const comTarifa = cet({ valorLiberadoCentavos: 100000, tarifasCentavos: 5000, iofCentavos: 1000, parcelaCentavos: 9456, n: 12 });
  assert.ok(comTarifa.mensalBp > 290 && comTarifa.mensalBp < 310, String(comTarifa.mensalBp));
  // Fluxo explícito irregular funciona igual
  const irregular = cet({ valorLiberadoCentavos: 100000, parcelas: [{ mes: 1, centavos: 51000 }, { mes: 2, centavos: 51000 }] });
  assert.ok(irregular.mensalBp > 0);
  assert.equal(cet({ valorLiberadoCentavos: 100000, parcelaCentavos: 50000, n: 2 }).codigo, "sem_juros");
  assert.throws(() => cet({ valorLiberadoCentavos: 100000, tarifasCentavos: 100000, parcelaCentavos: 9456, n: 12 }), /valor_liberado_invalido/);
});

// Cenário do plano em que os métodos DIVERGEM: a menor dívida (A) tem o MENOR juro. Se a menor
// dívida também tivesse o maior juro, os dois métodos escolheriam a mesma e o teste não provaria nada.
const DIVIDAS = [
  { id: "A", saldoCentavos: 200000, taxaMensalBp: 150, parcelaMinimaCentavos: 10000 },
  { id: "B", saldoCentavos: 1000000, taxaMensalBp: 800, parcelaMinimaCentavos: 50000 },
];

test("avalanche quita em 12 meses com R$ 5.700,84 de juros; bola de neve em 13 meses com R$ 7.402,68 — avalanche economiza R$ 1.701,84", () => {
  // Mês 1 (avalanche): juros A 30,00, B 800,00; mínimos 100 + 500; sobra 900 em B.
  // Saldos: A 1.930,00; B 10.800 − 500 − 900 = 9.400,00. Repetindo até zerar: 12 meses, Σ juros 5.700,84.
  const a = simularQuitacao(DIVIDAS, 150000, "avalanche");
  assert.equal(a.codigo, "ok");
  assert.equal(a.meses, 12);
  assert.equal(a.jurosCentavos, 570084);
  assert.equal(a.cronograma[0].saldos.A, 193000);
  assert.equal(a.cronograma[0].saldos.B, 940000);
  assert.equal(a.pagoCentavos, 1200000 + 570084, "tudo que entrou saiu: principal + juros");
  const b = simularQuitacao(DIVIDAS, 150000, "bolaDeNeve");
  assert.equal(b.meses, 13);
  assert.equal(b.jurosCentavos, 740268);
  assert.equal(b.cronograma[0].saldos.A, 193000 - 90000, "a sobra de 900 foi para A, a menor");
  const c = compararMetodos(DIVIDAS, 150000);
  assert.equal(c.economiaJurosCentavos, 170184);
  assert.equal(c.mesesDiferenca, 1);
  assert.equal(c.codigo, "avalanche_economiza");
  assert.equal(c.avalanche.cronograma.at(-1).pagoCentavos < 150000, true, "o último mês paga só o que falta");
});

test("quando a menor dívida também é a de maior juro os métodos empatam — por isso o cenário do teste anterior é outro", () => {
  const empate = compararMetodos([
    { id: "A", saldoCentavos: 200000, taxaMensalBp: 800, parcelaMinimaCentavos: 10000 },
    { id: "B", saldoCentavos: 1000000, taxaMensalBp: 150, parcelaMinimaCentavos: 50000 },
  ], 150000);
  assert.equal(empate.codigo, "empate");
  assert.equal(empate.economiaJurosCentavos, 0);
});

test("fronteiras da simulação: dívida já quitada dá 0 meses; orçamento menor que a soma dos mínimos devolve quanto falta; juros que engolem o orçamento não convergem", () => {
  assert.deepEqual(simularQuitacao([{ id: "A", saldoCentavos: 0, taxaMensalBp: 150, parcelaMinimaCentavos: 10000 }], 100000), { codigo: "ja_quitada", meses: 0, jurosCentavos: 0, pagoCentavos: 0, cronograma: [] });
  const r = simularQuitacao(DIVIDAS, 50000);
  assert.equal(r.codigo, "orcamento_insuficiente");
  assert.equal(r.faltamCentavos, 10000); // mínimos 600 − orçamento 500
  assert.equal(r.meses, null);
  // 10.000 a 8 % rende 800 de juros por mês = todo o orçamento: o saldo nunca cai
  const n = simularQuitacao([{ id: "B", saldoCentavos: 1000000, taxaMensalBp: 800, parcelaMinimaCentavos: 50000 }], 80000, "avalanche", { maxMeses: 50 });
  assert.equal(n.codigo, "nao_converge");
  assert.equal(n.cronograma.length, 50);
  // mínimo maior que o saldo não paga além do saldo
  const pequena = simularQuitacao([{ id: "A", saldoCentavos: 5000, taxaMensalBp: 0, parcelaMinimaCentavos: 10000 }], 10000);
  assert.equal(pequena.pagoCentavos, 5000);
  assert.equal(pequena.meses, 1);
  assert.throws(() => simularQuitacao(DIVIDAS, 150000, "aleatorio"), /metodo_invalido/);
  assert.throws(() => simularQuitacao([{ id: "A", saldoCentavos: 100, taxaMensalBp: -1, parcelaMinimaCentavos: 0 }], 100), /juros_negativos/);
});

test("quitar ou investir: compara com o CDI LÍQUIDO (13,65 % a.a. → 0,831 % a.m. após IR 22,5 %), e sem reserva o primeiro aviso é não zerar a reserva", () => {
  const rotativo = quitarOuInvestir(1200, IDX); // 12 % a.m.
  assert.equal(rotativo.rendimentoLiquidoMensalBp, 83); // 1,0720 % × 0,775 = 0,8308 % → 83 bp
  assert.equal(rotativo.rendimentoBrutoMensalBp, 107);
  assert.equal(rotativo.recomendacao, "quitar");
  assert.deepEqual(rotativo.avisos, ["rendimento_media_bcb_nao_o_seu"]);
  assert.equal(quitarOuInvestir(50, IDX).recomendacao, "investir"); // 0,5 % a.m. < 0,83 %
  assert.equal(quitarOuInvestir(85, IDX).recomendacao, "indiferente"); // dentro da margem de 5 bp
  assert.equal(quitarOuInvestir(1200, IDX, { reservaCompleta: false }).avisos[0], "nao_zere_a_reserva");
  assert.throws(() => quitarOuInvestir(-10, IDX), /juros_negativos/);
});

// ---------- metas ----------

test("aporte para meta com prazo: 12.000 em 12 m a 0,8 % → 956,76; a 0 % → 1.000,00; o que já rende e passa do alvo dá 0", () => {
  // PMT = 12000 × 0,008 / (1,008^12 − 1) = 96 / 0,100339 = 956,76
  assert.equal(aporteMensal({ alvoCentavos: 1200000, meses: 12, taxaMensalBp: 80 }), 95676);
  assert.equal(aporteMensal({ alvoCentavos: 1200000, meses: 12, taxaMensalBp: 0 }), 100000);
  assert.equal(aporteMensal({ alvoCentavos: 1200000, atualCentavos: 600000, meses: 12, taxaMensalBp: 0 }), 50000);
  assert.equal(aporteMensal({ alvoCentavos: 1200000, atualCentavos: 1200000, meses: 12, taxaMensalBp: 80 }), 0);
  assert.equal(aporteMensal({ alvoCentavos: 1200000, meses: 1, taxaMensalBp: 80 }), 1200000, "n = 1 é o alvo inteiro");
  assert.throws(() => aporteMensal({ alvoCentavos: 1200000, meses: 0 }), /prazo_invalido/);
  assert.throws(() => aporteMensal({ alvoCentavos: 1200000, meses: 12, taxaMensalBp: -5 }), /juros_negativos/);
});

test("meta em valor real: 50.000 de hoje em 24 m com 13,65 % nominal e IPCA 4,22 % usa i_real 0,7244 % a.m. e pede 1.914,99/mês", () => {
  // nominal a.m. 1,07198 %, IPCA a.m. 0,34504 %, real = 1,0107198/1,0034504 − 1 = 0,72444 %
  const real = taxaRealMensal(1365, 422);
  assert.ok(Math.abs(real.fracao - 0.0072444) < 0.0000005, String(real.fracao));
  assert.equal(real.bp, 72);
  const r = aporteMensalReal({ alvoCentavosHoje: 5000000, meses: 24, nominalAaBp: 1365, inflacaoAaBp: 422 });
  assert.equal(r.aporteCentavos, 191499);
  assert.ok(r.avisos.includes("valor_real_poder_de_compra_de_hoje"));
  // Inflação acima do rendimento: juro real negativo vira 0 com aviso, não aporte "negativo"
  const neg = aporteMensalReal({ alvoCentavosHoje: 1200000, meses: 12, nominalAaBp: 200, inflacaoAaBp: 1000 });
  assert.equal(neg.aporteCentavos, 100000);
  assert.ok(neg.avisos.includes("juro_real_negativo_tratado_como_zero"));
});

const CATS = [
  { id: "c-aluguel", nome: "Aluguel", tipo: "despesa", essencial: true },
  { id: "c-mercado", nome: "Mercado", tipo: "despesa", essencial: true },
  { id: "c-lazer", nome: "Lazer", tipo: "despesa", essencial: false },
  { id: "c-salario", nome: "Salário", tipo: "receita", essencial: false },
];
const L = (data, tipo, centavos, categoriaId, extra = {}) => ({ id: `${data}-${categoriaId}-${centavos}`, data, tipo, centavos, categoriaId, status: "efetivado", ...extra });

test("despesa essencial = média dos 3 últimos meses COMPLETOS das categorias essenciais; o mês corrente, o lazer, o previsto e a transferência ficam fora", () => {
  const ls = [
    L("2026-07-05", "despesa", 150000, "c-aluguel"), L("2026-07-20", "despesa", 60000, "c-mercado"), // jul 2.100
    L("2026-08-05", "despesa", 150000, "c-aluguel"), L("2026-08-20", "despesa", 90000, "c-mercado"), // ago 2.400
    L("2026-09-05", "despesa", 150000, "c-aluguel"), L("2026-09-20", "despesa", 30000, "c-mercado"), L("2026-09-21", "estorno", 3000, "c-mercado"), // set 1.770
    L("2026-09-10", "despesa", 500000, "c-lazer"), L("2026-09-11", "despesa", 99999, "c-mercado", { status: "previsto" }),
    L("2026-09-12", "transferencia", 100000, "c-mercado"),
    L("2026-10-05", "despesa", 900000, "c-aluguel"), // mês corrente não entra
  ];
  assert.equal(despesaEssencialMedia(ls, CATS, "2026-10"), 209000); // (2100 + 2400 + 1770)/3 = 2.090,00
  assert.equal(despesaEssencialMedia(ls, CATS, "2026-10", { meses: 1 }), 177000);
  assert.equal(despesaEssencialMedia([], CATS, "2026-10"), null);
  assert.equal(despesaEssencialMedia(ls, CATS.filter((c) => !c.essencial), "2026-10"), null);
});

test("reserva de emergência = meses × despesa essencial; cobertura sugerida é 3–6 (CLT) ou 6–12 (autônomo/MEI) com código `sugestao_nao_norma`", () => {
  assert.deepEqual(reservaEmergencia({ despesaEssencialMensalCentavos: 209000, mesesCobertura: 6, atualCentavos: 500000 }), { alvoCentavos: 1254000, faltaCentavos: 754000, mesesCobertos: 2 });
  assert.deepEqual(sugestaoCobertura("clt"), { minMeses: 3, maxMeses: 6, codigo: "sugestao_nao_norma" });
  assert.deepEqual(sugestaoCobertura("mei"), { minMeses: 6, maxMeses: 12, codigo: "sugestao_nao_norma" });
  assert.equal(sugestaoCobertura("autonomo").maxMeses, 12);
  assert.throws(() => sugestaoCobertura("estagiario"), /vinculo_invalido/);
  assert.throws(() => reservaEmergencia({ despesaEssencialMensalCentavos: 209000, mesesCobertura: 0 }), /prazo_invalido/);
});

test("independência financeira: 5.000/mês → R$ 1.500.000 (25×) com faixa 3,5–4 % em termos reais, código `regra_de_bolso_eua` e avisos de não-promessa", () => {
  const r = independenciaFinanceira({ despesaMensalCentavos: 500000, patrimonioCentavos: 30000000 });
  assert.equal(r.regra, "regra_de_bolso_eua");
  assert.equal(r.alvoCentavos, 150000000);
  assert.equal(r.faixa.taxa400Bp, 150000000);
  assert.equal(r.faixa.taxa350Bp, 171428571); // 60.000/0,035 = 1.714.285,714…
  assert.equal(r.progressoBp, 2000); // 300.000 / 1.500.000
  assert.ok(r.avisos.includes("estimativa_nao_promessa") && r.avisos.includes("termos_reais_nao_ajustar_pela_selic"));
});

test("várias metas: progresso em bp, atingida, prazo vencido e aporte mensal pelo prazo em meses-calendário", () => {
  const metas = [
    { id: "m1", nome: "Viagem", tipo: "objetivo", alvo: 1200000, prazo: "2027-10-01" }, // 12 meses a partir de out/26
    { id: "m2", nome: "Reserva", tipo: "reserva", alvo: 1000000 },
    { id: "m3", nome: "Atrasada", tipo: "sinking", alvo: 50000, prazo: "2026-09-30" },
    { id: "m4", nome: "Rende", tipo: "objetivo", alvo: 1200000, prazo: "2027-10-01", taxaBp: 1000 }, // 10 % a.a. → 0,797 % a.m.
  ];
  const [m1, m2, m3, m4] = progressoMetas(metas, { atualPorMeta: { m1: 0, m2: 1000000, m3: 10000, m4: 0 }, hoje: "2026-10-05" });
  assert.equal(m1.mesesRestantes, 12);
  assert.equal(m1.aporteMensalCentavos, 100000);
  assert.equal(m1.progressoBp, 0);
  assert.equal(m2.codigo, "atingida");
  assert.equal(m2.progressoBp, 10000);
  assert.equal(m2.aporteMensalCentavos, undefined);
  assert.equal(m3.codigo, "prazo_vencido");
  assert.equal(m3.faltaCentavos, 40000);
  assert.ok(m4.aporteMensalCentavos < 100000 && m4.aporteMensalCentavos > 95000, String(m4.aporteMensalCentavos)); // juro ajuda um pouco
});

// ---------- patrimônio ----------

const D = {
  contas: [
    { id: "cc", nome: "Corrente", tipo: "corrente", arquivada: false },
    { id: "inv", nome: "Corretora", tipo: "investimento", arquivada: false },
    { id: "velha", nome: "Encerrada", tipo: "corrente", arquivada: true },
  ],
  investimentos: [
    { id: "i1", contaId: "inv", produto: "cdb", aporteCentavos: 100000, saldoInformadoCentavos: 300000 },
    { id: "i2", contaId: "inv", produto: "cdb", aporteCentavos: 100000 },
  ],
  dividas: [{ id: "d1", saldoCentavos: 200000, taxaMensalBp: 150, parcelaMinimaCentavos: 10000 }],
};

test("patrimônio líquido = ativos − passivos; conta de investimento vale a soma dos investimentos (não soma o saldo de novo); conta arquivada e fatura em aberto entram certo", () => {
  const p = patrimonioLiquido(D, { saldosPorConta: { cc: 500000, inv: 999999, velha: 777777 }, faturasEmAberto: [{ cartaoId: "k", ym: "2026-10", centavos: 50000 }] });
  assert.equal(p.ativos, 900000); // 5.000 + (3.000 + 1.000)
  assert.equal(p.passivos, 250000); // 2.000 + 500
  assert.equal(p.liquido, 650000);
  assert.deepEqual(p.composicao.ativos, [{ tipo: "corrente", centavos: 500000, bp: 5556 }, { tipo: "investimento", centavos: 400000, bp: 4444 }]);
  assert.deepEqual(p.composicao.passivos, [{ tipo: "dividas", centavos: 200000 }, { tipo: "faturas", centavos: 50000 }]);
  // Investimento sem conta ainda é patrimônio
  const solto = patrimonioLiquido({ contas: [], investimentos: [{ id: "x", contaId: null, aporteCentavos: 12345 }] });
  assert.equal(solto.ativos, 12345);
  // Patrimônio negativo é número, não erro
  assert.equal(patrimonioLiquido({ contas: [], dividas: [{ saldoCentavos: 100 }] }).liquido, -100);
});

test("snapshot mensal tem o formato do schema, substitui o do mesmo mês e a variação é mês a mês (null no primeiro e quando a base é ≤ 0)", () => {
  const s = snapshotMensal(D, "2026-10", { saldosPorConta: { cc: 500000 } });
  assert.deepEqual(s, { ym: "2026-10", patrimonioCentavos: 700000, ativos: 900000, passivos: 200000 });
  assert.throws(() => snapshotMensal(D, "2026-1"), /ym_invalido/);
  const lista = registrarSnapshot([{ ym: "2026-09", patrimonioCentavos: 500000 }, { ym: "2026-10", patrimonioCentavos: 1 }], s);
  assert.deepEqual(lista.map((x) => x.ym), ["2026-09", "2026-10"]);
  assert.equal(lista[1].patrimonioCentavos, 700000, "um snapshot por mês: o novo substitui");
  const v = variacaoMensal([{ ym: "2026-10", patrimonioCentavos: 700000 }, { ym: "2026-08", patrimonioCentavos: -100 }, { ym: "2026-09", patrimonioCentavos: 500000 }]);
  assert.deepEqual(v.map((x) => [x.ym, x.variacaoCentavos, x.variacaoBp]), [["2026-08", null, null], ["2026-09", 500100, null], ["2026-10", 200000, 4000]]);
});
