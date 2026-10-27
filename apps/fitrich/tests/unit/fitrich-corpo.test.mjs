// Corpo, sono e recuperação do Fitrich (Node 18, sem DOM). Todo valor de referência abaixo foi calculado À MÃO (a conta
// está no comentário de cada teste) e depois conferido, nunca copiado da saída da função. Fontes: docs/pesquisa-corpo.md.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { faixaFfmi, faixaGordura, faixaImc, faixaRcq, faixaRce, ffmi, ffmiNormalizado, gordura, imc, massaMagra, composicaoCorporal, rcq, rce, pesoNaFaixaImc } from "../../app/js/v2/corpo/composicao.mjs";
import { alertasDePeso, projecao, ruidoDiario, taxaSemanal, tCritico, tendenciaEma } from "../../app/js/v2/corpo/tendencia.mjs";
import { dividaDeSono, duracaoHoras, faixaSono, horaDeMinutos, idadeEm, metaSonoHoras, minutosDeHora, noitesNaFaixa, pontoMedioMin, regularidade } from "../../app/js/v2/corpo/sono.mjs";
import { BOTOES_ML, metaAguaMl, passouDoMeioTermo, progressoAgua } from "../../app/js/v2/corpo/agua.mjs";
import { cargaDaSessao, indiceRecuperacao, razaoDeCarga } from "../../app/js/v2/corpo/recuperacao.mjs";
import { bemestarDoDia, salvarBemestar, somarAgua } from "../../app/js/v2/corpo/bemestar.mjs";
import { criarFotosMemoria } from "../../app/js/v2/corpo/fotos.mjs";
import { esc, montarRelatorio } from "../../app/js/v2/corpo/relatorio.mjs";
import { resumoDoPeso, resumoDoSono, recuperacaoDeHoje } from "../../app/js/v2/ui/telas/corpo.mjs";
import { ErroEsquema, adicionar, validar, vazio } from "../../app/js/v2/esquema.mjs";
import { migrar } from "../../app/js/v2/migracao.mjs";
import { criarAdaptadorMemoria } from "../../app/js/v2/armazem.mjs";
import { criarFmt } from "../../app/js/v2/ui/fmt.mjs";
import { criarI18n, paridade } from "../../app/js/v2/ui/i18n.mjs";
import { TELAS } from "../../app/js/v2/ui/telas/indice.mjs";
import dic from "../../app/js/v2/ui/telas/corpo.i18n.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const TELAS_DIR = join(AQUI, "..", "..", "app", "js", "v2", "ui", "telas");
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} ≠ ${b}`);
const AGORA = () => "2026-10-05T12:00:00.000Z";
const ids = () => { let i = 0; return () => `id-${++i}`; };
const op = { novoId: ids(), agora: AGORA };
const HOJE = "2026-10-05";
const d0 = (dias, base = HOJE) => new Date(Date.parse(`${base}T00:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);

