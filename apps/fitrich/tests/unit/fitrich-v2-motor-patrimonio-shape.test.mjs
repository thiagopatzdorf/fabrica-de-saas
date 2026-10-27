// Motor v2 (área 3): cruzamentos shape × finanças. Devolvem números e códigos; nunca frase, nunca
// streak, nunca comentário sobre corpo/comida.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { academiaOciosa, custoPorTreino, deliveryVsPeso, metaDupla, pearson, saudeComoPercentualDaReceita, semanasNaMeta } from "../../app/js/v2/shape-financas.mjs";

const T = (data) => ({ id: data, data, tipo: "Musculação", minutos: 50, esforco: 3 });
const L = (data, tipo, centavos, categoriaId, extra = {}) => ({ id: `${data}-${categoriaId}-${centavos}`, data, tipo, centavos, categoriaId, status: "efetivado", ...extra });

test("academia ociosa: 120,00 com 2 treinos no mês = 60,00 por treino; passou do limite e 14 dias sem treino viram códigos, não frases", () => {
  const treinos = [T("2026-10-01"), T("2026-10-03"), T("2026-09-28")];
  const r = academiaOciosa({ mensalidadeCentavos: 12000, treinos, hoje: "2026-10-17", limiteCustoPorTreinoCentavos: 5000 });
  assert.equal(r.treinosNoMes, 2);
  assert.equal(r.custoPorTreinoCentavos, 6000);
  assert.equal(r.diasSemTreino, 14); // 03/10 → 17/10
  assert.deepEqual(r.alertas, ["custo_por_treino_acima_do_limite", "sem_treino_ha_dias"]);
  for (const a of r.alertas) assert.match(a, /^[a-z_0-9]+$/, "código, não frase");
  // 13 dias ainda não alerta; sem limite não alerta custo
  assert.deepEqual(academiaOciosa({ mensalidadeCentavos: 12000, treinos, hoje: "2026-10-16" }).alertas, []);
  // Nenhum treino no mês, dia 15 em diante, com plano ativo
  const vazio = academiaOciosa({ mensalidadeCentavos: 12000, treinos: [T("2026-09-28")], hoje: "2026-10-15" });
  assert.equal(vazio.custoPorTreinoCentavos, null, "sem treino não existe custo por treino, não é infinito nem zero");
  assert.deepEqual(vazio.alertas, ["nenhum_treino_no_mes", "sem_treino_ha_dias"]);
  // Plano cancelado: nada a alertar
  assert.deepEqual(academiaOciosa({ mensalidadeCentavos: 12000, treinos: [], hoje: "2026-10-20", planoAtivo: false }).alertas, []);
  // Nunca treinou: diasSemTreino null, mas o alerta de dias sem treino vale
  assert.equal(academiaOciosa({ mensalidadeCentavos: 12000, treinos: [], hoje: "2026-10-05" }).diasSemTreino, null);
  // Treino futuro (agendado) não conta
  assert.equal(academiaOciosa({ mensalidadeCentavos: 12000, treinos: [T("2026-10-30")], hoje: "2026-10-05" }).treinosNoMes, 0);
});

test("saúde como % da receita usa só as categorias escolhidas e ignora transferência; sem receita é null", () => {
  const ls = [L("2026-10-05", "receita", 500000, "c-sal"), L("2026-10-06", "despesa", 12000, "c-acad"), L("2026-10-07", "despesa", 8000, "c-plano"), L("2026-10-08", "despesa", 90000, "c-mercado"), L("2026-10-09", "transferencia", 100000, "c-acad")];
  assert.deepEqual(saudeComoPercentualDaReceita({ lancamentos: ls, ym: "2026-10", categoriaIdsSaude: ["c-acad", "c-plano"] }), { ym: "2026-10", gastoCentavos: 20000, receitaCentavos: 500000, bp: 400 });
  assert.equal(saudeComoPercentualDaReceita({ lancamentos: ls, ym: "2026-11", categoriaIdsSaude: ["c-acad"] }).bp, null);
});

test("custo por treino soma a recorrência da academia que ainda não virou lançamento no mês, e não soma de novo quando já virou", () => {
  const rec = [{ id: "r1", nome: "Academia", tipo: "despesa", centavos: 12000, categoriaId: "c-acad", freq: "mensal", intervalo: 1, diaDoMes: 10, inicio: "2026-01-10", ativa: true }, { id: "r2", nome: "Antiga", tipo: "despesa", centavos: 99999, categoriaId: "c-acad", freq: "mensal", intervalo: 1, diaDoMes: 10, inicio: "2025-01-10", fim: "2025-12-31", ativa: true }];
  const treinos = [T("2026-10-01"), T("2026-10-03"), T("2026-10-05"), T("2026-09-30")];
  const semLanc = custoPorTreino({ lancamentos: [L("2026-10-02", "despesa", 3000, "c-suple")], recorrencias: rec, treinos, ym: "2026-10", categoriaIdsFitness: ["c-acad", "c-suple"] });
  assert.deepEqual(semLanc, { ym: "2026-10", gastoCentavos: 15000, treinos: 3, custoPorTreinoCentavos: 5000 });
  const comLanc = custoPorTreino({ lancamentos: [L("2026-10-10", "despesa", 12000, "c-acad", { recorrenciaId: "r1" })], recorrencias: rec, treinos, ym: "2026-10", categoriaIdsFitness: ["c-acad"] });
  assert.equal(comLanc.gastoCentavos, 12000, "a recorrência já lançada não dobra");
  assert.equal(custoPorTreino({ lancamentos: [], recorrencias: [], treinos, ym: "2026-10", categoriaIdsFitness: ["c-acad"] }).custoPorTreinoCentavos, null);
});

