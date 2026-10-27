// Planejamento e patrimônio a longo prazo (js/v2/plano.mjs). Todo valor de referência foi calculado FORA do
// código sob teste (aritmética decimal exata em Python, com half-up em centavos) e conferido à mão onde
// cabe; o nome do teste descreve a FALHA que ele pega.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FAIXAS_RESERVA, MARCOS_CENTAVOS, PERFIS_RISCO, PRODUTOS_RENDA_FIXA, SEMENTE_PADRAO, TAXAS_REAIS_PADRAO, TETO_DESEJOS_BP,
  acumular, alvoIndependencia, cenarios, cinquentaTrintaVinteDe, compararQuitacao, compararRendaFixa, comparadorHibrido, despesaMedia,
  insumosDoPlano, marcos, mesesAteAlvo, monteCarlo, mulberry32, percentil, planoMensal, progressoAlvoBp, receitaMedia, reservaPlano, taxaRealLiquidaHoje,
} from "../../app/js/v2/plano.mjs";
import { simularQuitacao } from "../../app/js/v2/dividas.mjs";
import { SNAPSHOT_INDICES } from "../../app/js/v2/indices.mjs";
import { adicionar, definir, validar, vazio } from "../../app/js/v2/esquema.mjs";
import { readFileSync } from "node:fs";
import { paridade } from "../../app/js/v2/ui/i18n.mjs";
import { ABAS, anosDaTabela, derivadosDoPlano, tela } from "../../app/js/v2/ui/telas/plano.mjs";
import dicPlano from "../../app/js/v2/ui/telas/plano.i18n.mjs";
import { TELAS, carregarTela, porId } from "../../app/js/v2/ui/telas/indice.mjs";
import { dadosExemplo } from "../ui/dados-exemplo-patrimonio.mjs";

const HOJE = "2026-10-05";
const agora = () => "2026-10-05T12:00:00.000Z";

// ---------------------------------------------------------------- independência financeira
test("alvo de independência: dividir por 12 ou errar a taxa muda o patrimônio-alvo (5.000/mês: 4 % = 1,5 mi, 3,5 % = 1.714.285,71, 3 % = 2 mi)", () => {
  // despesa anual 6.000.000 centavos (R$ 60.000); ÷ 0,04 = 150.000.000; ÷ 0,035 = 171.428.571,43 → half-up; ÷ 0,03 = 200.000.000.
  assert.equal(alvoIndependencia({ despesaMensalCentavos: 500000, retiradaBp: 400 }), 150000000);
  assert.equal(alvoIndependencia({ despesaMensalCentavos: 500000, retiradaBp: 350 }), 171428571);
  assert.equal(alvoIndependencia({ despesaMensalCentavos: 500000, retiradaBp: 300 }), 200000000);
  assert.throws(() => alvoIndependencia({ despesaMensalCentavos: 500000, retiradaBp: 0 }), /retirada_invalida/);
  assert.throws(() => alvoIndependencia({ despesaMensalCentavos: 5000.5, retiradaBp: 400 }), /centavos_invalidos/);
});

test("taxa real de hoje: subtrair a inflação em vez de Fisher dá 7,80 em vez de 7,08 % (CDI 13,65 × 0,85 contra IPCA 4,22 → 708 bp)", () => {
  // (1 + 0,1365 × 0,85) / (1,0422) − 1 = 0,0708357… (Decimal de 60 dígitos); a subtração ingênua daria 0,116025 − 0,0422 = 7,4 %.
  const r = taxaRealLiquidaHoje(SNAPSHOT_INDICES);
  assert.equal(r.bp, 708);
  assert.ok(Math.abs(r.fracao - 0.0708357321) < 1e-9);
});

test("acumulação: juros do mês e aporte do fim do mês, arredondados por mês (valores de referência exatos)", () => {
  // 0 %: 12 × 1.000,00 = 12.000,00 exatos.
  assert.equal(acumular({ aporteMensalCentavos: 100000, anos: 1, taxaRealAaBp: 0 }).finalCentavos, 1200000);
  // 50.000,00 a 12 % a.a. por 1 ano sem aporte = 56.000,00 (a taxa mensal geométrica compõe de volta os 12 %).
  assert.equal(acumular({ patrimonioCentavos: 5000000, anos: 1, taxaRealAaBp: 1200 }).finalCentavos, 5600000);
  // 10.000,00 + 500,00/mês, 4 % real, 10 anos → 88.150,41; 0 + 1.000,00/mês, 4 %, 30 anos → 685.270,36.
  assert.equal(acumular({ patrimonioCentavos: 1000000, aporteMensalCentavos: 50000, anos: 10, taxaRealAaBp: 400 }).finalCentavos, 8815041);
  assert.equal(acumular({ aporteMensalCentavos: 100000, anos: 30, taxaRealAaBp: 400 }).finalCentavos, 68527036);
  const serie = acumular({ aporteMensalCentavos: 100000, anos: 3, taxaRealAaBp: 0 }).serie;
  assert.deepEqual(serie.map((s) => s.centavos), [0, 1200000, 2400000, 3600000]);
});