// ---------- composição ----------
test("IMC: 80 kg a 180 cm dá 80 ÷ 3,24 = 24,7 e cai na faixa de referência da OMS", () => {
  assert.equal(imc(80, 180), 24.7);
  assert.equal(faixaImc(24.7), "referencia");
});
test("IMC: os cortes da OMS (18,5 / 25 / 30) são fechados embaixo: 18,5 e 25 já mudam de faixa", () => {
  assert.deepEqual([18.4, 18.5, 24.99, 25, 29.99, 30].map(faixaImc), ["abaixo", "referencia", "referencia", "acima", "acima", "bem_acima"]);
  assert.equal(faixaImc(null), null);
});
test("faixa de peso do IMC para 170 cm: 18,5 × 2,89 = 53,5 e 24,9 × 2,89 = 72,0", () => {
  assert.deepEqual(pesoNaFaixaImc(170), { minKg: 53.5, maxKg: 72 });
});
test("Marinha, homem 180 cm, cintura 90, pescoço 38: 495 ÷ (1,0324 − 0,19077×1,716003 + 0,15456×2,255273) − 450 = 19,8%", () => {
  assert.equal(gordura({ sexo: "m", alturaCm: 180, cinturaCm: 90, pescocoCm: 38 }), 19.8);
});
test("Marinha, mulher 165 cm, cintura 80, quadril 100, pescoço 33 dá 31,9% e a conta recusa cintura menor que pescoço", () => {
  assert.equal(gordura({ sexo: "f", alturaCm: 165, cinturaCm: 80, quadrilCm: 100, pescocoCm: 33 }), 31.9);
  assert.equal(gordura({ sexo: "m", alturaCm: 180, cinturaCm: 35, pescocoCm: 38 }), null);
});
test("faixas de gordura do ACE: limite superior exclusivo (homem 13,9 atleta, 14 fitness; mulher 24,9 fitness, 25 média)", () => {
  assert.deepEqual([5.9, 6, 13.9, 14, 17.9, 18, 24.9, 25].map((v) => faixaGordura(v, "m")), ["essencial", "atletica", "atletica", "fitness", "fitness", "media", "media", "alta"]);
  assert.deepEqual([13.9, 14, 20.9, 21, 24.9, 25, 31.9, 32].map((v) => faixaGordura(v, "f")), ["essencial", "atletica", "atletica", "fitness", "fitness", "media", "media", "alta"]);
  assert.equal(faixaGordura(20, ""), null);
});
test("RCQ: 90 ÷ 100 = 0,90 ainda é referência para homem (corte da OMS é ESTRITAMENTE acima); 0,91 é elevado; mulher corta em 0,85", () => {
  assert.equal(rcq(90, 100), 0.9);
  assert.equal(faixaRcq(0.9, "m"), "referencia");
  assert.equal(faixaRcq(0.91, "m"), "elevada");
  assert.equal(faixaRcq(0.85, "f"), "referencia");
  assert.equal(faixaRcq(0.86, "f"), "elevada");
  assert.equal(faixaRcq(0.8, ""), null);
});
test("RCE: 85 ÷ 170 = 0,50 já é 'aumentada'; 84,9 ÷ 170 = 0,4994 fica na referência (não arredonda para cima antes de classificar)", () => {
  assert.equal(faixaRce(rce(85, 170)), "aumentada");
  assert.equal(faixaRce(rce(84.9, 170)), "referencia");
  assert.equal(faixaRce(rce(68, 170)), "referencia"); // 0,40
  assert.equal(faixaRce(rce(67.9, 170)), "baixa");
  assert.equal(faixaRce(rce(102, 170)), "alta"); // 0,60
});
test("massa magra e FFMI: 80 kg a 20% = 64,0 kg; 64 ÷ 3,24 = 19,8; a 170 cm 60 kg magros dão 20,76 + 6,1×0,10 = 21,4", () => {
  assert.equal(massaMagra(80, 20), 64);
  assert.equal(ffmi(64, 180), 19.8);
  assert.equal(ffmiNormalizado(64, 180), 19.8); // 1,80 m: o termo de altura zera
  assert.equal(ffmiNormalizado(60, 170), 21.4);
  assert.equal(massaMagra(80, null), null);
});
test("FFMI só tem referência publicada para homens: 25 vira 'acima do observado'; mulher não recebe faixa inventada", () => {
  assert.equal(faixaFfmi(24.9, "m"), "dentro_do_observado");
  assert.equal(faixaFfmi(25, "m"), "acima_do_observado");
  assert.equal(faixaFfmi(21, "f"), null);
});
test("composicaoCorporal junta o valor mais recente de cada medida (até 30 dias da mais nova) e diz que falta perfil em vez de chutar", () => {
  const d = vazio({ agora: AGORA });
  d.perfil = { ...d.perfil, sexo: "m", alturaCm: 180 };
  d.pesos = [{ id: "p1", data: "2026-10-01", kg: 80 }];
  d.medidas = [{ id: "m1", data: "2026-10-01", cinturaCm: 90, pescocoCm: 38, quadrilCm: 100 }];
  const c = composicaoCorporal(d, HOJE);
  assert.equal(c.imc, 24.7); assert.equal(c.gordura, 19.8); assert.equal(c.rcq, 0.9); assert.equal(c.rce, 0.5);
  assert.equal(c.rceFaixa, "aumentada"); assert.equal(c.massaMagraKg, 64.2); // 80 × (1 − 0,198) = 64,16
  // Medição nova só de cintura (88) não apaga o pescoço de ontem; uma fita de 60 dias antes fica de fora.
  const d2 = { ...d, medidas: [{ id: "m0", data: d0(-60), cinturaCm: 99, pescocoCm: 50, quadrilCm: 99 }, ...d.medidas, { id: "m2", data: d0(0), cinturaCm: 88 }] };
  const c2 = composicaoCorporal(d2, HOJE);
  assert.equal(c2.rce, 0.4889); assert.equal(c2.rcq, 0.88); // 88 ÷ 180 e 88 ÷ 100
  assert.equal(composicaoCorporal({ ...d2, medidas: [d2.medidas[0], { id: "m3", data: d0(0), cinturaCm: 88 }] }, HOJE).gordura, null); // pescoço de 60 dias atrás não vale
  const sem = composicaoCorporal({ ...d, perfil: { ...d.perfil, sexo: "", alturaCm: null } }, HOJE);
  assert.equal(sem.faltaPerfil, true); assert.equal(sem.gordura, null); assert.equal(sem.imc, null);
});