test("delivery × peso devolve as duas séries e a correlação descritiva, com código `descritivo_sem_causalidade` e sem texto", () => {
  const ls = [L("2026-05-10", "despesa", 10000, "c-deliv"), L("2026-06-10", "despesa", 20000, "c-deliv"), L("2026-07-10", "despesa", 30000, "c-deliv"), L("2026-08-10", "despesa", 40000, "c-deliv"), L("2026-08-11", "despesa", 99999, "c-mercado")];
  const pesos = [{ data: "2026-05-01", kg: 80 }, { data: "2026-05-15", kg: 81 }, { data: "2026-06-01", kg: 81.5 }, { data: "2026-07-01", kg: 82.5 }, { data: "2026-08-01", kg: 83.5 }];
  const r = deliveryVsPeso({ lancamentos: ls, pesos, categoriaIdsDelivery: ["c-deliv"], ymFinal: "2026-08", meses: 4 });
  assert.deepEqual(r.serie.map((m) => [m.ym, m.deliveryCentavos, m.pesoMedioKg]), [["2026-05", 10000, 80.5], ["2026-06", 20000, 81.5], ["2026-07", 30000, 82.5], ["2026-08", 40000, 83.5]]);
  assert.equal(r.correlacao, 1, "séries perfeitamente lineares");
  assert.equal(r.codigo, "descritivo_sem_causalidade");
  assert.equal(r.mesesComDado, 4);
  for (const v of Object.values(r)) if (typeof v === "string") assert.doesNotMatch(v, /\s/, "código, não frase: a UI decide se e como mostra");
  // Mês sem pesagem fica fora da correlação; com menos de 3 meses completos a correlação é null
  assert.equal(deliveryVsPeso({ lancamentos: ls, pesos: pesos.slice(0, 3), categoriaIdsDelivery: ["c-deliv"], ymFinal: "2026-08", meses: 4 }).correlacao, null);
  assert.equal(pearson([1, 2, 3], [5, 5, 5]), null, "variância zero não tem correlação");
  assert.equal(pearson([1, 2, 3, 4], [4, 3, 2, 1]), -1);
});

test("'X das últimas 8 semanas na meta' — nunca sequência: a semana que falhou não zera as outras", () => {
  // hoje 2026-10-05 (segunda). Semanas: 17/08, 24/08, 31/08, 07/09, 14/09, 21/09, 28/09, 05/10.
  const treinos = [
    "2026-08-17", "2026-08-19", "2026-08-21", // sem. 1: 3 ✓
    "2026-08-25", // sem. 2: 1 ✗
    "2026-08-31", "2026-09-02", "2026-09-04", "2026-09-05", // sem. 3: 4 ✓
    "2026-09-08", "2026-09-10", "2026-09-12", // sem. 4: 3 ✓
    // sem. 5: 0 ✗
    "2026-09-22", "2026-09-24", "2026-09-26", // sem. 6: 3 ✓
    "2026-09-28", "2026-09-30", "2026-10-02", // sem. 7: 3 ✓
    "2026-10-05", // sem. 8 (corrente): 1 ✗ ainda
  ].map(T);
  const r = semanasNaMeta({ treinos, hoje: "2026-10-05", metaTreinosSemana: 3 });
  assert.equal(r.naMeta, 5);
  assert.equal(r.de, 8);
  assert.equal(r.codigo, "x_de_n_semanas");
  assert.deepEqual(r.semanas.map((s) => s.naMeta), [true, false, true, true, false, true, true, false]);
  assert.equal(r.semanas[0].inicio, "2026-08-17");
  const fonte = readFileSync(new URL("../../app/js/v2/shape-financas.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(fonte, /sequenciaSemanas|streak\w*\s*\(|export function \w*(sequencia|streak)/i, "nenhuma função de sequência é importada nem exportada");
  assert.ok(!("sequencia" in r) && !("streak" in r), "a saída não tem campo de sequência");
});

test("meta dupla (20 % de poupança + 3 treinos/semana): poupança null sem receita (não é falha) e `ambasNaMeta` só com as duas", () => {
  const treinos = ["2026-10-05", "2026-10-07", "2026-10-09"].map(T);
  const ls = [L("2026-10-05", "receita", 500000, "c-sal"), L("2026-10-06", "despesa", 380000, "c-mercado"), L("2026-10-07", "transferencia", 999999, "c-x")];
  const r = metaDupla({ lancamentos: ls, treinos, hoje: "2026-10-09" });
  assert.deepEqual(r.poupanca, { ym: "2026-10", bp: 2400, metaBp: 2000, naMeta: true }); // (5000 − 3800)/5000 = 24 %
  assert.equal(r.treino.semanaAtualNaMeta, true);
  assert.equal(r.treino.naMeta, 1);
  assert.equal(r.ambasNaMeta, true);
  const semReceita = metaDupla({ lancamentos: [L("2026-10-06", "despesa", 100, "c-mercado")], treinos, hoje: "2026-10-09" });
  assert.equal(semReceita.poupanca.naMeta, null);
  assert.equal(semReceita.ambasNaMeta, false);
  assert.equal(metaDupla({ lancamentos: ls, treinos: treinos.slice(0, 2), hoje: "2026-10-09" }).ambasNaMeta, false);
});