test("meses até o alvo: o contador tem de usar a mesma recorrência da acumulação e dizer null (não 0) quando não chega", () => {
  assert.equal(mesesAteAlvo({ aporteMensalCentavos: 100000, alvoCentavos: 12000000, taxaRealAaBp: 400 }), 102);
  assert.equal(mesesAteAlvo({ patrimonioCentavos: 10000000, alvoCentavos: 20000000, taxaRealAaBp: 400 }), 213);
  assert.equal(mesesAteAlvo({ patrimonioCentavos: 20000000, alvoCentavos: 20000000, taxaRealAaBp: 400 }), 0);
  assert.equal(mesesAteAlvo({ patrimonioCentavos: 100, aporteMensalCentavos: 0, alvoCentavos: 20000000, taxaRealAaBp: 0 }), null);
  // coerência: aos 8 anos (96 meses) o saldo ainda não passou do alvo, aos 9 (108 meses) já passou; o mês 102 está entre os dois.
  assert.ok(acumular({ aporteMensalCentavos: 100000, anos: 8, taxaRealAaBp: 400 }).finalCentavos < 12000000);
  assert.ok(acumular({ aporteMensalCentavos: 100000, anos: 9, taxaRealAaBp: 400 }).finalCentavos >= 12000000);
});

test("cenários: pessimista ≤ base ≤ otimista no patrimônio final e taxas fora de ordem são recusadas", () => {
  const c = cenarios({ aporteMensalCentavos: 100000, anos: 20, alvoCentavos: 30000000, taxas: TAXAS_REAIS_PADRAO });
  assert.deepEqual(c.map((x) => x.id), ["pessimista", "base", "otimista"]);
  assert.ok(c[0].finalCentavos < c[1].finalCentavos && c[1].finalCentavos < c[2].finalCentavos);
  assert.ok(c[0].mesesAteAlvo > c[1].mesesAteAlvo && c[1].mesesAteAlvo > c[2].mesesAteAlvo);
  assert.throws(() => cenarios({ anos: 5, alvoCentavos: 1, taxas: { pessimistaBp: 500, baseBp: 400, otimistaBp: 600 } }), /taxas_fora_de_ordem/);
});