// ---------- tendência ----------
test("tendência EMA: 80 → 81 no dia seguinte vale 80 + 0,1×(81−80) = 80,1; com 2 dias sem pesar o fator vira 1 − 0,9² = 0,19 e 79 dá 80,1 + 0,19×(−1,1) = 79,891", () => {
  const s = tendenciaEma([{ data: "2026-09-01", kg: 80 }, { data: "2026-09-02", kg: 81 }, { data: "2026-09-04", kg: 79 }]);
  assert.deepEqual(s.map((p) => p.tendencia), [80, 80.1, 79.891]);
});
test("um dia de +1,5 kg de água puxa a tendência só 0,15 kg: flutuação diária não vira pânico", () => {
  const base = Array.from({ length: 10 }, (_, i) => ({ data: d0(i - 20), kg: 80 }));
  const s = tendenciaEma([...base, { data: d0(-10), kg: 81.5 }]);
  near(s[s.length - 1].tendencia, 80.15, 1e-9);
});
test("duas pesagens no mesmo dia viram a média do dia (80 e 81 = 80,5), não dois passos da média móvel", () => {
  const s = tendenciaEma([{ data: "2026-09-01", kg: 80 }, { data: "2026-09-01", kg: 81 }]);
  assert.equal(s.length, 1); assert.equal(s[0].tendencia, 80.5);
});
test("taxa semanal de uma reta perfeita (82; 81,5; 81; 80,5; 80 a cada 7 dias) é −0,5 kg/semana com margem zero", () => {
  const pesos = [0, 1, 2, 3, 4].map((i) => ({ data: d0(-28 + 7 * i), kg: 82 - 0.5 * i }));
  const t = taxaSemanal(pesos, HOJE);
  assert.equal(t.kgPorSemana, -0.5); assert.equal(t.erroPadrao, 0); assert.equal(t.margem, 0); assert.equal(t.pontos, 5);
});
test("taxa semanal com ruído: 80; 79; 79,5; 78,5 → inclinação −0,4, erro-padrão √0,045 = 0,212 e margem t(2 gl)=4,30 × 0,212 = 0,912", () => {
  // Sxx = 5, Sxy = −2, SSR = 0,45, s² = 0,225, SE² = 0,225 ÷ 5 = 0,045.
  const pesos = [80, 79, 79.5, 78.5].map((kg, i) => ({ data: d0(-21 + 7 * i), kg }));
  const t = taxaSemanal(pesos, HOJE);
  assert.equal(t.kgPorSemana, -0.4); assert.equal(t.erroPadrao, 0.212); assert.equal(t.margem, 0.912);
  assert.equal(tCritico(2), 4.3);
});
test("taxa semanal não aparece com 3 pesagens nem com menos de 14 dias de intervalo", () => {
  assert.equal(taxaSemanal([0, 7, 14].map((i) => ({ data: d0(-14 + i), kg: 80 })), HOJE), null);
  assert.equal(taxaSemanal([0, 1, 2, 3, 4].map((i) => ({ data: d0(-8 + 2 * i), kg: 80 - i })), HOJE), null);
});
test("projeção: perda de 0,5 kg/semana de 80 até 78 = 2 ÷ 0,5 = 4 semanas, a data é hoje + 28 dias", () => {
  const p = projecao({ atualKg: 80, metaKg: 78, taxa: { kgPorSemana: -0.5, margem: 0 }, hoje: HOJE });
  assert.deepEqual(p.semanas, { min: 4, central: 4, max: 4 }); assert.equal(p.data, "2026-11-02");
});
test("projeção com faixa: ritmo −0,5 ± 0,1 até −2 kg dá mínimo ⌈2÷0,6⌉=4, central 4 e máximo ⌈2÷0,4⌉=5 semanas", () => {
  const p = projecao({ atualKg: 80, metaKg: 78, taxa: { kgPorSemana: -0.5, margem: 0.1 }, hoje: HOJE });
  assert.deepEqual(p.semanas, { min: 4, central: 4, max: 5 });
});
test("projeção honesta: se a faixa do ritmo cruza o zero, não há data ('incerta'); ritmo para o lado errado ou nulo é 'sem_direcao'", () => {
  assert.equal(projecao({ atualKg: 80, metaKg: 78, taxa: { kgPorSemana: -0.4, margem: 0.912 }, hoje: HOJE }).estado, "incerta");
  assert.equal(projecao({ atualKg: 80, metaKg: 78, taxa: { kgPorSemana: 0.3, margem: 0.1 }, hoje: HOJE }).estado, "sem_direcao");
  assert.equal(projecao({ atualKg: 80, metaKg: 78, taxa: { kgPorSemana: 0.01, margem: 0 }, hoje: HOJE }).estado, "sem_direcao");
  assert.equal(projecao({ atualKg: 78.05, metaKg: 78, taxa: { kgPorSemana: -0.5, margem: 0 }, hoje: HOJE }).estado, "na_meta");
  assert.equal(projecao({ atualKg: 80, metaKg: 70, taxa: { kgPorSemana: -0.05, margem: 0.01 }, hoje: HOJE }).estado, "alem_3_anos");
});
test("avisos de proporção: perder mais de 1% do peso por semana (0,8 kg em 80 kg é 1%: no limite não avisa) e meta de IMC abaixo de 18,5", () => {
  assert.deepEqual(alertasDePeso({ atualKg: 80, metaKg: 75, alturaCm: 175, taxa: { kgPorSemana: -0.8 } }), []);
  assert.deepEqual(alertasDePeso({ atualKg: 80, metaKg: 75, alturaCm: 175, taxa: { kgPorSemana: -0.81 } }), ["ritmo_rapido"]);
  assert.deepEqual(alertasDePeso({ atualKg: 60, metaKg: 54, alturaCm: 170, taxa: null }), []); // 54 ÷ 2,89 = 18,69: acima do piso
  assert.deepEqual(alertasDePeso({ atualKg: 60, metaKg: 53, alturaCm: 170, taxa: null }), ["meta_abaixo_da_faixa"]); // 53 ÷ 2,89 = 18,34
});
test("ruído diário é o desvio dos pesos em torno da tendência (resíduos ±1 em 6 pontos → √(6÷5) = 1,10)", () => {
  const serie = [1, -1, 1, -1, 1, -1].map((r, i) => ({ data: d0(-i), kg: 80 + r, tendencia: 80 }));
  assert.equal(ruidoDiario(serie, HOJE), 1.1);
  assert.equal(ruidoDiario(serie.slice(0, 3), HOJE), null);
});
test("resumoDoPeso junta tendência, ritmo, projeção e meta da tela Metas sem inventar dado", () => {
  const d = vazio({ agora: AGORA });
  assert.equal(resumoDoPeso(d, HOJE), null);
  d.pesos = [0, 1, 2, 3, 4].map((i) => ({ id: `p${i}`, data: d0(-28 + 7 * i), kg: 82 - 0.5 * i }));
  d.metas = [{ id: "m", nome: "Peso", tipo: "peso", alvo: 78 }];
  const r = resumoDoPeso(d, HOJE);
  assert.equal(r.taxa.kgPorSemana, -0.5); assert.equal(r.meta, 78); assert.equal(r.proj.estado, "ok");
});

