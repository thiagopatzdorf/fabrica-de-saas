// Motor v2 (área 3): investimentos, câmbio e tributos. Casos conferidos à mão no comentário.
import assert from "node:assert/strict";
import { test } from "node:test";
import { SNAPSHOT_INDICES, indicesVigentes } from "../../app/js/v2/indices.mjs";
import {
  IOF_REGRESSIVO_PCT, aliquotaIofPct, aliquotaIrBp, custodiaTesouro, rendimentoAteVencimento, rendimentoBrutoAnual, rendimentoPoupanca, taxaAnualDoInvestimento, taxaPoupancaMensal, tributosDoResgate,
} from "../../app/js/v2/investimentos.mjs";
import { lancamentoEmMoeda, paraBRL, reavaliarComTaxaReal, taxaDoSnapshot } from "../../app/js/v2/cambio.mjs";
import { IRPF_2026, dasMei, irpfMensal, lembreteCarneLeao, reducaoLei15270 } from "../../app/js/v2/tributos.mjs";
// Conformidade com a ferramenta já publicada (reais, não centavos): duas cópias da mesma regra
// têm que dar o mesmo número, senão uma delas está errada.
import { TABELAS_2026, calcular as salarioLiquido } from "../referencia/salario-liquido.mjs";

const IDX = indicesVigentes(SNAPSHOT_INDICES);

// ---------- investimentos ----------

test("IR regressivo muda exatamente nas fronteiras 180/181, 360/361 e 720/721 dias corridos", () => {
  assert.equal(aliquotaIrBp(0), 2250);
  assert.equal(aliquotaIrBp(180), 2250);
  assert.equal(aliquotaIrBp(181), 2000);
  assert.equal(aliquotaIrBp(360), 2000);
  assert.equal(aliquotaIrBp(361), 1750);
  assert.equal(aliquotaIrBp(720), 1750);
  assert.equal(aliquotaIrBp(721), 1500);
  assert.throws(() => aliquotaIrBp(-1), /dias_invalidos/);
});

test("IOF regressivo: 96 % no dia 1, 66 % no dia 10, 3 % no dia 29, zero do dia 30 em diante; dia 0 é inválido", () => {
  assert.equal(IOF_REGRESSIVO_PCT.length, 30);
  assert.equal(aliquotaIofPct(1), 96);
  assert.equal(aliquotaIofPct(10), 66);
  assert.equal(aliquotaIofPct(29), 3);
  assert.equal(aliquotaIofPct(30), 0);
  assert.equal(aliquotaIofPct(400), 0);
  assert.throws(() => aliquotaIofPct(0), /dias_invalidos/);
});

test("resgate no dia 10 com rendimento 50,00: IOF 33,00 primeiro, IR 22,5 % sobre os 17,00 restantes = 3,83, líquido 13,17", () => {
  // 50 × 66 % = 33,00; base IR 17,00 × 22,5 % = 3,825 → half-up 3,83 (em float 1700 × 0,225 daria 382,49999… → 3,82)
  assert.deepEqual(tributosDoResgate({ rendimentoCentavos: 5000, dias: 10 }), { iofCentavos: 3300, irCentavos: 383, liquidoCentavos: 1317, aliquotaIofPct: 66, aliquotaIrBp: 2250 });
  // LCI/LCA: isenta de IR, IOF continua (a carência não é codificada)
  assert.deepEqual(tributosDoResgate({ rendimentoCentavos: 5000, dias: 10, isentoIR: true }), { iofCentavos: 3300, irCentavos: 0, liquidoCentavos: 1700, aliquotaIofPct: 66, aliquotaIrBp: 0 });
  // Rendimento negativo ou zero não paga tributo
  assert.equal(tributosDoResgate({ rendimentoCentavos: -500, dias: 10 }).liquidoCentavos, -500);
  assert.equal(tributosDoResgate({ rendimentoCentavos: 0, dias: 400 }).irCentavos, 0);
});

