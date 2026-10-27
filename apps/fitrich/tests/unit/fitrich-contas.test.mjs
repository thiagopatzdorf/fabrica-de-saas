import assert from "node:assert/strict";
import { test } from "node:test";
import { dia, ehISO, hojeISO, mesDe, segundaDaSemana, somarDias, somarMeses, ultimoDiaDoMes } from "../../app/js/datas.mjs";
import {
  faixaImc, gorduraMarinha, imc, mediaMovel, projecaoMeta, sequenciaSemanas, tendencia, treinosPorSemana,
} from "../../app/js/shape.mjs";
import {
  custoPorTreino, formatarReais, lerReais, mesesParaMeta, orcamentoStatus, resumoMes, ritmoPoupanca, serieMensal,
} from "../../app/js/financas.mjs";
import { placar } from "../../app/js/placar.mjs";

const L = (data, tipo, centavos, categoria = tipo === "receita" ? "Salário" : "Mercado") => ({ id: 1, data, tipo, centavos, categoria, descricao: "" });
const T = (data) => ({ id: 1, data, tipo: "Musculação", minutos: 50, esforco: 3 });
const P = (data, kg) => ({ id: 1, data, kg });

test("data inexistente (31 de fevereiro) é recusada e a semana começa na segunda", () => {
  assert.ok(ehISO("2026-02-28") && !ehISO("2026-02-31") && !ehISO("2026-2-3") && !ehISO(20260228));
  assert.equal(segundaDaSemana("2026-10-04"), "2026-09-28"); // domingo
  assert.equal(segundaDaSemana("2026-10-05"), "2026-10-05"); // segunda
  assert.equal(somarMeses("2026-11", 3), "2027-02");
  assert.equal(somarMeses("2026-01", -1), "2025-12");
  assert.equal(ultimoDiaDoMes("2028-02"), "2028-02-29");
  assert.equal(somarDias("2026-12-31", 1), "2027-01-01");
  assert.equal(hojeISO(new Date(2026, 9, 5, 23, 59)), "2026-10-05");
});

test("lerReais entende o jeito brasileiro de escrever e recusa o que não é dinheiro", () => {
  assert.equal(lerReais("1.234,56"), 123456);
  assert.equal(lerReais("R$ 12"), 1200);
  assert.equal(lerReais("12,5"), 1250);
  assert.equal(lerReais("1234.56"), 123456);
  assert.equal(lerReais("1.234"), 123400, "ponto de milhar sem centavos");
  assert.equal(lerReais("0,10"), 10);
  for (const ruim of ["", "abc", "0", "-5", "12,345", "1,2,3", null, "1e5"]) assert.equal(lerReais(ruim), null, String(ruim));
});

test("somar 0,10 + 0,20 fecha em 30 centavos (inteiros) e o formato sai em reais", () => {
  const r = resumoMes([L("2026-10-01", "despesa", 10), L("2026-10-02", "despesa", 20)], "2026-10");
  assert.equal(r.despesas, 30);
  assert.equal(formatarReais(123456), "R$ 1.234,56");
  assert.equal(formatarReais(-5), "−R$ 0,05");
  assert.equal(formatarReais(99900, { sinal: true }), "+R$ 999,00");
});

test("resumo do mês: saldo, taxa de poupança e categorias em ordem; sem receita a taxa é null, não zero", () => {
  const ls = [L("2026-10-05", "receita", 500000), L("2026-10-06", "despesa", 120000, "Moradia"), L("2026-10-07", "despesa", 30000, "Mercado"), L("2026-09-30", "despesa", 99999, "Lazer")];
  const r = resumoMes(ls, "2026-10");
  assert.equal(r.saldo, 350000);
  assert.equal(r.taxaPoupanca, 70);
  assert.deepEqual(r.porCategoria.map((c) => c.categoria), ["Moradia", "Mercado"]);
  assert.equal(resumoMes([L("2026-10-06", "despesa", 100)], "2026-10").taxaPoupanca, null);
  assert.equal(resumoMes(ls, "2026-10").taxaPoupanca, 70);
});