// ---------- sono ----------
test("faixas de sono por idade (NSF 2015): 14–17 → 8–10; 18–64 → 7–9; 65+ → 7–8; sem idade presume adulto e avisa", () => {
  assert.deepEqual([13, 14, 17, 18, 64, 65].map((i) => { const f = faixaSono(i); return `${f.min}-${f.max}`; }), ["9-11", "8-10", "8-10", "7-9", "7-9", "7-8"]);
  assert.equal(faixaSono(null).presumida, true);
});
test("idade em anos completos: nascido em 15/06/1990 tem 35 anos no dia 14/06/2026 e 36 no dia 15", () => {
  assert.equal(idadeEm("1990-06-15", "2026-06-14"), 35); assert.equal(idadeEm("1990-06-15", "2026-06-15"), 36); assert.equal(idadeEm(null, HOJE), null);
});
test("meta de sono padrão é o meio da faixa (adulto 8 h, 65+ 7,5 h) e a meta digitada vence", () => {
  assert.equal(metaSonoHoras({ nascimento: null }, HOJE), 8);
  assert.equal(metaSonoHoras({ nascimento: "1950-01-01" }, HOJE), 7.5);
  assert.equal(metaSonoHoras({ nascimento: null, metaSonoHoras: 7 }, HOJE), 7);
});
test("duração atravessa a meia-noite: dormir 23:30 e acordar 07:00 = (420 − 1410 + 1440) ÷ 60 = 7,5 h; ponto médio 03:15", () => {
  assert.equal(minutosDeHora("23:30"), 1410); assert.equal(minutosDeHora("24:00"), null); assert.equal(horaDeMinutos(195), "03:15");
  assert.equal(duracaoHoras(1410, 420), 7.5); assert.equal(pontoMedioMin(1410, 420), 195);
  assert.equal(duracaoHoras(420, 420), null);
});
test("regularidade: pontos médios 03:00, 03:30, 04:00 têm desvio amostral √((900+0+900)÷2) = 30 min ('alta', limite incluso)", () => {
  const r = regularidade([180, 210, 240]);
  assert.equal(r.desvioMin, 30); assert.equal(r.faixa, "alta"); assert.equal(r.pontoMedioMin, 210);
});
test("regularidade atravessa a meia-noite: 23:50, 00:10, 00:30 estão a 20 min um do outro (desvio 20), não a ~23 h", () => {
  const r = regularidade([1430, 10, 30]);
  assert.equal(r.desvioMin, 20); assert.equal(r.pontoMedioMin, 10);
});
test("regularidade: desvio de 61 min é 'baixa' e de 31 é 'media'; com 2 noites não há número", () => {
  assert.equal(regularidade([600, 600, 600]).desvioMin, 0);
  // −x, 0, +x → sd = x: com x = 61 → 61
  assert.equal(regularidade([600 - 61, 600, 600 + 61]).faixa, "baixa");
  assert.equal(regularidade([600 - 31, 600, 600 + 31]).faixa, "media");
  assert.equal(regularidade([100, 200]), null);
});
test("dívida de sono: meta 8 h e noites de 7,5 / 6 / 8,5 / 7 na semana = 0,5 + 2 + 0 + 1 = 3,5 h; noite de 10 dias atrás fica de fora", () => {
  const reg = [[-1, 7.5], [-2, 6], [-3, 8.5], [-4, 7], [-10, 3]].map(([i, h]) => ({ data: d0(i), sonoHoras: h }));
  const r = dividaDeSono(reg, HOJE, 8);
  assert.equal(r.deficitHoras, 3.5); assert.equal(r.noites, 4); assert.equal(r.mediaHoras, 7.25);
  assert.equal(dividaDeSono(reg.slice(0, 2), HOJE, 8), null);
});
test("noites na faixa recomendada contam as bordas (7 e 9 estão dentro de 7–9)", () => {
  assert.equal(noitesNaFaixa([6.9, 7, 8, 9, 9.1].map((h) => ({ sonoHoras: h })), { min: 7, max: 9 }), 3);
});
test("resumoDoSono lê só os últimos 14 dias e calcula a regularidade com os horários registrados", () => {
  const d = vazio({ agora: AGORA });
  d.bemestar = [[-1, 1410, 420], [-2, 1410, 420], [-3, 1410, 420], [-20, 1410, 420]].map(([i, dm, am], k) => ({ id: `b${k}`, data: d0(i), sonoHoras: 7.5, dormiuMin: dm, acordouMin: am }));
  const s = resumoDoSono(d, HOJE);
  assert.equal(s.noites.length, 3); assert.equal(s.media, 7.5); assert.equal(s.regularidade.desvioMin, 0); assert.equal(s.meta, 8);
});

