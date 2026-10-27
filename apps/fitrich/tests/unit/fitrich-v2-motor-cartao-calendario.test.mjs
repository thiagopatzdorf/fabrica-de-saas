// Feriados offline e recorrências (v2). Casos conferidos à mão:
//   ANBIMA 2026: 01/01, 16/02 e 17/02 (Carnaval), 03/04 (Sexta Santa), 21/04, 01/05, 04/06 (Corpus Christi),
//                07/09, 12/10, 02/11, 15/11, 20/11, 25/12 (Páscoa 2026 = 05/04)
//   5º dia útil de fev/2026 → 2026-02-06 (1º/02 é domingo; 2,3,4,5,6)
//   mensal dia 31 a partir de 2026-01-31 → 2026-02-28, 2026-03-31, 2026-04-30
//   anual 29/02/2024 → 2025-02-28 → … → 2028-02-29
import assert from "node:assert/strict";
import { test } from "node:test";
import { pascoa as pascoaDoSite } from "../referencia/dias-uteis.mjs";
import { diaUtilAnterior, ehDiaUtil, enesimoDiaUtilDoMes, feriadosDoAno, pascoa, proximoDiaUtil, somarDiasUteis } from "../../app/js/v2/feriados.mjs";
import { confirmarOcorrencia, materializar, proximaOcorrencia, proximasOcorrencias } from "../../app/js/v2/recorrencia.mjs";

const contador = () => { let n = 0; return () => `id${++n}`; };

test("a Páscoa copiada do site não divergiu da original em nenhum ano de 1900 a 2200", () => {
  for (let ano = 1900; ano <= 2200; ano++) assert.equal(pascoa(ano), pascoaDoSite(ano), String(ano));
  assert.equal(pascoa(2026), "2026-04-05");
  assert.equal(pascoa(2024), "2024-03-31");
  assert.equal(pascoa(2038), "2038-04-25", "a Páscoa mais tardia possível");
});

test("feriados de 2026 batem com a lista ANBIMA; Consciência Negra só a partir de 2024; sem facultativos sobram 10", () => {
  assert.deepEqual(feriadosDoAno(2026).map((f) => f.data), [
    "2026-01-01", "2026-02-16", "2026-02-17", "2026-04-03", "2026-04-21", "2026-05-01", "2026-06-04",
    "2026-09-07", "2026-10-12", "2026-11-02", "2026-11-15", "2026-11-20", "2026-12-25",
  ]);
  assert.ok(feriadosDoAno(2026).every((f) => /^[a-z_]+$/.test(f.codigo)), "códigos, não frases");
  assert.ok(!feriadosDoAno(2023).some((f) => f.codigo === "consciencia_negra"));
  assert.ok(feriadosDoAno(2024).some((f) => f.data === "2024-11-20"));
  assert.equal(feriadosDoAno(2026, { facultativos: false }).length, 10);
  assert.throws(() => feriadosDoAno(1800), RangeError);
});

test("dia útil: domingo e feriado nunca; sábado só se pedido; feriado extra (municipal) tira o dia", () => {
  assert.ok(ehDiaUtil("2026-02-06"));
  assert.ok(!ehDiaUtil("2026-02-07"), "sábado");
  assert.ok(ehDiaUtil("2026-02-07", { sabadoUtil: true }));
  assert.ok(!ehDiaUtil("2026-02-08", { sabadoUtil: true }), "domingo nunca");
  assert.ok(!ehDiaUtil("2026-02-16"), "Carnaval");
  assert.ok(ehDiaUtil("2026-02-16", { facultativos: false }));
  assert.ok(!ehDiaUtil("2026-02-06", { feriadosExtras: ["2026-02-06"] }));
});

test("5º dia útil de fev/2026 é 06/02; janeiro/2026 começa em feriado e o 5º útil é 08/01; mês sem o enésimo devolve null", () => {
  assert.equal(enesimoDiaUtilDoMes("2026-02", 5), "2026-02-06");
  assert.equal(enesimoDiaUtilDoMes("2026-01", 5), "2026-01-08");
  assert.equal(enesimoDiaUtilDoMes("2026-02", 1), "2026-02-02");
  assert.equal(enesimoDiaUtilDoMes("2026-02", 25), null, "fevereiro/2026 tem 18 dias úteis");
  assert.throws(() => enesimoDiaUtilDoMes("2026-02", 0), RangeError);
});

test("somar dias úteis pula Sexta Santa e fim de semana; zero devolve a própria data; negativo volta", () => {
  assert.equal(somarDiasUteis("2026-04-02", 1), "2026-04-06");
  assert.equal(somarDiasUteis("2026-04-02", 0), "2026-04-02");
  assert.equal(somarDiasUteis("2026-04-06", -1), "2026-04-02");
  assert.equal(proximoDiaUtil("2026-04-03"), "2026-04-06");
  assert.equal(proximoDiaUtil("2026-04-02"), "2026-04-02", "útil fica onde está");
  assert.equal(diaUtilAnterior("2026-04-03"), "2026-04-02");
  assert.equal(somarDiasUteis("2026-12-24", 1), "2026-12-28", "Natal e fim de semana");
});

const mensal = (extra = {}) => ({ id: "r1", nome: "Aluguel", tipo: "despesa", centavos: 180000, categoriaId: "moradia", contaId: "conta1", freq: "mensal", intervalo: 1, diaDoMes: 31, ajuste: "ultimoDia", inicio: "2026-01-31", ativa: true, ...extra });