test("orçamento: 79% ok, 80% atenção, 100% ainda não estourou, 101% estourou", () => {
  const gasta = (c) => [L("2026-10-02", "despesa", c, "Lazer")];
  const est = (c) => orcamentoStatus(gasta(c), "2026-10", { Lazer: 10000 })[0].estado;
  assert.equal(est(7900), "ok"); assert.equal(est(8000), "atencao"); assert.equal(est(10000), "atencao"); assert.equal(est(10100), "estourou");
  assert.equal(orcamentoStatus([], "2026-10", { Lazer: 10000 })[0].pct, 0);
});

test("série mensal traz os 6 meses terminando no atual, inclusive meses vazios", () => {
  const s = serieMensal([L("2026-08-10", "receita", 1000)], "2026-10", 6);
  assert.deepEqual(s.map((m) => m.ym), ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
  assert.equal(s[3].receitas, 1000); assert.equal(s[5].receitas, 0);
});

test("ritmo de poupança usa só meses fechados com receita, e meses para a meta vem desse ritmo", () => {
  const ls = [L("2026-07-05", "receita", 400000), L("2026-07-06", "despesa", 300000), L("2026-08-05", "receita", 400000), L("2026-08-06", "despesa", 200000), L("2026-10-02", "receita", 999999)];
  assert.equal(ritmoPoupanca(ls, "2026-10"), 150000);
  assert.equal(mesesParaMeta(1000000, 100000, 150000), 6);
  assert.equal(mesesParaMeta(1000000, 1000000, 150000), 0);
  assert.equal(mesesParaMeta(1000000, 0, -5), null);
  assert.equal(mesesParaMeta(null, 0, 100), null);
  assert.equal(ritmoPoupanca([], "2026-10"), null);
});

test("custo por treino cruza os dois lados: gasto de Saúde e fitness ÷ treinos do mês", () => {
  const ls = [L("2026-10-02", "despesa", 12000, "Saúde e fitness"), L("2026-10-03", "despesa", 5000, "Mercado")];
  assert.equal(custoPorTreino(ls, [T("2026-10-04"), T("2026-10-06"), T("2026-10-08"), T("2026-09-30")], "2026-10"), 4000);
  assert.equal(custoPorTreino(ls, [], "2026-10"), null);
  assert.equal(custoPorTreino([], [T("2026-10-04")], "2026-10"), null);
});

test("média móvel de 7 dias suaviza a pesagem isolada e não usa o futuro", () => {
  const pesos = [P("2026-10-01", 80), P("2026-10-02", 82), P("2026-10-03", 80), P("2026-10-12", 79)];
  const m = mediaMovel(pesos, 7);
  assert.equal(m[0].kg, 80); assert.equal(m[1].kg, 81); assert.equal(m[2].kg, 80.67);
  assert.equal(m[3].kg, 79, "a pesagem de 9 dias depois fica sozinha na janela");
});

test("tendência: exige 3 pesagens e 7 dias de intervalo; acha -0,5 kg/semana numa descida regular", () => {
  assert.equal(tendencia([P("2026-10-01", 80), P("2026-10-05", 79)], "2026-10-05"), null);
  assert.equal(tendencia([P("2026-10-01", 80), P("2026-10-02", 79.9), P("2026-10-04", 79.8)], "2026-10-05"), null, "só 3 dias");
  const desce = Array.from({ length: 5 }, (_, i) => P(somarDias("2026-09-10", i * 7), 80 - i * 0.5));
  const t = tendencia(desce, somarDias("2026-09-10", 28));
  assert.equal(t.kgPorSemana, -0.5);
  const sobe = Array.from({ length: 5 }, (_, i) => P(somarDias("2026-09-10", i * 7), 70 + i * 0.3));
  assert.equal(tendencia(sobe, somarDias("2026-09-10", 28)).kgPorSemana, 0.3);
});

test("projeção da meta: só no sentido certo, ceil em semanas, null para ritmo desprezível ou além de 3 anos", () => {
  assert.equal(projecaoMeta(80, 75, -0.5), 10);
  assert.equal(projecaoMeta(80, 75, 0.5), null, "indo para o lado contrário");
  assert.equal(projecaoMeta(80, 75, -0.04), null);
  assert.equal(projecaoMeta(80, 79.95, -0.5), 0, "já chegou");
  assert.equal(projecaoMeta(120, 60, -0.3), null, "200 semanas");
  assert.equal(projecaoMeta(70, 72, 0.5), 4);
});

test("IMC e gordura da Marinha batem com contas conferidas à mão", () => {
  assert.equal(imc(80, 180), 24.7);
  assert.equal(faixaImc(24.7), "dentro da faixa de referência");
  assert.equal(gorduraMarinha({ sexo: "m", alturaCm: 180, cinturaCm: 85, pescocoCm: 38 }), 16.1);
  assert.equal(gorduraMarinha({ sexo: "f", alturaCm: 165, cinturaCm: 75, pescocoCm: 32, quadrilCm: 98 }), 28.9);
  assert.equal(gorduraMarinha({ sexo: "m", alturaCm: 180, cinturaCm: 38, pescocoCm: 38 }), null, "cintura igual ao pescoço");
  assert.equal(gorduraMarinha({ sexo: "", alturaCm: 180, cinturaCm: 85, pescocoCm: 38 }), null);
  assert.equal(gorduraMarinha({ sexo: "f", alturaCm: 165, cinturaCm: 75, pescocoCm: 32 }), null, "mulher sem quadril");
});

test("sequência de semanas: a semana corrente que ainda não bateu a meta não quebra a sequência", () => {
  const sem = (seg, n) => Array.from({ length: n }, (_, i) => T(somarDias(seg, i)));
  const treinos = [...sem("2026-09-14", 3), ...sem("2026-09-21", 3), ...sem("2026-09-28", 3)];
  assert.equal(sequenciaSemanas(treinos, 3, "2026-10-05"), 3, "semana de 5/10 ainda vazia: soma as 3 anteriores");
  assert.equal(sequenciaSemanas([...treinos, ...sem("2026-10-05", 3)], 3, "2026-10-07"), 4);
  assert.equal(sequenciaSemanas([...sem("2026-09-14", 3), ...sem("2026-09-28", 3)], 3, "2026-10-05"), 1, "a semana de 21/9 vazia quebra");
  assert.equal(sequenciaSemanas([], 3, "2026-10-05"), 0);
  assert.deepEqual(treinosPorSemana(treinos, "2026-10-01", 3).map((s) => s.total), [3, 3, 3]);
});

test("placar Fitrich: fórmula à mostra, sem receita a poupança não entra, tudo cumprido dá 100", () => {
  const hoje = "2026-10-10", metas = { treinosSemana: 3, poupancaPct: 20 };
  const treinos = Array.from({ length: 12 }, (_, i) => T(somarDias(hoje, -i * 2)));
  const lanc = [L("2026-10-02", "receita", 500000), L("2026-10-03", "despesa", 100000)];
  const pesos = [P("2026-10-09", 80), P("2026-10-08", 80)];
  const cheio = placar({ treinos, lancamentos: lanc, pesos, metas, hoje });
  assert.equal(cheio.total, 100); assert.equal(cheio.partes.length, 3);
  const semReceita = placar({ treinos, lancamentos: [], pesos, metas, hoje });
  assert.ok(semReceita.semReceita && semReceita.partes.length === 2);
  assert.equal(semReceita.total, 100);
  assert.equal(placar({ treinos: [], lancamentos: [], pesos: [], metas, hoje }).total, 0);
  const gastouTudo = placar({ treinos: [], lancamentos: [L("2026-10-02", "receita", 100), L("2026-10-03", "despesa", 500)], pesos: [], metas, hoje });
  assert.equal(gastouTudo.partes.find((p) => p.nome === "Poupança").valor, 0, "poupança negativa não vira nota negativa");
  assert.equal(mesDe(hoje), "2026-10"); assert.ok(dia("2026-10-10") > dia("2026-10-09"));
});