// ---------- água ----------
test("meta de água: 80 kg × 30 = 2.400 ml; 72,3 kg → 2.169 → 2.150 (arredonda a 50); 40 kg sobe ao piso 1.500; 150 kg cai no teto 4.000; sem peso 2.000", () => {
  assert.equal(metaAguaMl(80).ml, 2400); assert.equal(metaAguaMl(72.3).ml, 2150); assert.equal(metaAguaMl(40).ml, 1500); assert.equal(metaAguaMl(150).ml, 4000);
  assert.deepEqual(metaAguaMl(null), { ml: 2000, padrao: true });
});
test("progresso da água fica entre 0 e 1 e o aviso de meio-termo só aparece acima de 1,5× a meta", () => {
  assert.equal(progressoAgua(1200, 2400), 0.5); assert.equal(progressoAgua(5000, 2400), 1); assert.equal(progressoAgua(null, 2400), 0);
  assert.equal(passouDoMeioTermo(3600, 2400), false); assert.equal(passouDoMeioTermo(3601, 2400), true);
  assert.deepEqual(BOTOES_ML, [200, 300, 500]);
});

// ---------- recuperação ----------
test("carga de uma sessão = minutos × esforço × 2 (CR10 de Foster); sem esforço informado conta 3", () => {
  assert.equal(cargaDaSessao({ minutos: 60, esforco: 3 }), 360); assert.equal(cargaDaSessao({ minutos: 30 }), 180);
});
test("razão aguda:crônica de quem treina igual toda semana é 1: 4 sessões de 360 (uma por semana) → (360÷7) ÷ (1440÷28) = 1", () => {
  const tr = [0, 7, 14, 21].map((i) => ({ data: d0(-i), minutos: 60, esforco: 3 }));
  assert.equal(razaoDeCarga(tr, HOJE).razao, 1);
});
test("razão aguda:crônica de 1,55: carga aguda 310 e crônica 800 → 4 × 310 ÷ 800; com histórico de menos de 14 dias ou crônica zero, não existe razão", () => {
  const tr = [{ data: d0(-20), minutos: 49, esforco: 5 }, { data: HOJE, minutos: 31, esforco: 5 }];
  assert.equal(razaoDeCarga(tr, HOJE).razao, 1.55);
  assert.equal(razaoDeCarga([{ data: d0(-5), minutos: 60, esforco: 3 }], HOJE), null);
  assert.equal(razaoDeCarga([], HOJE), null);
});
test("índice de recuperação: sono 7 h de 8 com qualidade 4 = 0,7×0,875 + 0,3×0,75 = 0,8375; energia 3 = 0,5; dor 2 = 0,75 → (33,5 + 12,5 + 15) ÷ 85 = 72", () => {
  const r = indiceRecuperacao({ bemestar: { sonoHoras: 7, sonoQualidade: 4, energia: 3, dor: 2 }, treinos: [], hoje: HOJE, metaSonoHoras: 8 });
  assert.equal(r.pontos, 72); assert.equal(r.faixa, "boa"); assert.equal(r.usados, 3);
  assert.deepEqual(r.termos.map((x) => x.pontos), [33.5, 12.5, 15, null]);
});
test("o termo de carga entra na média: energia 5 (25 pts) + carga com razão 1,55 → termo 0,5 (7,5 pts) = 32,5 ÷ 40 = 81", () => {
  const tr = [{ data: d0(-20), minutos: 49, esforco: 5 }, { data: HOJE, minutos: 31, esforco: 5 }];
  const r = indiceRecuperacao({ bemestar: { energia: 5 }, treinos: tr, hoje: HOJE, metaSonoHoras: 8 });
  assert.equal(r.pontos, 81); assert.equal(r.usados, 2);
});
test("só a carga de treino não é recuperação: sem nada relatado pela pessoa o índice é nulo, não um número bonito", () => {
  const tr = [{ data: d0(-20), minutos: 49, esforco: 5 }, { data: HOJE, minutos: 31, esforco: 5 }];
  assert.equal(indiceRecuperacao({ bemestar: null, treinos: tr, hoje: HOJE, metaSonoHoras: 8 }).pontos, null);
});
test("faixas do índice: 70 é 'boa', 50 é 'moderada', 49 pede dia leve; dor 4 liga o aviso de procurar profissional", () => {
  const f = (energia) => indiceRecuperacao({ bemestar: { energia }, treinos: [], hoje: HOJE, metaSonoHoras: 8 });
  assert.equal(f(5).faixa, "boa"); // 100
  assert.equal(f(3).faixa, "moderada"); // 50
  assert.equal(f(2).faixa, "leve"); // 25
  assert.equal(indiceRecuperacao({ bemestar: { dor: 4 }, treinos: [], hoje: HOJE, metaSonoHoras: 8 }).avisoDor, true); // dor 4 → valor 0,25 → 25 pts
  assert.equal(indiceRecuperacao({ bemestar: { dor: 3 }, treinos: [], hoje: HOJE, metaSonoHoras: 8 }).avisoDor, false);
});
test("sono acima da meta não passa de 100% do termo (9 h de 8, qualidade 5 = 0,7 + 0,3 = 1)", () => {
  const r = indiceRecuperacao({ bemestar: { sonoHoras: 9, sonoQualidade: 5 }, treinos: [], hoje: HOJE, metaSonoHoras: 8 });
  assert.equal(r.pontos, 100);
});
test("recuperacaoDeHoje lê o registro do dia e a meta de sono do perfil", () => {
  const d = vazio({ agora: AGORA });
  const n = salvarBemestar(d, HOJE, { sonoHoras: 8, energia: 5 }, op);
  assert.equal(recuperacaoDeHoje(n, HOJE).pontos, 100); // sono 8/8 sem qualidade = 1; energia 5 = 1
});