test("CDB a 100 % do CDI por 365 dias sobre 10.000: bruto 1.365,00, IR 17,5 % = 238,875 → 238,88 half-up, líquido 1.126,12", () => {
  // O plano anota 238,87 / 1.126,13: esse valor só sai de 1365 × 0,175 em ponto flutuante
  // (238,87499…). Pela regra do próprio plano (half-up sobre o módulo) o exato 238,875 vira 238,88 —
  // a mesma regra que dá 3,83 no caso do IOF acima. Divergência relatada no PR.
  assert.equal(rendimentoBrutoAnual(1000000, 1365, 365), 136500);
  const inv = { id: "i", produto: "cdb", indexador: "cdi", percentualBp: 10000, isentoIR: false, aplicacao: "2025-10-02", vencimento: "2026-10-02", aporteCentavos: 1000000 };
  const r = rendimentoAteVencimento(inv, IDX);
  assert.equal(r.dias, 365);
  assert.equal(r.brutoCentavos, 136500);
  assert.equal(r.iofCentavos, 0);
  assert.equal(r.irCentavos, 23888);
  assert.equal(r.custodiaCentavos, 0);
  assert.equal(r.liquidoCentavos, 112612);
  assert.equal(r.taxaAnualBp, 1365);
  assert.ok(r.avisos.includes("sem_marcacao_a_mercado") && r.avisos.includes("indice_media_bcb_nao_o_seu"));
  // 110 % do CDI: 1,1 × 13,65 = 15,015 % → 1502 bp
  assert.equal(taxaAnualDoInvestimento({ indexador: "cdi", percentualBp: 11000 }, IDX).bp, 1502);
  // IPCA+ 6 %: (1,0422)(1,06) − 1 = 10,4732 % → 1047 bp
  assert.equal(taxaAnualDoInvestimento({ indexador: "ipca", taxaBp: 600 }, IDX).bp, 1047);
  assert.throws(() => taxaAnualDoInvestimento({ indexador: "ouro" }, IDX), /indexador_invalido/);
  assert.throws(() => rendimentoAteVencimento({ ...inv, vencimento: "2025-01-01" }, IDX), /vencimento_antes_da_aplicacao/);
});

test("sem vencimento a estimativa vai até `hoje` e avisa; LCI avisa carência não calculada; fundo avisa come-cotas; dia 0 não tributa", () => {
  const lci = rendimentoAteVencimento({ produto: "lci", indexador: "cdi", percentualBp: 9000, isentoIR: true, aplicacao: "2026-01-01", aporteCentavos: 1000000 }, IDX, { hoje: "2026-07-01" });
  assert.equal(lci.dias, 181);
  assert.equal(lci.irCentavos, 0);
  assert.ok(lci.avisos.includes("lci_lca_carencia_nao_calculada") && lci.avisos.includes("sem_vencimento_estimado_ate_hoje"));
  const fundo = rendimentoAteVencimento({ produto: "fundo", indexador: "cdi", aplicacao: "2026-01-01", aporteCentavos: 1000000 }, IDX, { hoje: "2026-01-01" });
  assert.equal(fundo.dias, 0);
  assert.equal(fundo.brutoCentavos, 0);
  assert.ok(fundo.avisos.includes("come_cotas_nao_calculado"));
});

test("poupança: com Selic 13,75 % > 8,5 % rende TR + 0,5 % (10.000 → 66,00 em 1 mês); com Selic 8 % rende TR + 70 % da Selic mensal (61,04)", () => {
  assert.deepEqual(taxaPoupancaMensal({ selicBp: 1375, trMensalBp: 16 }), { fracao: 0.0016 + 0.005, regra: "tr_mais_0_5" });
  assert.deepEqual(rendimentoPoupanca(1000000, 1, { selicBp: 1375, trMensalBp: 16 }), { brutoCentavos: 6600, liquidoCentavos: 6600, regra: "tr_mais_0_5", isentoIR: true });
  // 1,08^(1/12) − 1 = 0,64340 %; × 0,7 = 0,45038 %; + 0,16 % = 0,61038 % → 61,04
  assert.equal(rendimentoPoupanca(1000000, 1, { selicBp: 800, trMensalBp: 16 }).brutoCentavos, 6104);
  assert.equal(rendimentoPoupanca(1000000, 1, { selicBp: 850, trMensalBp: 16 }).regra, "tr_mais_70pct_selic", "8,5 % cravado NÃO passa de 8,5 %");
  // 12 meses capitalizados: 10.000 × (1,0066^12 − 1) = 821,39 em float contínuo; arredondando os juros
  // de cada mês (regra do plano) dá 821,41 — a diferença de 2 centavos é o arredondamento por período.
  assert.equal(rendimentoPoupanca(1000000, 12, { selicBp: 1375, trMensalBp: 16 }).brutoCentavos, 82141);
  assert.equal(rendimentoPoupanca(1000000, 0, { selicBp: 1375, trMensalBp: 16 }).brutoCentavos, 0);
});