// ---------------------------------------------------------------- PRNG e Monte Carlo
test("PRNG: a sequência da semente tem de bater com a referência independente (mulberry32 em inteiros de 32 bits)", () => {
  const a = mulberry32(1);
  assert.deepEqual([a(), a(), a()], [0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
  const b = mulberry32(SEMENTE_PADRAO);
  assert.deepEqual([b(), b(), b()], [0.5675064628012478, 0.2662253996822983, 0.14650599937886]);
});

test("percentil: posto mais próximo — para 1..10, p10 = 1, p50 = 5, p90 = 9 (e p100 = 10)", () => {
  const l = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.deepEqual([percentil(l, 0.1), percentil(l, 0.5), percentil(l, 0.9), percentil(l, 1)], [1, 5, 9, 10]);
  assert.throws(() => percentil([], 0.5), /lista_vazia/);
});

test("Monte Carlo: sem volatilidade o resultado é IDÊNTICO à acumulação determinística, em todos os anos", () => {
  const det = acumular({ patrimonioCentavos: 1000000, aporteMensalCentavos: 50000, anos: 10, taxaRealAaBp: 400 }).serie;
  const mc = monteCarlo({ patrimonioCentavos: 1000000, aporteMensalCentavos: 50000, anos: 10, taxaRealAaBp: 400, volatilidadeBp: 0, caminhos: 50 });
  mc.faixa.forEach((f, i) => { assert.equal(f.p10Centavos, det[i].centavos); assert.equal(f.p50Centavos, det[i].centavos); assert.equal(f.p90Centavos, det[i].centavos); });
});

test("Monte Carlo: mesma entrada e mesma semente dão o mesmo resultado; outra semente dá outro", () => {
  const e = { patrimonioCentavos: 1000000, aporteMensalCentavos: 50000, anos: 15, taxaRealAaBp: 400, volatilidadeBp: PERFIS_RISCO.moderado, alvoCentavos: 20000000 };
  assert.deepEqual(monteCarlo(e), monteCarlo(e));
  assert.notDeepEqual(monteCarlo(e).faixa, monteCarlo({ ...e, semente: 7 }).faixa);
});

test("Monte Carlo: a faixa abre com o tempo (p10 < p50 < p90), a mediana fica perto do determinístico e mais risco alarga a faixa", () => {
  const e = { aporteMensalCentavos: 100000, anos: 20, taxaRealAaBp: 400, alvoCentavos: 40000000 };
  const mod = monteCarlo({ ...e, volatilidadeBp: PERFIS_RISCO.moderado });
  const arr = monteCarlo({ ...e, volatilidadeBp: PERFIS_RISCO.arrojado });
  const f = mod.faixa[20], det = acumular({ ...e, anos: 20 }).finalCentavos;
  assert.ok(f.p10Centavos < f.p50Centavos && f.p50Centavos < f.p90Centavos);
  assert.ok(Math.abs(f.p50Centavos / det - 1) < 0.05, `mediana ${f.p50Centavos} longe do determinístico ${det}`);
  assert.ok(arr.faixa[20].p90Centavos - arr.faixa[20].p10Centavos > f.p90Centavos - f.p10Centavos);
  assert.equal(mod.faixa[0].p10Centavos, 0);
  assert.ok(mod.probAlvoBp >= 0 && mod.probAlvoBp <= 10000);
  // alvo muito acima de qualquer caminho → 0 %; alvo 1 centavo → 100 %.
  assert.equal(monteCarlo({ ...e, volatilidadeBp: 800, alvoCentavos: 10 ** 12 }).probAlvoBp, 0);
  assert.equal(monteCarlo({ ...e, volatilidadeBp: 800, alvoCentavos: 1 }).probAlvoBp, 10000);
});

test("Monte Carlo: entradas absurdas são recusadas em vez de rodar horas (caminhos, anos, volatilidade negativa)", () => {
  const e = { anos: 10, taxaRealAaBp: 400, volatilidadeBp: 800 };
  assert.throws(() => monteCarlo({ ...e, caminhos: 5 }), /caminhos_invalidos/);
  assert.throws(() => monteCarlo({ ...e, caminhos: 100000 }), /caminhos_invalidos/);
  assert.throws(() => monteCarlo({ ...e, anos: 61 }), /prazo_invalido/);
  assert.throws(() => monteCarlo({ ...e, volatilidadeBp: -1 }), /juros_negativos/);
});

// ---------------------------------------------------------------- marcos
test("marcos: 37.500,00 está a 50 % do caminho entre o marco de 25 mil e o de 50 mil (e nunca fala em sequência)", () => {
  const m = marcos(3750000);
  assert.deepEqual([m.anteriorCentavos, m.proximoCentavos, m.progressoBp, m.faltaCentavos], [2500000, 5000000, 5000, 1250000]);
  assert.deepEqual(m.alcancados, [1000000, 2500000]);
});

test("marcos: no valor exato do marco ele conta como alcançado; negativo vale zero; acima do último fecha em 100 %", () => {
  assert.equal(marcos(1000000).alcancados.length, 1);
  assert.equal(marcos(1000000).progressoBp, 0);
  assert.equal(marcos(999999).alcancados.length, 0);
  const neg = marcos(-500000);
  assert.deepEqual([neg.patrimonioCentavos, neg.proximoCentavos, neg.progressoBp], [0, 1000000, 0]);
  const topo = marcos(MARCOS_CENTAVOS[MARCOS_CENTAVOS.length - 1] + 1);
  assert.deepEqual([topo.proximoCentavos, topo.progressoBp, topo.faltaCentavos], [null, 10000, 0]);
  assert.equal(progressoAlvoBp(75000000, 150000000), 5000);
  assert.equal(progressoAlvoBp(300000000, 150000000), 10000);
  assert.equal(progressoAlvoBp(5, 0), null);
});

// ---------------------------------------------------------------- reserva
test("reserva: o alvo segue a estabilidade (3,5 / 4,5 / 7,5 / 9 meses de 3.000,00) e dependentes + renda única empurram até o teto, nunca além", () => {
  const base = { despesaMensalCentavos: 300000, atualCentavos: 0 };
  assert.equal(reservaPlano({ ...base, estabilidade: "estavel" }).alvoCentavos, 1050000);
  assert.equal(reservaPlano({ ...base, estabilidade: "clt" }).alvoCentavos, 1350000);
  assert.equal(reservaPlano({ ...base, estabilidade: "variavel" }).alvoCentavos, 2250000);
  assert.equal(reservaPlano({ ...base, estabilidade: "autonomo" }).alvoCentavos, 2700000);
  // CLT: 9 meios + 4 = 13, trava no teto de 12 meios = 6 meses = 1.800.000.
  assert.equal(reservaPlano({ ...base, estabilidade: "clt", dependentes: true, rendaUnica: true }).alvoCentavos, 1800000);
  // um fator só: 9 + 2 = 11 meios = 5,5 meses = 1.650.000.
  assert.equal(reservaPlano({ ...base, estabilidade: "clt", dependentes: true }).alvoCentavos, 1650000);
  assert.throws(() => reservaPlano({ ...base, estabilidade: "rei" }), /estabilidade_invalida/);
  for (const f of Object.values(FAIXAS_RESERVA)) assert.ok(f.minMeios <= f.maxMeios);
});

test("reserva: cobertura é arredondada para BAIXO (1,5 mês, não 2) e o código distingue abaixo da faixa, na faixa e completa", () => {
  const r = reservaPlano({ despesaMensalCentavos: 300000, atualCentavos: 500000, estabilidade: "clt" });
  assert.equal(r.coberturaMeios, 3); // 1,5 mês
  assert.equal(r.codigo, "abaixo_da_faixa");
  assert.equal(r.faltaCentavos, 850000);
  assert.equal(r.progressoBp, 3704); // 500.000 / 1.350.000 = 37,037 %
  assert.equal(reservaPlano({ despesaMensalCentavos: 300000, atualCentavos: 900000, estabilidade: "clt" }).codigo, "na_faixa");
  assert.equal(reservaPlano({ despesaMensalCentavos: 300000, atualCentavos: 1350000, estabilidade: "clt" }).codigo, "completa");
  assert.equal(reservaPlano({ despesaMensalCentavos: 0, atualCentavos: 10, estabilidade: "clt" }).coberturaMeios, null);
});

function base() {
  let d = vazio({ agora });
  d = adicionar(d, "contas", { id: "c1", nome: "Conta", tipo: "corrente", moeda: "BRL", saldoInicialCentavos: 0, dataSaldoInicial: "2026-01-01", arquivada: false }, { agora });
  const lanc = (id, data, tipo, centavos, categoriaId) => { d = adicionar(d, "lancamentos", { id, data, tipo, centavos, categoriaId, contaId: "c1", moeda: "BRL", status: "efetivado" }, { agora }); };
  // jul, ago, set/2026 (os 3 meses completos antes de out): receita 5.000, necessidades 2.000/2.200/2.400, lazer 500.
  for (const [ym, nec] of [["2026-07", 200000], ["2026-08", 220000], ["2026-09", 240000]]) {
    lanc(`r${ym}`, `${ym}-05`, "receita", 500000, "cat-salario");
    lanc(`n${ym}`, `${ym}-10`, "despesa", nec, "cat-moradia");
    lanc(`l${ym}`, `${ym}-15`, "despesa", 50000, "cat-lazer");
  }
  return d;
}

test("médias: o mês corrente (incompleto) fica de fora e a média é de meses COMPLETOS (necessidades 2.200,00; receita 5.000,00)", () => {
  const d = base();
  const d2 = adicionar(d, "lancamentos", { id: "out", data: "2026-10-02", tipo: "despesa", centavos: 999999, categoriaId: "cat-moradia", contaId: "c1", moeda: "BRL", status: "efetivado" }, { agora });
  assert.equal(despesaMedia(d2.lancamentos, "2026-10", { categoriaIds: ["cat-moradia"] }), 220000);
  assert.equal(despesaMedia(d2.lancamentos, "2026-10"), 270000);
  assert.equal(receitaMedia(d2.lancamentos, "2026-10"), 500000);
  assert.equal(despesaMedia([], "2026-10"), null);
});

// ---------------------------------------------------------------- plano mensal
const soma = (p) => p.linhas.reduce((s, l) => s + l.centavos, 0);

test("plano mensal: com necessidades de 40 % o lazer trava no teto de 30 % e o resto vai para investimento, somando a renda exata", () => {
  const p = planoMensal({ rendaCentavos: 500000, necessidadesCentavos: 200000 });
  // resto 300.000; 3/5 = 180.000 mas o teto é 30 % = 150.000 → investimento 150.000.
  const por = Object.fromEntries(p.linhas.map((l) => [l.id, l.centavos]));
  assert.deepEqual([por.necessidades, por.desejos, por.investimento, por.colchao, por.reserva], [200000, 150000, 150000, 0, 0]);
  assert.equal(soma(p), 500000);
  assert.equal(TETO_DESEJOS_BP, 3000);
});

test("plano mensal: com necessidades em 50 % o plano reproduz o ponto de partida 50/30/20 exatamente", () => {
  const p = planoMensal({ rendaCentavos: 500000, necessidadesCentavos: 250000 });
  const por = Object.fromEntries(p.linhas.map((l) => [l.id, l.centavos]));
  assert.deepEqual([por.necessidades, por.desejos, por.investimento], [250000, 150000, 100000]);
  assert.deepEqual(cinquentaTrintaVinteDe(500000), { necessidadesCentavos: 250000, desejosCentavos: 150000, futuroCentavos: 100000 });
  assert.equal(p.avisos.length, 0);
});

test("plano mensal: sem histórico usa 50 % de necessidades e avisa, em vez de inventar um gasto", () => {
  const p = planoMensal({ rendaCentavos: 300001 });
  assert.ok(p.avisos.includes("sem_historico_usando_50"));
  assert.equal(p.linhas[0].centavos, 150001); // 150.000,5 → half-up
  assert.equal(soma(p), 300001);
});

test("plano mensal: a cascata do futuro vai colchão → dívida cara → reserva → metas → investimento, cada um limitado ao que falta", () => {
  const p = planoMensal({
    rendaCentavos: 500000, necessidadesCentavos: 300000, minimosDividaCentavos: 30000, colchaoFaltaCentavos: 20000, reservaFaltaCentavos: 60000,
    dividasCaras: [{ id: "d1", nome: "Cartão", saldoCentavos: 100000 }], metas: [{ id: "m1", nome: "Viagem", aporteCentavos: 10000 }],
  });
  // resto 200.000; lazer 3/5 = 120.000 (< teto 150.000); sobra 80.000 − mínimos 30.000 = 50.000 para o futuro.
  const por = Object.fromEntries(p.linhas.map((l) => [l.id, l.centavos]));
  assert.deepEqual([por.desejos, por.minimos_divida, por.colchao, por["divida:d1"], por.reserva, por["meta:m1"], por.investimento], [120000, 30000, 20000, 30000, 0, 0, 0]);
  assert.equal(soma(p), 500000);
  assert.deepEqual(p.linhas.map((l) => l.motivo), ["necessidades", "minimos_divida", "desejos", "colchao", "divida_cara", "reserva", "meta", "investimento"]);
});

test("plano mensal: sobrando dinheiro, a reserva completa só DEPOIS da dívida cara e as metas vêm antes do investimento", () => {
  const p = planoMensal({
    rendaCentavos: 1000000, necessidadesCentavos: 400000, colchaoFaltaCentavos: 30000, reservaFaltaCentavos: 100000,
    dividasCaras: [{ id: "d1", nome: "Rotativo", saldoCentavos: 50000 }], metas: [{ id: "m1", nome: "Curso", aporteCentavos: 20000 }],
  });
  // resto 600.000; lazer 300.000 (teto); futuro 300.000: colchão 30.000, dívida 50.000, reserva 70.000 (100.000 − 30.000), meta 20.000, investimento 130.000.
  const por = Object.fromEntries(p.linhas.map((l) => [l.id, l.centavos]));
  assert.deepEqual([por.colchao, por["divida:d1"], por.reserva, por["meta:m1"], por.investimento], [30000, 50000, 70000, 20000, 130000]);
  assert.equal(soma(p), 1000000);
});

test("plano mensal: mínimo de dívida aperta o lazer só o necessário; se nem as obrigações cabem, devolve o déficit sem inventar distribuição", () => {
  const aperto = planoMensal({ rendaCentavos: 500000, necessidadesCentavos: 300000, minimosDividaCentavos: 190000 });
  // resto 200.000; lazer 120.000 deixaria 80.000 < mínimos 190.000 → lazer cai para 10.000 (2 % da renda); futuro 0.
  const por = Object.fromEntries(aperto.linhas.map((l) => [l.id, l.centavos]));
  assert.deepEqual([por.desejos, por.investimento], [10000, 0]);
  assert.ok(aperto.avisos.includes("desejos_abaixo_do_piso"));
  assert.equal(soma(aperto), 500000);
  const deficit = planoMensal({ rendaCentavos: 500000, necessidadesCentavos: 450000, minimosDividaCentavos: 100000 });
  assert.equal(deficit.codigo, "renda_nao_cobre");
  assert.equal(deficit.deficitCentavos, 50000);
  assert.deepEqual(deficit.linhas.map((l) => l.id), ["necessidades", "minimos_divida"]);
  assert.throws(() => planoMensal({ rendaCentavos: 0 }), /renda_invalida/);
});

test("plano mensal: percentuais em bp inteiros somam 10000 ± arredondamento e a soma em centavos é sempre a renda (propriedade, 200 casos)", () => {
  let semente = 12345;
  const alea = mulberry32(semente);
  for (let k = 0; k < 200; k++) {
    const renda = 100000 + Math.floor(alea() * 2000000), nec = Math.floor(alea() * renda * 0.8), min = Math.floor(alea() * renda * 0.2);
    const p = planoMensal({ rendaCentavos: renda, necessidadesCentavos: nec, minimosDividaCentavos: min, colchaoFaltaCentavos: Math.floor(alea() * 50000), reservaFaltaCentavos: Math.floor(alea() * 90000),
      dividasCaras: [{ id: "a", nome: "A", saldoCentavos: Math.floor(alea() * 80000) }], metas: [{ id: "m", nome: "M", aporteCentavos: Math.floor(alea() * 30000) }] });
    if (p.codigo === "ok") assert.equal(soma(p), renda, `caso ${k}`);
    assert.ok(p.linhas.every((l) => l.centavos >= 0), `caso ${k}: linha negativa`);
  }
});

test("insumos do plano: dívidas só entram como 'caras' quando o juro supera o rendimento líquido da renda fixa, e a de maior taxa vem primeiro", () => {
  let d = base();
  const nova = (id, saldoCentavos, taxaMensalBp, parcelaMinimaCentavos) => { d = adicionar(d, "dividas", { id, nome: id, saldoCentavos, taxaMensalBp, parcelaMinimaCentavos }, { agora }); };
  nova("consignado", 500000, 150, 20000); // 1,5 % a.m. > 0,83 % líquido → cara
  nova("rotativo", 100000, 1500, 15000); // 15 % a.m.
  nova("financiamento", 3000000, 60, 40000); // 0,6 % a.m. < 0,83 % → não é cara
  const i = insumosDoPlano(d, { hoje: HOJE, indices: SNAPSHOT_INDICES, reservaAtualCentavos: 100000, reservaAlvoCentavos: 1350000, despesaEssencialCentavos: 270000 });
  assert.deepEqual(i.dividasCaras.map((x) => x.id), ["rotativo", "consignado"]);
  assert.equal(i.minimosDividaCentavos, 75000);
  assert.equal(i.necessidadesCentavos, 220000);
  assert.equal(i.receitaMediaCentavos, 500000);
  assert.equal(i.reservaFaltaCentavos, 1250000);
  assert.equal(i.colchaoFaltaCentavos, 170000); // 1 mês de despesa essencial (270.000) − já tem 100.000
});

// ---------------------------------------------------------------- quitar dívida
const DIVIDAS = [
  { id: "cartao", saldoCentavos: 300000, taxaMensalBp: 1200, parcelaMinimaCentavos: 15000 },
  { id: "moto", saldoCentavos: 150000, taxaMensalBp: 300, parcelaMinimaCentavos: 8000 },
  { id: "amigo", saldoCentavos: 40000, taxaMensalBp: 100, parcelaMinimaCentavos: 4000 },
];

test("simulação com uma dívida: 1.000,00 a 2 % pagando 600,00 quita em 2 meses com 28,40 de juros (referência à mão)", () => {
  // mês 1: 1000 + 20,00 = 1020 − 600 = 420; mês 2: 420 + 8,40 = 428,40 − 428,40 = 0. Juros 28,40; pago 1.028,40.
  const r = simularQuitacao([{ id: "a", saldoCentavos: 100000, taxaMensalBp: 200, parcelaMinimaCentavos: 5000 }], 60000, "avalanche");
  assert.deepEqual([r.meses, r.jurosCentavos, r.pagoCentavos], [2, 2840, 102840]);
});

test("quitação: avalanche, bola de neve e híbrido batem com a referência independente (meses, juros, ordem) e a economia sai da diferença", () => {
  const c = compararQuitacao(DIVIDAS, 60000, { hoje: HOJE });
  assert.equal(c.codigo, "ok");
  assert.deepEqual([c.avalanche.meses, c.avalanche.jurosCentavos, c.avalanche.pagoCentavos], [14, 339905, 829905]);
  assert.deepEqual([c.bolaDeNeve.meses, c.bolaDeNeve.jurosCentavos, c.bolaDeNeve.pagoCentavos], [21, 741468, 1231468]);
  assert.deepEqual([c.hibrido.meses, c.hibrido.jurosCentavos, c.hibrido.pagoCentavos], [15, 398143, 888143]);
  assert.deepEqual(c.avalanche.ordem, { amigo: 11, cartao: 13, moto: 14 });
  assert.deepEqual(c.bolaDeNeve.ordem, { amigo: 2, moto: 5, cartao: 21 });
  assert.deepEqual(c.hibrido.ordem, { amigo: 2, cartao: 14, moto: 15 });
  assert.equal(c.bolaDeNeve.economiaVsMaiorCentavos, 0);
  assert.equal(c.avalanche.economiaVsMaiorCentavos, 741468 - 339905);
  assert.equal(c.hibrido.economiaVsMaiorCentavos, 741468 - 398143);
  // data de quitação: hoje em 2026-10 + 14 meses = 2227-12 → 2027-12.
  assert.equal(c.avalanche.quitaEm, "2027-12");
  assert.equal(c.bolaDeNeve.quitaEm, "2028-07");
  assert.equal(c.minimosCentavos, 27000);
});

test("quitação: o híbrido nunca paga mais juros que a bola de neve nem menos que a avalanche (ela é o piso de juros)", () => {
  const c = compararQuitacao(DIVIDAS, 60000, { hoje: HOJE });
  assert.ok(c.avalanche.jurosCentavos <= c.hibrido.jurosCentavos && c.hibrido.jurosCentavos <= c.bolaDeNeve.jurosCentavos);
});

test("híbrido: com a folga mensal zerada nenhuma dívida é 'vitória rápida' e ele escolhe como a avalanche; com folga grande escolhe como a bola de neve", () => {
  const cmp = comparadorHibrido(0);
  assert.ok(cmp({ saldo: 100, taxaMensalBp: 100 }, { saldo: 50, taxaMensalBp: 900 }) > 0, "maior juro primeiro");
  const cmpFolga = comparadorHibrido(1_000_000);
  assert.ok(cmpFolga({ saldo: 100, taxaMensalBp: 100 }, { saldo: 50, taxaMensalBp: 900 }) > 0, "ambas rápidas: menor saldo primeiro");
  assert.ok(cmpFolga({ saldo: 50, taxaMensalBp: 100 }, { saldo: 100, taxaMensalBp: 900 }) < 0);
  // rápida passa na frente da não rápida mesmo com juro menor: limite 3 × 10.000 = 30.000.
  const cmp10 = comparadorHibrido(10000);
  assert.ok(cmp10({ saldo: 20000, taxaMensalBp: 100 }, { saldo: 500000, taxaMensalBp: 1500 }) < 0);
});

test("quitação: orçamento abaixo dos mínimos e mínimo que não cobre o juro viram CÓDIGO (não exceção, não loop infinito)", () => {
  assert.equal(compararQuitacao(DIVIDAS, 20000, { hoje: HOJE }).codigo, "orcamento_insuficiente");
  const nc = compararQuitacao([{ id: "x", saldoCentavos: 1000000, taxaMensalBp: 1500, parcelaMinimaCentavos: 50000 }], 50000, { hoje: HOJE });
  assert.equal(nc.codigo, "nao_converge");
  assert.equal(compararQuitacao([], 10000, { hoje: HOJE }).codigo, "ja_quitada");
});

// ---------------------------------------------------------------- renda fixa
test("renda fixa: CDB 100 % do CDI, 10.000,00 por 365 dias → bruto 1.365,00, IR 17,5 % = 238,88 (half-up), líquido 1.126,12", () => {
  const r = compararRendaFixa({ principalCentavos: 1000000, dias: 365, indices: SNAPSHOT_INDICES, hoje: HOJE }).find((x) => x.id === "cdb");
  assert.deepEqual([r.brutoCentavos, r.irCentavos, r.iofCentavos, r.liquidoCentavos], [136500, 23888, 0, 112612]);
  assert.equal(r.liquidoAnualBp, 1126);
});

test("renda fixa: LCI/LCA a 90 % do CDI não paga IR, e o 'CDB equivalente' é o menor % do CDI que iguala o líquido (109,13 %)", () => {
  // O motor guarda a taxa efetiva em bp inteiro: 13,65 % × 0,9 = 12,285 % → 1229 bp (12,29 %) → bruto 1.229,00.
  const r = compararRendaFixa({ principalCentavos: 1000000, dias: 365, indices: SNAPSHOT_INDICES, hoje: HOJE }).find((x) => x.id === "lci_lca");
  assert.deepEqual([r.brutoCentavos, r.irCentavos, r.liquidoCentavos], [122900, 0, 122900]);
  // 109,12 % (1490,0 → 148.900 bruto, IR 26.058) dá líquido 122.842 < 122.900; 109,13 % dá 149.000 − 26.075 = 122.925.
  assert.equal(r.cdbEquivalenteBp, 10913);
});

test("renda fixa: acima de 720 dias o IR cai para 15 % e o prazo longo muda o líquido do CDB (800 dias → bruto 3.237,20, IR 485,58)", () => {
  const r = compararRendaFixa({ principalCentavos: 1000000, dias: 800, indices: SNAPSHOT_INDICES, hoje: HOJE });
  const cdb = r.find((x) => x.id === "cdb"), lci = r.find((x) => x.id === "lci_lca");
  assert.deepEqual([cdb.brutoCentavos, cdb.irCentavos, cdb.liquidoCentavos], [323720, 48558, 275162]);
  assert.deepEqual([lci.brutoCentavos, lci.liquidoCentavos, lci.liquidoAnualBp], [289248, 289248, 1229]);
});

test("renda fixa: resgate antes de 30 dias paga IOF sobre o rendimento (o comparador não pode ignorar o prazo curto)", () => {
  const r = compararRendaFixa({ principalCentavos: 1000000, dias: 10, indices: SNAPSHOT_INDICES, hoje: HOJE }).find((x) => x.id === "cdb");
  assert.ok(r.iofCentavos > 0 && r.irCentavos > 0);
  assert.equal(r.liquidoCentavos, r.brutoCentavos - r.iofCentavos - r.irCentavos);
});

test("renda fixa: toda linha avisa que é estimativa e entradas inválidas são recusadas", () => {
  const rows = compararRendaFixa({ principalCentavos: 1000000, dias: 365, indices: SNAPSHOT_INDICES, hoje: HOJE });
  assert.equal(rows.length, PRODUTOS_RENDA_FIXA.length);
  assert.ok(rows.every((r) => r.avisos.includes("estimativa_nao_promessa")));
  assert.throws(() => compararRendaFixa({ principalCentavos: 0, dias: 365, indices: SNAPSHOT_INDICES, hoje: HOJE }), /centavos_invalidos/);
  assert.throws(() => compararRendaFixa({ principalCentavos: 100, dias: 0, indices: SNAPSHOT_INDICES, hoje: HOJE }), /dias_invalidos/);
});

// ---------------------------------------------------------------- esquema
test("esquema: perfil.plano é opcional, aceita valores válidos e recusa forma e faixa inválidas com códigos próprios", () => {
  let d = vazio({ agora });
  assert.equal(validar(d).ok, true);
  const com = (plano) => ({ ...d, perfil: { ...d.perfil, plano } });
  assert.equal(validar(com({ rendaCentavos: 500000, despesaDesejadaCentavos: 400000, aporteMensalCentavos: 100000, anos: 25, retiradaBp: 350, estabilidade: "clt", risco: "moderado", dependentes: true, rendaUnica: false, taxasReaisBp: { pessimistaBp: 200, baseBp: 400, otimistaBp: 600 } })).ok, true);
  const codigos = (plano) => validar(com(plano)).erros.map((e) => e.codigo);
  assert.deepEqual(codigos({ rendaCentavos: 50.5 }), ["plano.valor_invalido"]);
  assert.deepEqual(codigos({ anos: 0 }), ["plano.anos_invalido"]);
  assert.deepEqual(codigos({ retiradaBp: 50 }), ["plano.retirada_invalida"]);
  assert.deepEqual(codigos({ estabilidade: "rei" }), ["plano.estabilidade_invalida"]);
  assert.deepEqual(codigos({ taxasReaisBp: { pessimistaBp: 600, baseBp: 400, otimistaBp: 500 } }), ["plano.taxas_fora_de_ordem"]);
  assert.deepEqual(codigos({ taxasReaisBp: { pessimistaBp: 1.5, baseBp: 4, otimistaBp: 5 } }), ["plano.taxas_invalidas"]);
  assert.deepEqual(codigos([]), ["plano.invalido"]);
  // e a escrita pelo caminho do app (definir no perfil) preserva o resto do perfil.
  const salvo = definir(d, "perfil", { plano: { anos: 30 } }, { agora });
  assert.equal(salvo.perfil.idioma, "pt-BR");
  assert.equal(validar(salvo).ok, true);
});

// ---------------------------------------------------------------- tela (lógica de apresentação e contrato)
test("tela Plano: dicionários pt-BR e en com as mesmas chaves e placeholders, todas com o prefixo plano., sem palavra de culpa", () => {
  assert.deepEqual(paridade(dicPlano), []);
  assert.ok(Object.keys(dicPlano["pt-BR"]).every((k) => k.startsWith("plano.")));
  const proibidas = /estourou|falhou|perdeu a sequ|sequência|sequencia|streak|atrasad|culpa|you broke|failed|fracasso/i;
  for (const [idioma, d] of Object.entries(dicPlano)) for (const [k, v] of Object.entries(d)) assert.ok(!proibidas.test(v), `${idioma} ${k}: "${v}"`);
});

test("tela Plano: está registrada, carrega pelo contrato e usa só chaves que existem no dicionário", async () => {
  assert.equal(porId("plano")?.grupo, "mais");
  const c = await carregarTela(porId("plano"));
  assert.equal(c.ok, true);
  assert.equal(c.tela, tela);
  assert.deepEqual(ABAS, ["mensal", "reserva", "dividas", "independencia", "rendafixa"]);
  const src = readFileSync(new URL("../../app/js/v2/ui/telas/plano.mjs", import.meta.url), "utf8");
  const usadas = new Set([...src.matchAll(/\bt\(\s*[`"'](plano\.[\w.]+?)(?:[`"']|\$\{)/g)].map((m) => m[1]));
  const dic = dicPlano["pt-BR"];
  for (const k of [...usadas].filter((x) => !x.endsWith("."))) assert.ok(Object.keys(dic).some((d) => d === k || d.startsWith(`${k}.`)), `chave usada sem texto: ${k}`);
  // chaves dinâmicas: aba.<id>, linha.<motivo>, porque.<motivo>, res.est.*, res.estado.*, res.nota.*, div.metodo.*, div.desc.*, div.codigo.*, ind.cen.*, rf.produto.*, rf.ressalva.*
  for (const id of ABAS) assert.ok(dic[`plano.aba.${id}`]);
  for (const m of ["necessidades", "minimos_divida", "desejos", "colchao", "divida_cara", "reserva", "meta", "investimento"]) assert.ok(dic[`plano.linha.${m}`] && dic[`plano.porque.${m}`], m);
  for (const e of ["estavel", "clt", "variavel", "autonomo"]) assert.ok(dic[`plano.res.est.${e}`] && dic[`plano.res.nota.${e}`], e);
  for (const e of ["completa", "na_faixa", "abaixo_da_faixa"]) assert.ok(dic[`plano.res.estado.${e}`], e);
  for (const m of ["avalanche", "bolaDeNeve", "hibrido"]) assert.ok(dic[`plano.div.metodo.${m}`] && dic[`plano.div.desc.${m}`], m);
  for (const e of ["orcamento_insuficiente", "nao_converge", "ja_quitada"]) assert.ok(dic[`plano.div.codigo.${e}`], e);
  for (const p of PRODUTOS_RENDA_FIXA) assert.ok(dic[`plano.rf.produto.${p.id}`], p.id);
  for (const k of ["fgc", "lci", "tesouro", "ipca", "taxas", "ir", "naoRecomenda"]) assert.ok(dic[`plano.rf.ressalva.${k}`], k);
  assert.ok(TELAS.length >= 12);
});

test("tela Plano: módulo sem innerHTML, sem atributo style, sem rede e sem importar outra tela (CSP e contrato)", () => {
  for (const arq of ["telas/plano.mjs", "graficos-plano.mjs"]) {
    const src = readFileSync(new URL(`../../app/js/v2/ui/${arq}`, import.meta.url), "utf8");
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(src), `${arq} usa innerHTML`);
    assert.ok(!/\bstyle:\s*["'`]/.test(src) && !/setAttribute\(\s*["']style/.test(src), `${arq} usa atributo style`);
    assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|sendBeacon|Math\.random/.test(src), `${arq} fala com a rede ou usa aleatório`);
    assert.ok(!/from "\.\/(patrimonio|metas|dividas|shape|checkin|financas|cartoes)\.mjs"/.test(src), `${arq} importa outra tela`);
  }
  const plano = readFileSync(new URL("../../app/js/v2/plano.mjs", import.meta.url), "utf8");
  assert.ok(!/Math\.random|Date\.now|new Date\(|fetch\(/.test(plano), "o motor do plano tem de ser determinístico e offline");
});

test("tela Plano: com os dados de exemplo, os derivados ligam renda, necessidades e reserva e o plano mensal soma a renda", () => {
  const d = dadosExemplo();
  const dv = derivadosDoPlano(d, { hoje: HOJE, indices: SNAPSHOT_INDICES });
  assert.equal(dv.renda, 650000);
  assert.equal(dv.rendaFonte, "media");
  assert.ok(dv.mensal && dv.mensal.codigo === "ok");
  assert.equal(dv.mensal.totalCentavos, dv.renda);
  assert.ok(dv.reserva && dv.reserva.alvoCentavos > 0);
  assert.equal(dv.estabilidade, "clt");
  assert.equal(dv.anos, 20);
  // a renda digitada vence a média, e some quando apagada
  const d2 = definir(d, "perfil", { plano: { rendaCentavos: 800000, estabilidade: "autonomo" } }, { agora });
  const dv2 = derivadosDoPlano(d2, { hoje: HOJE, indices: SNAPSHOT_INDICES });
  assert.deepEqual([dv2.renda, dv2.rendaFonte, dv2.estabilidade], [800000, "digitada", "autonomo"]);
  assert.equal(dv2.mensal.totalCentavos, 800000);
  assert.ok(dv2.reserva.alvoCentavos > dv.reserva.alvoCentavos);
});

test("tela Plano: a tabela da faixa mostra anos legíveis (1 em 1 até 10, 5 em 5 até 30, 10 em 10 depois) e sempre o último", () => {
  assert.deepEqual(anosDaTabela(5), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(anosDaTabela(20), [0, 5, 10, 15, 20]);
  assert.deepEqual(anosDaTabela(27), [0, 5, 10, 15, 20, 25, 27]);
  assert.deepEqual(anosDaTabela(60), [0, 10, 20, 30, 40, 50, 60]);
});