// ---------- bem-estar no esquema ----------
test("bemestar: um registro por data; salvar de novo mescla, e null apaga só aquele campo", () => {
  let d = vazio({ agora: AGORA });
  d = salvarBemestar(d, HOJE, { sonoHoras: 7.5, energia: 4 }, op);
  d = salvarBemestar(d, HOJE, { dor: 2, energia: null }, op);
  assert.equal(d.bemestar.length, 1);
  const b = bemestarDoDia(d, HOJE);
  assert.equal(b.sonoHoras, 7.5); assert.equal(b.dor, 2); assert.equal(b.energia, null);
  assert.equal(validar(d).ok, true);
});
test("água soma, desfaz e nunca fica abaixo de zero", () => {
  let d = somarAgua(vazio({ agora: AGORA }), HOJE, 300, op);
  d = somarAgua(d, HOJE, 500, op);
  assert.equal(bemestarDoDia(d, HOJE).aguaMl, 800);
  d = somarAgua(d, HOJE, -500, op); assert.equal(bemestarDoDia(d, HOJE).aguaMl, 300);
  d = somarAgua(d, HOJE, -9999, op); assert.equal(bemestarDoDia(d, HOJE).aguaMl, 0);
});
test("esquema recusa bemestar impossível: 25 h de sono, qualidade 6, horário 1440, água negativa, data inválida", () => {
  const d = vazio({ agora: AGORA });
  const tenta = (x) => { try { adicionar(d, "bemestar", { data: HOJE, ...x }, op); return null; } catch (e) { assert.ok(e instanceof ErroEsquema); return e.erros[0].codigo; } };
  assert.equal(tenta({ sonoHoras: 25 }), "bemestar.sono_horas_invalido");
  assert.equal(tenta({ sonoQualidade: 6 }), "bemestar.escala_invalida");
  assert.equal(tenta({ dormiuMin: 1440 }), "bemestar.horario_invalido");
  assert.equal(tenta({ aguaMl: -1 }), "bemestar.agua_invalida");
  assert.equal(tenta({ data: "2026-13-40" }), "bemestar.data_invalida");
  assert.equal(tenta({ sonoHoras: 7.5, energia: 3 }), null);
});
test("perfil aceita nascimento e meta de sono válidos e recusa meta de 2 horas", () => {
  const d = vazio({ agora: AGORA });
  assert.equal(validar({ ...d, perfil: { ...d.perfil, nascimento: "1990-06-15", metaSonoHoras: 7.5 } }).ok, true);
  assert.equal(validar({ ...d, perfil: { ...d.perfil, metaSonoHoras: 2 } }).ok, false);
  assert.equal(validar({ ...d, perfil: { ...d.perfil, nascimento: "ontem" } }).ok, false);
});
test("backup v2 anterior ao Corpo (sem a coleção bemestar) continua abrindo: a coleção entra vazia, nada é recusado", () => {
  const velho = vazio({ agora: AGORA }); delete velho.bemestar;
  const r = migrar(velho, { agora: AGORA });
  assert.equal(r.ok, true); assert.deepEqual(r.dados.bemestar, []);
});
test("o armazém em memória guarda e devolve bemestar com o documento inteiro", async () => {
  const a = criarAdaptadorMemoria();
  const d = salvarBemestar(vazio({ agora: AGORA }), HOJE, { sonoHoras: 7, aguaMl: 500 }, op);
  await a.gravarTudo({ colecoes: { bemestar: d.bemestar }, meta: { versao: 2 } });
  assert.equal((await a.lerTudo()).colecoes.bemestar[0].aguaMl, 500);
});