test("custódia do Tesouro: 0,20 % a.a. pro rata; Tesouro Selic isento nos primeiros R$ 10 mil (10.000 → 0; 20.000 → 20,00/ano); prefixado paga sobre tudo", () => {
  assert.equal(custodiaTesouro(1000000, 365, { produto: "tesouro_selic" }), 0);
  assert.equal(custodiaTesouro(2000000, 365, { produto: "tesouro_selic" }), 2000);
  assert.equal(custodiaTesouro(1000000, 365, { produto: "tesouro_prefixado" }), 2000);
  assert.equal(custodiaTesouro(1000000, 182, { produto: "tesouro_prefixado" }), 997); // 20,00 × 182/365 = 9,97
  const td = rendimentoAteVencimento({ produto: "tesouro_selic", indexador: "selic", taxaBp: 5, aplicacao: "2025-10-02", vencimento: "2026-10-02", aporteCentavos: 2000000 }, IDX);
  assert.equal(td.custodiaCentavos, 2000);
  assert.equal(td.taxaAnualBp, 1380);
  assert.ok(td.avisos.includes("custodia_isencao_por_investidor"));
});

// ---------- câmbio ----------

test("USD 100,00 × PTAX 5,2238 → 52238 centavos; a taxa fica congelada no lançamento e `taxaEstimada` marca o que veio do snapshot", () => {
  assert.equal(paraBRL(10000, 52238), 52238);
  assert.equal(paraBRL(1, 52238), 5, "1 cent × 5,2238 = 5,2238 → 5");
  assert.equal(taxaDoSnapshot(IDX, "USD"), 52238);
  assert.equal(taxaDoSnapshot(IDX, "JPY"), null);
  const est = lancamentoEmMoeda({ moeda: "USD", centavosMoeda: 10000, indices: IDX });
  assert.equal(est.centavos, 52238);
  assert.equal(est.taxaEstimada, true);
  assert.deepEqual(est.avisos, ["iof_cambio_nao_calculado", "taxa_estimada_pela_ptax"]);
  const real = lancamentoEmMoeda({ moeda: "USD", centavosMoeda: 10000, taxaBp: 54000, indices: IDX });
  assert.equal(real.centavos, 54000);
  assert.equal(real.taxaEstimada, false);
  const corrigido = reavaliarComTaxaReal(est, 53000);
  assert.deepEqual([corrigido.centavos, corrigido.taxaEstimada, est.centavos], [53000, false, 52238], "reavaliar devolve cópia, não mexe no original");
  assert.throws(() => lancamentoEmMoeda({ moeda: "BTC", centavosMoeda: 1, indices: IDX }), /moeda_invalida/);
  assert.throws(() => lancamentoEmMoeda({ moeda: "USD", centavosMoeda: 1, indices: { ptax: {} } }), /sem_cotacao/);
  assert.throws(() => paraBRL(100.5, 52238), /centavos_invalidos/);
});

// ---------- tributos ----------

test("IRPF 2026 com a Lei 15.270: 5.000 → 0,00; 6.000 → 394,54; 7.000 → 802,68; 7.350 → redução zero", () => {
  // 6.000: base 5.392,80 × 27,5 % − 908,73 = 574,29; redução 978,62 − 798,87 = 179,75 → 394,54
  const r6 = irpfMensal({ rendimentoCentavos: 600000 });
  assert.equal(r6.modo, "simplificado");
  assert.equal(r6.impostoTabelaCentavos, 57429);
  assert.equal(r6.reducaoCentavos, 17975);
  assert.equal(r6.impostoCentavos, 39454);
  assert.deepEqual(r6.avisos, ["estimativa"]);
  // 5.000: imposto 312,89 (base 4.392,80 × 22,5 % − 675,49) e a redução zera
  const r5 = irpfMensal({ rendimentoCentavos: 500000 });
  assert.equal(r5.impostoTabelaCentavos, 31289);
  assert.equal(r5.impostoCentavos, 0);
  // 7.000: base 6.392,80 × 27,5 % − 908,73 = 849,29; redução exata 978,62 − 932,015 = 46,605 → 46,61 → 802,68.
  // O plano anota 802,69, que vem de 46,60 (ponto flutuante). `salario-liquido.mjs` já escolheu 46,61.
  const r7 = irpfMensal({ rendimentoCentavos: 700000 });
  assert.equal(r7.reducaoCentavos, 4661);
  assert.equal(r7.impostoCentavos, 80268);
  // 7.350: 978,62 − 978,61575 = 0,00425 → 0; imposto cheio = 6.742,80 × 27,5 % − 908,73 = 945,54
  const r735 = irpfMensal({ rendimentoCentavos: 735000 });
  assert.equal(r735.reducaoCentavos, 0);
  assert.equal(r735.impostoCentavos, 94554);
  assert.equal(reducaoLei15270(734999, 100000), 1, "7.349,99 ainda está na faixa: 978,62 − 978,6144 = 0,0057 → 0,01");
  assert.equal(reducaoLei15270(735000, 100000), 0, "7.350,00 cravado já está fora da faixa");
  assert.equal(reducaoLei15270(500001, 100000), 31289, "5.000,01: 978,62 − 665,7263 = 312,8937 → 312,89 (contínuo com o teto de 5.000)");
  assert.equal(irpfMensal({ rendimentoCentavos: 200000 }).impostoCentavos, 0, "abaixo da isenção");
  assert.equal(irpfMensal({ rendimentoCentavos: 600000, decimoTerceiro: true }).avisos[1], "decimo_terceiro_tributado_em_separado");
  assert.throws(() => irpfMensal({ rendimentoCentavos: -1 }), /valor_invalido/);
  assert.throws(() => irpfMensal({ rendimentoCentavos: 600000, modo: "mistico" }), /modo_invalido/);
});