test("mensal dia 31 a partir da data ORIGINAL: 28/02, 31/03, 30/04 (encadear daria 28/03 para sempre)", () => {
  assert.deepEqual(proximasOcorrencias(mensal(), "2026-01-01", "2026-05-31"), ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
  assert.deepEqual(proximasOcorrencias(mensal({ inicio: "2028-01-31" }), "2028-02-01", "2028-02-29"), ["2028-02-29"], "bissexto");
  assert.deepEqual(proximasOcorrencias(mensal({ intervalo: 2 }), "2026-01-01", "2026-06-30"), ["2026-01-31", "2026-03-31", "2026-05-31"]);
  assert.deepEqual(proximasOcorrencias(mensal(), "2026-03-01", "2026-04-30"), ["2026-03-31", "2026-04-30"], "janela que começa depois do início");
});

test("fim é inclusivo, recorrência desativada não gera, e janela invertida devolve vazio", () => {
  const r = mensal({ diaDoMes: 5, inicio: "2026-01-05", fim: "2026-03-05" });
  assert.deepEqual(proximasOcorrencias(r, "2026-01-01", "2026-12-31"), ["2026-01-05", "2026-02-05", "2026-03-05"]);
  assert.deepEqual(proximasOcorrencias({ ...r, ativa: false }, "2026-01-01", "2026-12-31"), []);
  assert.deepEqual(proximasOcorrencias(r, "2026-12-31", "2026-01-01"), []);
  assert.equal(proximaOcorrencia(r, "2026-02-06"), "2026-03-05");
  assert.equal(proximaOcorrencia(r, "2026-03-06"), null, "acabou");
});

test("5º dia útil (diasUteis) e anual 29/02: 2025 vira 28/02 e 2028 volta a 29/02", () => {
  const util = mensal({ freq: "diasUteis", diaDoMes: 5, inicio: "2026-01-01" });
  assert.deepEqual(proximasOcorrencias(util, "2026-01-01", "2026-03-31"), ["2026-01-08", "2026-02-06", "2026-03-06"]);
  const anual = mensal({ freq: "anual", inicio: "2024-02-29" });
  assert.deepEqual(proximasOcorrencias(anual, "2024-01-01", "2028-12-31"), ["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
});

test("semanal num mês com 5 sextas gera 5; ajuste para dia útil move 1º de maio e sábado 10/10 (12/10 é feriado) para 13/10", () => {
  const sextas = mensal({ freq: "semanal", inicio: "2026-05-01" });
  assert.deepEqual(proximasOcorrencias(sextas, "2026-05-01", "2026-05-31"), ["2026-05-01", "2026-05-08", "2026-05-15", "2026-05-22", "2026-05-29"]);
  assert.equal(proximasOcorrencias({ ...sextas, ajuste: "proximoDiaUtil" }, "2026-05-01", "2026-05-31")[0], "2026-05-04");
  assert.deepEqual(proximasOcorrencias(mensal({ diaDoMes: 10, inicio: "2026-10-10", ajuste: "proximoDiaUtil" }), "2026-10-01", "2026-10-31"), ["2026-10-13"]);
  assert.deepEqual(proximasOcorrencias(mensal({ diaDoMes: 10, inicio: "2026-10-10", ajuste: "diaUtilAnterior" }), "2026-10-01", "2026-10-31"), ["2026-10-09"]);
  assert.throws(() => proximasOcorrencias(mensal({ freq: "quinzenal" }), "2026-01-01", "2026-12-31"), RangeError);
});

test("materializar gera previstos uma vez só; confirmar transforma o MESMO lançamento em efetivado, sem duplicar", () => {
  const novoId = contador();
  const r = mensal({ diaDoMes: 5, inicio: "2026-01-05" });
  const previstos = materializar(r, "2026-03-31", novoId);
  assert.equal(previstos.length, 3);
  assert.ok(previstos.every((l) => l.status === "previsto" && l.recorrenciaId === "r1" && l.contaId === "conta1" && l.centavos === 180000 && l.tipo === "despesa"));
  assert.deepEqual(previstos.map((l) => l.data), ["2026-01-05", "2026-02-05", "2026-03-05"]);
  assert.deepEqual(materializar(r, "2026-03-31", novoId, { existentes: previstos }), [], "de novo não duplica");
  assert.equal(materializar(r, "2026-04-30", novoId, { existentes: previstos }).length, 1, "só o mês novo");
  const confirmados = confirmarOcorrencia(previstos, previstos[0].id, { data: "2026-01-06", centavos: 180500, agora: "2026-01-06T12:00:00Z" });
  assert.equal(confirmados.length, 3);
  assert.equal(confirmados[0].status, "efetivado");
  assert.equal(confirmados[0].centavos, 180500);
  assert.equal(confirmados[0].data, "2026-01-06");
  assert.equal(previstos[0].status, "previsto", "entrada não mutada");
  assert.deepEqual(materializar(r, "2026-03-31", novoId, { existentes: confirmados }), [], "a confirmada ocupa a data de 05/01 mesmo movida para 06/01");
  assert.throws(() => confirmarOcorrencia(previstos, "nao-existe"), RangeError);
});

test("recorrência no cartão materializa com a fatura certa", () => {
  const cartao = { id: "cA", diaFechamento: 10, diaVencimento: 17, fechaInclusivo: false };
  const r = mensal({ diaDoMes: 12, inicio: "2026-01-12", contaId: undefined, cartaoId: "cA" });
  const ls = materializar(r, "2026-02-28", contador(), { cartao });
  assert.deepEqual(ls.map((l) => [l.cartaoId, l.fatura]), [["cA", "2026-02"], ["cA", "2026-03"]]);
  assert.ok(ls.every((l) => l.contaId === undefined));
});