// ---------- fotos ----------
test("fotos locais: guarda, lista em ordem de data e apaga; nada disso passa pelo documento do Fitrich", async () => {
  const f = criarFotosMemoria();
  await f.adicionar({ id: "b", data: "2026-10-01", nota: "", blob: "x" });
  await f.adicionar({ id: "a", data: "2026-09-01", nota: "início", blob: "y" });
  assert.deepEqual((await f.listar()).map((x) => x.id), ["a", "b"]);
  await f.remover("a");
  assert.deepEqual((await f.listar()).map((x) => x.id), ["b"]);
  const d = vazio({ agora: AGORA });
  assert.ok(!("fotos" in d));
});

// ---------- relatório ----------
const i18nDe = (idioma) => criarI18n({ idioma, dicionarios: [dic] });
function dadosCompletos() {
  let d = vazio({ agora: AGORA });
  d.perfil = { ...d.perfil, sexo: "m", alturaCm: 180, nascimento: "1990-06-15" };
  d.pesos = [0, 1, 2, 3, 4].map((i) => ({ id: `p${i}`, data: d0(-28 + 7 * i), kg: 82 - 0.5 * i }));
  d.medidas = [{ id: "m1", data: d0(-1), cinturaCm: 90, pescocoCm: 38, quadrilCm: 100 }];
  d.metas = [{ id: "m", nome: "Peso", tipo: "peso", alvo: 78 }];
  d.treinos = [{ id: "t1", data: d0(-2), tipo: "Corrida", minutos: 40, esforco: 3 }];
  for (const [i, h] of [[-1, 7.5], [-2, 7], [-3, 6.5]]) d = salvarBemestar(d, d0(i), { sonoHoras: h, sonoQualidade: 4, dormiuMin: 1410, acordouMin: 420, energia: 4, aguaMl: 2200 }, op);
  return d;
}
test("esc neutraliza & < > \" ' para o texto da pessoa nunca virar marcação no relatório", () => {
  assert.equal(esc(`<img src=x onerror="a()"> & 'b'`), "&lt;img src=x onerror=&quot;a()&quot;&gt; &amp; &#39;b&#39;");
});
test("relatório HTML sai completo, em pt-BR, com os números calculados, as fontes e sem script nem atributo style", () => {
  const i = i18nDe("pt-BR"), html = montarRelatorio(dadosCompletos(), HOJE, { t: i.t, fmt: criarFmt("pt-BR"), idioma: "pt-BR" });
  assert.deepEqual(i.faltando(), []);
  assert.match(html, /^<!doctype html>/); assert.match(html, /lang="pt-BR"/);
  for (const trecho of ["24,7", "19,8%", "0,50", "Hodgdon", "National Sleep Foundation", "Não é exame nem diagnóstico"]) assert.ok(html.includes(trecho), `falta ${trecho}`);
  assert.ok(!/<script|style=|onerror|<img/i.test(html));
});
test("relatório em inglês usa o mesmo dicionário e não deixa chave solta", () => {
  const i = i18nDe("en"), html = montarRelatorio(dadosCompletos(), HOJE, { t: i.t, fmt: criarFmt("en"), idioma: "en" });
  assert.deepEqual(i.faltando(), []); assert.match(html, /lang="en"/); assert.ok(!html.includes("[corpo."));
});
test("relatório de quem não registrou nada continua válido e diz 'sem dados' em vez de zeros", () => {
  const i = i18nDe("pt-BR"), html = montarRelatorio(vazio({ agora: AGORA }), HOJE, { t: i.t, fmt: criarFmt("pt-BR") });
  assert.deepEqual(i.faltando(), []); assert.ok(html.includes("Sem pesagens ainda")); assert.ok(!html.includes("NaN"));
});