test("deduções legais (INSS + dependentes) e escolha automática do menor imposto", () => {
  // 10.000 com 2 dependentes e INSS 951,63 (teto 2026 pela tabela progressiva): base legal 10.000 − 951,63 − 379,18 = 8.669,19
  // × 27,5 % − 908,73 = 1.475,30; simplificado: 9.392,80 × 27,5 % − 908,73 = 1.674,29 → legal ganha. Sem redução (> 7.350).
  const r = irpfMensal({ rendimentoCentavos: 1000000, dependentes: 2, deducoesLegaisCentavos: 95163 });
  assert.equal(r.modo, "legal");
  assert.equal(r.baseCentavos, 866919);
  assert.equal(r.impostoCentavos, 147530);
  assert.equal(irpfMensal({ rendimentoCentavos: 1000000, dependentes: 2, deducoesLegaisCentavos: 95163, modo: "simplificado" }).impostoCentavos, 167429);
});

test("conformidade: a tabela e o redutor do Fitrich batem com `salario-liquido.mjs` (modo simplificado, sem INSS) em 5.000, 6.000, 7.000 e 7.350", () => {
  assert.equal(IRPF_2026.descontoSimplificadoCentavos, Math.round(TABELAS_2026.descontoSimplificado * 100));
  assert.equal(IRPF_2026.dependenteCentavos, Math.round(TABELAS_2026.dependente * 100));
  assert.deepEqual(IRPF_2026.faixas.map((f) => [f.ateCentavos, f.aliquotaBp, f.deduzirCentavos]), TABELAS_2026.irrfFaixas.map((f) => [f.ate === Infinity ? Infinity : Math.round(f.ate * 100), Math.round(f.aliquota * 10000), Math.round(f.deduzir * 100)]));
  for (const bruto of [5000, 6000, 7000, 7350, 3000, 12000]) {
    // A ferramenta desconta INSS no modo legal; no simplificado não, então as bases coincidem.
    const ref = salarioLiquido({ bruto, modo: "simplificado" });
    assert.equal(irpfMensal({ rendimentoCentavos: bruto * 100, modo: "simplificado" }).impostoCentavos, Math.round(ref.irrf * 100), `rend ${bruto}`);
  }
});

test("DAS do MEI 2026: INSS 5 % de 1.621,00 = 81,05; comércio 82,05; serviços 86,05; ambos 87,05 — marcado como fonte secundária", () => {
  assert.deepEqual(dasMei({ atividade: "comercio_industria" }), { inssCentavos: 8105, icmsCentavos: 100, issCentavos: 0, totalCentavos: 8205, avisos: ["fonte_secundaria", "estimativa"] });
  assert.equal(dasMei({ atividade: "servicos" }).totalCentavos, 8605);
  assert.equal(dasMei({ atividade: "ambos" }).totalCentavos, 8705);
  assert.throws(() => dasMei({ atividade: "agro" }), /atividade_invalida/);
});

test("carnê-leão é lembrete, não cálculo: DARF 0190 no último dia útil do mês seguinte (set/26 → 30/10; abr/26 → 29/05, porque 31/05 é domingo)", () => {
  const r = lembreteCarneLeao("2026-09");
  assert.equal(r.codigo, "lembrete");
  assert.equal(r.darf, "0190");
  assert.equal(r.vencimento, "2026-10-30"); // 31/10/2026 é sábado
  assert.deepEqual(r.avisos, ["feriados_nao_considerados"]);
  assert.equal(lembreteCarneLeao("2026-04").vencimento, "2026-05-29");
  // Com calendário de dias úteis injetado (área 2), o feriado é respeitado e o aviso some
  const semDia30 = lembreteCarneLeao("2026-09", { ehDiaUtil: (iso) => iso !== "2026-10-30" && !["2026-10-31"].includes(iso) });
  assert.equal(semDia30.vencimento, "2026-10-29");
  assert.deepEqual(semDia30.avisos, []);
  assert.throws(() => lembreteCarneLeao("2026/09"), /ym_invalido/);
});