// ---------- tela, dicionário e contrato ----------
test("dicionário do Corpo: paridade pt-BR/en e nenhuma palavra de culpa, sequência ou vergonha", () => {
  assert.deepEqual(paridade(dic), []);
  const proibidas = /estour|falhou|falhar|perdeu a sequ|sequência|seguidas|streak|atrasad|culpa|you broke|failed|gordo|obeso|preguiç|lazy|fat shaming/i;
  for (const l of ["pt-BR", "en"]) for (const [k, v] of Object.entries(dic[l])) assert.ok(!proibidas.test(v), `${l}:${k} usa palavra proibida`);
});
test("todo t() do código do Corpo tem chave nos dois idiomas (estáticas e as montadas por template)", () => {
  const fontes = ["corpo.mjs", "../../corpo/relatorio.mjs"].map((f) => readFileSync(join(TELAS_DIR, f), "utf8")).join("\n");
  const chaves = Object.keys(dic["pt-BR"]);
  for (const m of fontes.matchAll(/\bt\("(corpo\.[\w.]+)"/g)) assert.ok(chaves.includes(m[1]), `falta ${m[1]}`);
  for (const m of fontes.matchAll(/\bt\(`(corpo\.[^`]+)`/g)) {
    const re = new RegExp(`^${m[1].replace(/\./g, "\\.").replace(/\$\{[^}]+\}/g, "[\\w]+")}$`);
    assert.ok(chaves.some((k) => re.test(k)), `nenhuma chave casa com ${m[1]}`);
  }
  const esperadas = ["corpo.qualidade.1", "corpo.qualidade.5", "corpo.energia.3", "corpo.dor.5", "corpo.rec.faixa.leve", "corpo.rec.sug.moderada", "corpo.rec.termo.carga", "corpo.imcFaixa.bem_acima", "corpo.gorduraFaixa.alta", "corpo.rcqFaixa.elevada", "corpo.rceFaixa.aumentada", "corpo.ffmiFaixa.acima_do_observado", "corpo.peso.alerta.ritmo_rapido", "corpo.peso.alerta.meta_abaixo_da_faixa", "corpo.sono.reg.baixa", "corpo.medida.coxaCm", "corpo.comp.lim.ffmi"];
  for (const k of esperadas) assert.ok(chaves.includes(k), `falta ${k}`);
});
test("a tela Corpo cumpre o contrato: módulo registrado, id/título/montar, sem innerHTML, style, rede, confirm() nem armazenamento no código da tela", async () => {
  assert.ok(TELAS.some((t) => t.id === "corpo" && t.grupo === "mais"));
  const { tela } = await import("../../app/js/v2/ui/telas/corpo.mjs");
  assert.equal(tela.id, "corpo"); assert.equal(typeof tela.montar, "function"); assert.equal(tela.titulo, "corpo.titulo");
  const src = readFileSync(join(TELAS_DIR, "corpo.mjs"), "utf8");
  for (const p of ["innerHTML", "outerHTML", "insertAdjacentHTML", "fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", " confirm(", " alert(", "localStorage", "indexedDB", "style:", "style="]) assert.ok(!src.includes(p), `corpo.mjs contém ${p}`);
  for (const arq of ["composicao", "tendencia", "sono", "agua", "recuperacao", "bemestar", "relatorio"]) {
    const s = readFileSync(join(TELAS_DIR, "..", "..", "corpo", `${arq}.mjs`), "utf8");
    for (const p of ["innerHTML", "fetch(", "document.", "localStorage", "Date.now", "Math.random"]) assert.ok(!s.includes(p), `${arq}.mjs contém ${p}`);
  }
});
