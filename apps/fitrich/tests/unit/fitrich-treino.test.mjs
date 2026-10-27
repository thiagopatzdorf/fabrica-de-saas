// Motor de treino do Fitrich (js/v2/treino/): fórmulas com valor de referência calculado à mão, catálogo,
// dupla progressão, platô, deload, volume semanal, recordes, sessão, cardio e o esquema das 4 coleções novas.
// Node 18.19.1, sem DOM. Cada teste leva o nome da FALHA que impede.
import assert from "node:assert/strict";
import { test } from "node:test";
import { epley, brzycki, e1rm, cargaParaReps, arredondarCarga, fcMaxTanaka, fcMaxFox, karvonen, zonasKarvonen, zonasPercentualMax, zonaDaFc, ritmoSegPorKm, velocidadeKmh, mmss, percentualDeReps } from "../../app/js/v2/treino/formulas.mjs";
import { CATALOGO, exerciciosOrfaos, GRUPOS, EQUIPAMENTOS, PADROES, buscar, exercicioPorId, incrementoPadrao } from "../../app/js/v2/treino/catalogo.mjs";
import { sugerirProxima, detectarPlato, volumeSemanal, faixaDeVolume, sugerirDeload, semanasContinuas, historicoDoExercicio, platosDaPessoa, volumeDoPrograma } from "../../app/js/v2/treino/progressao.mjs";
import { recordesDoExercicio, novosRecordes } from "../../app/js/v2/treino/recordes.mjs";
import { PROGRAMAS, montarPrograma, moverItem, mudarPrescricao, removerItem } from "../../app/js/v2/treino/programas.mjs";
import { aquecimentoPara, apagarSessao, concluirSessao, descansoSugerido, iniciarSessao, registrarSerie, sessaoEmAndamento } from "../../app/js/v2/treino/sessao.mjs";
import { apagarCardio, fcMaxDaPessoa, registrarCardio, resumoSemanal, semanasNaMetaCardio, zonasDaPessoa } from "../../app/js/v2/treino/cardio.mjs";
import { adicionar, remover, validar, vazio, definir } from "../../app/js/v2/esquema.mjs";

const perto = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
const AGORA = () => "2026-10-05T12:00:00.000Z";
const novoIdSeq = () => { let n = 0; return () => `id-${++n}`; };

// ---------- fórmulas (valores calculados à mão) ----------
test("Epley erra o 1RM: 100 kg x 10 deve dar 133,33 e 100 kg x 5 deve dar 116,67", () => {
  perto(epley(100, 10), 100 * (1 + 10 / 30)); perto(epley(100, 10), 133.3333333333);
  perto(epley(100, 5), 116.6666666667);
  assert.equal(epley(100, 1), 100, "uma repetição já é o próprio 1RM");
});
test("Brzycki erra o 1RM: 100 kg x 10 deve dar 133,33 (3600/27) e 100 kg x 5 deve dar 112,5 (3600/32)", () => {
  perto(brzycki(100, 10), 3600 / 27); perto(brzycki(100, 5), 112.5);
  assert.equal(brzycki(100, 13), null, "acima de 12 repetições a Brzycki perde confiança");
});
test("1RM estimado não faz a média Epley+Brzycki entre 2 e 10 repetições: 100 x 5 deve dar 114,58", () => {
  perto(e1rm(100, 5), (116.6666666667 + 112.5) / 2, 1e-6);
  perto(e1rm(80, 5), (93.3333333333 + 90) / 2, 1e-6);
});
test("1RM estimado ignora a repetição na reserva: 80 x 8 com 2 na reserva deve valer 80 x 10 (106,67)", () => {
  perto(e1rm(80, 8, 2), 106.6666666667, 1e-6);
});
test("1RM estimado usa só Epley acima de 10 repetições (60 x 12 = 84) e não estima série de resistência (> 20 repetições)", () => {
  perto(e1rm(60, 12), 84);
  assert.equal(e1rm(20, 25), null);
  assert.equal(e1rm(0, 5), null); assert.equal(e1rm(100, 0), null);
});
test("carga para repetições não inverte a Epley: 1RM 100, 10 repetições = 75 kg; com 2 na reserva = 71,43 kg", () => {
  perto(cargaParaReps(100, 10), 75); perto(cargaParaReps(100, 10, 2), 100 / 1.4);
  perto(percentualDeReps(10), 0.75);
});
test("arredondar a carga não respeita o degrau da anilha: 71,43 com passo 2,5 deve dar 72,5 e com passo 5 deve dar 70", () => {
  assert.equal(arredondarCarga(71.43, 2.5), 72.5); assert.equal(arredondarCarga(71.43, 5), 70); assert.equal(arredondarCarga(63.2, 0), 63.2);
});
test("FC máxima estimada errada: aos 40 anos Tanaka e Fox dão 180; aos 60, Tanaka 166 e Fox 160", () => {
  perto(fcMaxTanaka(40), 180); perto(fcMaxFox(40), 180); perto(fcMaxTanaka(60), 166); perto(fcMaxFox(60), 160);
  assert.equal(fcMaxTanaka(5), null); assert.equal(fcMaxTanaka(null), null);
});
test("Karvonen errado: FC máx 180, repouso 60, 70% da reserva = 60 + 0,7 x 120 = 144", () => {
  perto(karvonen(180, 60, 0.7), 144);
  assert.equal(karvonen(60, 60, 0.7), null, "máxima não pode ser menor ou igual ao repouso");
});
test("as 5 zonas por Karvonen (180/60) devem ser 120-132, 132-144, 144-156, 156-168 e 168-180", () => {
  assert.deepEqual(zonasKarvonen(180, 60).map((z) => [z.de, z.ate]), [[120, 132], [132, 144], [144, 156], [156, 168], [168, 180]]);
  assert.deepEqual(zonasPercentualMax(180).map((z) => [z.de, z.ate]), [[90, 108], [108, 126], [126, 144], [144, 162], [162, 180]]);
});
test("zona da FC média: 150 bpm cai na Z3, 100 abaixo da Z1 (0) e 200 acima da Z5 (5)", () => {
  const z = zonasKarvonen(180, 60);
  assert.equal(zonaDaFc(150, z), 3); assert.equal(zonaDaFc(120, z), 1); assert.equal(zonaDaFc(100, z), 0); assert.equal(zonaDaFc(200, z), 5);
});
test("ritmo e velocidade: 30 min em 5 km deve dar 360 s/km (6:00) e 10,0 km/h", () => {
  assert.equal(ritmoSegPorKm(30, 5), 360); assert.equal(mmss(360), "6:00"); assert.equal(velocidadeKmh(30, 5), 10);
  assert.equal(ritmoSegPorKm(30, 0), null); assert.equal(mmss(359.6), "6:00", "arredonda os segundos antes de montar mm:ss");
});

// ---------- catálogo ----------
test("a biblioteca tem menos de 80 exercícios", () => assert.ok(CATALOGO.length >= 80, String(CATALOGO.length)));
test("exercício do catálogo com id repetido, nome faltando em um idioma ou músculo desconhecido", () => {
  const ids = new Set();
  for (const e of CATALOGO) {
    assert.ok(!ids.has(e.id), `id repetido ${e.id}`); ids.add(e.id);
    assert.ok(e.nome["pt-BR"] && e.nome.en, `${e.id} sem nome nos dois idiomas`);
    assert.ok(GRUPOS.includes(e.grupo) && EQUIPAMENTOS.includes(e.equipamento) && PADROES.includes(e.padrao), e.id);
    assert.ok(e.primarios.length >= 1 && [...e.primarios, ...e.secundarios].every((g) => GRUPOS.includes(g)), `${e.id} músculos`);
    assert.ok(e.primarios.includes(e.grupo) || e.id === "caminhada-fazendeiro" || e.id === "hiperextensao-lombar", `${e.id}: o grupo principal deveria estar entre os primários`);
  }
});
test("todo grupo muscular tem exercício e todo equipamento e padrão aparecem na biblioteca", () => {
  for (const g of GRUPOS) assert.ok(CATALOGO.some((e) => e.grupo === g), g);
  for (const q of EQUIPAMENTOS) assert.ok(CATALOGO.some((e) => e.equipamento === q), q);
  for (const p of PADROES) assert.ok(CATALOGO.some((e) => e.padrao === p), p);
});
test("a busca não acha sem acento e sem caixa, nos dois idiomas", () => {
  assert.ok(buscar([], { texto: "AGACHAMENTO" }).length >= 5);
  assert.ok(buscar([], { texto: "bench press" }).some((e) => e.id === "supino-reto-barra"));
  assert.ok(buscar([], { texto: "flexao", grupo: "peito" }).every((e) => e.grupo === "peito"));
});
test("o degrau de carga padrão está errado: barra de perna 5, barra de braço 2,5, halter 2, peso do corpo 0", () => {
  assert.equal(incrementoPadrao(exercicioPorId("agachamento-livre")), 5); assert.equal(incrementoPadrao(exercicioPorId("supino-reto-barra")), 2.5);
  assert.equal(incrementoPadrao(exercicioPorId("rosca-alternada")), 2); assert.equal(incrementoPadrao(exercicioPorId("flexao-braco")), 0);
});
test("todo programa pronto cita exercício que existe, faixa de repetições coerente e 2 a 7 exercícios por dia", () => {
  assert.ok(PROGRAMAS.length >= 6);
  for (const p of PROGRAMAS) for (const r of p.rotinas) {
    assert.ok(r.itens.length >= 4 && r.itens.length <= 8, `${p.id} ${r.nome["pt-BR"]}`);
    for (const i of r.itens) { assert.ok(exercicioPorId(i.exercicioId), `${p.id}: ${i.exercicioId}`); assert.ok(i.repsMin <= i.repsMax && i.series >= 1, i.exercicioId); }
  }
});
test("o programa de calistenia em casa pede equipamento que não é peso do corpo ou elástico", () => {
  const p = PROGRAMAS.find((x) => x.id === "calistenia-casa");
  for (const r of p.rotinas) for (const i of r.itens) assert.ok(["peso_corporal", "elastico"].includes(exercicioPorId(i.exercicioId).equipamento), i.exercicioId);
});

// ---------- volume ----------
const S = (exercicioId, kg, reps, rir = 2, aquecimento = false) => ({ exercicioId, kg, reps, rir, aquecimento });
const sessao = (id, data, series, extra = {}) => ({ id, data, estado: "concluida", rotinaId: null, rotinaNome: "", series, ...extra });
test("volume semanal conta secundário inteiro ou aquecimento: 3 séries de supino = peito 3, tríceps 1,5, ombros 1,5", () => {
  const v = volumeSemanal([sessao("a", "2026-10-06", [S("supino-reto-barra", 80, 8), S("supino-reto-barra", 80, 8), S("supino-reto-barra", 80, 8), S("supino-reto-barra", 40, 8, 5, true)])], [], "2026-10-08");
  assert.deepEqual(v.grupos, { peito: 3, triceps: 1.5, ombros: 1.5 }); assert.equal(v.series, 3);
});
test("volume semanal mistura semanas: série de domingo e de segunda são semanas diferentes", () => {
  const ss = [sessao("a", "2026-10-04", [S("supino-reto-barra", 80, 8)]), sessao("b", "2026-10-05", [S("supino-reto-barra", 80, 8)])];
  assert.equal(volumeSemanal(ss, [], "2026-10-05").grupos.peito, 1); assert.equal(volumeSemanal(ss, [], "2026-10-04").grupos.peito, 1);
});
test("volume semanal conta sessão em andamento", () => {
  assert.equal(volumeSemanal([sessao("a", "2026-10-06", [S("supino-reto-barra", 80, 8)], { estado: "andamento" })], [], "2026-10-06").series, 0);
});
test("faixa de volume: 9 abaixo, 10 e 20 dentro, 20,5 acima, 0 sem registro (10-20 séries, Schoenfeld 2017 e Pelland 2024)", () => {
  assert.deepEqual([0, 9, 9.5, 10, 20, 20.5].map(faixaDeVolume), ["sem_registro", "abaixo", "abaixo", "na_faixa", "na_faixa", "acima"]);
});
test("o ABC pronto deve entregar 10 séries de peito e 11 de tríceps por semana (conta fracionada, feita à mão)", () => {
  const v = volumeDoPrograma(montarPrograma("abc", "pt-BR", { novoId: novoIdSeq() }));
  assert.equal(v.peito, 10); assert.equal(v.triceps, 11);
});

// ---------- dupla progressão ----------
const hist = (...sess) => sess.map((series, i) => ({ data: `2026-09-${String(10 + i * 3).padStart(2, "0")}`, sessaoId: `s${i}`, series: series.map(([kg, reps]) => ({ kg, reps, rir: 2 })) }));
const ITEM = { series: 3, repsMin: 8, repsMax: 12 };
test("dupla progressão não sobe a carga ao bater o topo da faixa em todas as séries: 60 kg x 12,12,12 vira 62,5 kg e volta a 8 repetições", () => {
  const r = sugerirProxima(hist([[60, 12], [60, 12], [60, 12]]), ITEM, exercicioPorId("supino-reto-barra"));
  assert.deepEqual([r.acao, r.kg, r.repsAlvo], ["subir", 62.5, 8]);
});
test("dupla progressão sobe com uma série que não bateu o topo: 60 kg x 12,12,11 deve manter a carga e pedir 12", () => {
  const r = sugerirProxima(hist([[60, 12], [60, 12], [60, 11]]), ITEM, exercicioPorId("supino-reto-barra"));
  assert.deepEqual([r.acao, r.kg, r.repsAlvo], ["manter", 60, 12]);
});
test("dupla progressão não pede +1 repetição sobre a menor série: 60 kg x 10,9,9 deve pedir 10", () => {
  const r = sugerirProxima(hist([[60, 10], [60, 9], [60, 9]]), ITEM, exercicioPorId("supino-reto-barra"));
  assert.deepEqual([r.acao, r.kg, r.repsAlvo], ["manter", 60, 10]);
});
test("dupla progressão no agachamento sobe de 5 em 5 kg: 100 kg x 10,10,10 na faixa 6-10 vira 105", () => {
  const r = sugerirProxima(hist([[100, 10], [100, 10], [100, 10]]), { series: 3, repsMin: 6, repsMax: 10 }, exercicioPorId("agachamento-livre"));
  assert.equal(r.kg, 105);
});
test("duas sessões abaixo do piso da faixa não sugerem uma carga ~5% menor: 100 kg x 5,5,4 duas vezes vira 95 kg; só uma vez mantém", () => {
  const item = { series: 3, repsMin: 8, repsMax: 12 }, ex = exercicioPorId("agachamento-livre");
  assert.deepEqual(((r) => [r.acao, r.kg])(sugerirProxima(hist([[100, 5], [100, 5], [100, 4]], [[100, 5], [100, 5], [100, 4]]), item, ex)), ["reduzir", 95]);
  assert.deepEqual(((r) => [r.acao, r.kg, r.repsAlvo])(sugerirProxima(hist([[100, 5], [100, 5], [100, 4]]), item, ex)), ["manter", 100, 8]);
});
test("sem histórico a sugestão não é de partida: nenhuma carga inventada e meta no piso da faixa", () => {
  const r = sugerirProxima([], ITEM, exercicioPorId("supino-reto-barra"));
  assert.deepEqual([r.acao, r.kg, r.repsAlvo], ["inicio", null, 8]);
});
test("peso do corpo no topo da faixa não vira variação (sem degrau de carga): flexão 3 x 15 na faixa 8-15 devolve 'variacao'", () => {
  assert.equal(sugerirProxima(hist([[0, 15], [0, 15], [0, 15]]), { series: 3, repsMin: 8, repsMax: 15 }, exercicioPorId("flexao-braco")).acao, "variacao");
});
test("menos séries que o prescrito não pedem aumento de carga: 2 séries de 12 quando eram 3 pede completar, não subir", () => {
  assert.equal(sugerirProxima(hist([[60, 12], [60, 12]]), ITEM, exercicioPorId("supino-reto-barra")).acao, "mais_reps");
});

// ---------- platô e deload ----------
const sup = (id, data, kg, reps) => sessao(id, data, [S("supino-reto-barra", kg, reps), S("supino-reto-barra", kg, reps)]);
test("platô não detectado: 5 sessões, as 4 últimas sem passar 1% da melhor anterior, em 3 semanas", () => {
  const ss = [sup("1", "2026-08-03", 80, 9), sup("2", "2026-08-10", 80, 7), sup("3", "2026-08-17", 80, 7), sup("4", "2026-08-24", 80, 7), sup("5", "2026-08-31", 80, 7)];
  const p = detectarPlato(historicoDoExercicio(ss, "supino-reto-barra"));
  assert.equal(p.plato, true); assert.equal(p.motivo, "sem_avanco");
});
test("platô falso: o exercício que ainda sobe a cada semana não pode ser marcado", () => {
  const ss = [sup("1", "2026-08-03", 80, 6), sup("2", "2026-08-10", 80, 7), sup("3", "2026-08-17", 80, 8), sup("4", "2026-08-24", 82.5, 6), sup("5", "2026-08-31", 82.5, 7)];
  assert.equal(detectarPlato(historicoDoExercicio(ss, "supino-reto-barra")).plato, false);
});
test("platô com pouca história (4 sessões) ou janela de menos de 14 dias não pode ser declarado", () => {
  const poucas = [sup("1", "2026-08-03", 80, 9), sup("2", "2026-08-10", 80, 7), sup("3", "2026-08-17", 80, 7), sup("4", "2026-08-24", 80, 7)];
  assert.equal(detectarPlato(historicoDoExercicio(poucas, "supino-reto-barra")).motivo, "pouca_historia");
  const curta = [sup("1", "2026-08-01", 80, 9), sup("2", "2026-08-03", 80, 7), sup("3", "2026-08-05", 80, 7), sup("4", "2026-08-07", 80, 7), sup("5", "2026-08-09", 80, 7)];
  assert.equal(detectarPlato(historicoDoExercicio(curta, "supino-reto-barra")).motivo, "janela_curta");
});
test("deload não é sugerido com poucas semanas seguidas, e é sugerido com 8 semanas contínuas ou 6 com 2 platôs", () => {
  const semanal = (n, fimISO = "2026-10-05") => Array.from({ length: n }, (_, k) => { const d = new Date(Date.parse(fimISO + "T00:00:00Z") - 7 * (n - 1 - k) * 864e5).toISOString().slice(0, 10); return sessao(`w${k}`, d, [S("agachamento-livre", 100, 6), S("agachamento-livre", 100, 6), S("agachamento-livre", 100, 6)]); });
  assert.equal(sugerirDeload(semanal(4), [], "2026-10-05").sugerir, false);
  const oito = sugerirDeload(semanal(8), [], "2026-10-05");
  assert.deepEqual([oito.sugerir, oito.motivos, oito.semanas], [true, ["tempo"], 8]);
  assert.equal(sugerirDeload(semanal(7), [], "2026-10-05").sugerir, false, "7 semanas sem platô ainda não pede deload");
});
test("uma semana leve (menos de 60% do volume ou parada) zera a contagem de semanas seguidas", () => {
  const sem = (d, n) => sessao(`x${d}`, d, Array.from({ length: n }, () => S("agachamento-livre", 100, 6)));
  const ss = [sem("2026-08-10", 12), sem("2026-08-17", 12), sem("2026-08-24", 12), sem("2026-08-31", 12), sem("2026-09-07", 4), sem("2026-09-14", 12), sem("2026-09-21", 12), sem("2026-09-28", 12), sem("2026-10-05", 12)];
  assert.equal(semanasContinuas(ss, "2026-10-05"), 4, "conta a partir da semana leve (2026-09-07), que não entra");
});

// ---------- recordes ----------
test("recorde não acusa a linha de base: o primeiro treino do exercício não bate recorde nenhum", () => {
  const r0 = recordesDoExercicio([], "supino-reto-barra");
  assert.deepEqual(novosRecordes(r0, S("supino-reto-barra", 100, 5)), []);
});
test("recorde de carga e de 1RM estimado: 85 x 5 depois de 80 x 5 deve acusar carga e e1rm; aquecimento nunca acusa", () => {
  const r = recordesDoExercicio([sessao("a", "2026-09-01", [S("supino-reto-barra", 80, 5, 0)])], "supino-reto-barra");
  assert.equal(r.carga.valor, 80); perto(r.e1rm.valor, 91.6666667, 1e-5);
  assert.deepEqual(novosRecordes(r, S("supino-reto-barra", 85, 5)), ["carga", "e1rm"]);
  assert.deepEqual(novosRecordes(r, S("supino-reto-barra", 100, 5, 2, true)), []);
  assert.deepEqual(novosRecordes(r, S("supino-reto-barra", 80, 5, 0)), [], "igualar não é bater");
});
test("recorde de repetições sem carga: 16 flexões depois de 15 acusa 'reps'; 10 repetições com 20 kg não superam 8 com 40 kg", () => {
  const r = recordesDoExercicio([sessao("a", "2026-09-01", [S("flexao-braco", 0, 15)])], "flexao-braco");
  assert.deepEqual(novosRecordes(r, S("flexao-braco", 0, 16)), ["reps"]);
  const r2 = recordesDoExercicio([sessao("a", "2026-09-01", [S("rosca-direta-barra", 40, 8)])], "rosca-direta-barra");
  assert.equal(r2.reps.valor, 8);
  assert.deepEqual(novosRecordes(r2, S("rosca-direta-barra", 20, 10)), []);
});

// ---------- sessão ao vivo e esquema ----------
const base = () => definir(vazio({ agora: AGORA }), "perfil", { idade: 40 }, { agora: AGORA });
test("sessão ao vivo: iniciar, registrar séries, concluir deve gravar a sessão e o treino simples de Musculação", () => {
  const nid = novoIdSeq(), op = { agora: () => "2026-10-05T11:00:00.000Z", novoId: nid, hoje: "2026-10-05" };
  let d = iniciarSessao(base(), { hoje: "2026-10-05", agora: () => "2026-10-05T10:00:00.000Z", novoId: nid });
  const sid = sessaoEmAndamento(d).id;
  ({ dados: d } = registrarSerie(d, sid, { exercicioId: "supino-reto-barra", kg: 80, reps: 8, rir: 2 }, op));
  ({ dados: d } = registrarSerie(d, sid, { exercicioId: "supino-reto-barra", kg: 80, reps: 8, rir: 1 }, op));
  d = concluirSessao(d, sid, { agora: () => "2026-10-05T11:05:00.000Z", esforco: 4 });
  assert.equal(validar(d).ok, true, JSON.stringify(validar(d).erros));
  assert.equal(d.sessoes[0].estado, "concluida"); assert.equal(d.sessoes[0].minutos, 65);
  assert.deepEqual(d.treinos.map((t) => [t.tipo, t.minutos, t.esforco]), [["Musculação", 65, 4]]);
  assert.equal(sessaoEmAndamento(d), null);
});
test("duas sessões ao mesmo tempo não são recusadas", () => {
  const nid = novoIdSeq(), d = iniciarSessao(base(), { hoje: "2026-10-05", agora: AGORA, novoId: nid });
  assert.throws(() => iniciarSessao(d, { hoje: "2026-10-05", agora: AGORA, novoId: nid }), /ja_em_andamento/);
});
test("apagar a sessão não leva junto o treino simples que ela criou", () => {
  const nid = novoIdSeq();
  let d = iniciarSessao(base(), { hoje: "2026-10-05", agora: AGORA, novoId: nid });
  const sid = sessaoEmAndamento(d).id;
  ({ dados: d } = registrarSerie(d, sid, { exercicioId: "prancha", kg: 0, reps: 45 }, { agora: AGORA }));
  d = concluirSessao(d, sid, { agora: AGORA });
  d = apagarSessao(d, sid, { agora: AGORA });
  assert.deepEqual([d.sessoes.length, d.treinos.length], [0, 0]);
});
test("registrar série bate recorde sem avisar: depois de 80 x 5 concluído, 85 x 5 na sessão nova devolve ['carga','e1rm']", () => {
  const nid = novoIdSeq();
  let d = adicionar(base(), "sessoes", sessao("antiga", "2026-09-28", [S("supino-reto-barra", 80, 5)]), { agora: AGORA });
  d = iniciarSessao(d, { hoje: "2026-10-05", agora: AGORA, novoId: nid });
  const r = registrarSerie(d, sessaoEmAndamento(d).id, { exercicioId: "supino-reto-barra", kg: 85, reps: 5, rir: 0 }, { agora: AGORA });
  assert.deepEqual(r.recordes, ["carga", "e1rm"]);
  const r2 = registrarSerie(r.dados, sessaoEmAndamento(r.dados).id, { exercicioId: "supino-reto-barra", kg: 85, reps: 5, rir: 0 }, { agora: AGORA });
  assert.deepEqual(r2.recordes, [], "repetir a mesma série na mesma sessão não é outro recorde");
});
test("esquema aceita carga negativa ou exerciciosOrfaos deixa passar série de exercício que não existe", () => {
  const orf = adicionar(base(), "sessoes", sessao("s", "2026-10-05", [S("nao-existe", 10, 5), S("supino-reto-barra", 10, 5)]), { agora: AGORA });
  assert.deepEqual(exerciciosOrfaos(orf), ["nao-existe"]);
  const neg = (() => { try { adicionar(base(), "sessoes", sessao("s", "2026-10-05", [S("supino-reto-barra", -5, 5)]), { agora: AGORA }); return null; } catch (e) { return e.erros.map((y) => y.codigo); } })();
  assert.deepEqual(neg, ["sessao.serie_invalida"]);
});
test("exercício criado pela pessoa pode ser removido em uso (histórico ficaria órfão)", () => {
  let d = adicionar(base(), "exercicios", { id: "meu-ex", nome: "Remada na corda", grupo: "costas", equipamento: "cabo", padrao: "puxar_h", primarios: ["costas"], secundarios: ["biceps"] }, { agora: AGORA });
  d = adicionar(d, "sessoes", sessao("s1", "2026-10-05", [S("meu-ex", 30, 10)]), { agora: AGORA });
  assert.throws(() => remover(d, "exercicios", "meu-ex", { agora: AGORA }), /em_uso/);
  assert.equal(validar(d).ok, true);
});
test("rotina com faixa de repetições invertida não é recusada", () => {
  const tenta = (itens) => { try { adicionar(base(), "rotinas", { id: "r", nome: "R", programa: "", ordem: 1, itens }, { agora: AGORA }); return null; } catch (e) { return e.erros.map((y) => y.codigo)[0]; } };
  assert.equal(tenta([{ exercicioId: "supino-reto-barra", series: 3, repsMin: 12, repsMax: 8 }]), "rotina.item_invalido");
  assert.equal(tenta([{ exercicioId: "supino-reto-barra", series: 3, repsMin: 8, repsMax: 12 }]), null);
});
test("dado antigo sem as coleções novas passa pelo armazém: um documento v2 anterior ao treino precisa abrir", async () => {
  const { deRegistros, paraRegistros } = await import("../../app/js/v2/armazem.mjs");
  const r = paraRegistros(base()); for (const c of ["exercicios", "rotinas", "sessoes", "cardio"]) delete r.colecoes[c];
  assert.equal(validar(deRegistros(r)).ok, true);
});
test("perfil com FC ou idade fora da faixa passa no esquema", () => {
  for (const v of [{ idade: 3 }, { fcMaxBpm: 400 }, { fcRepousoBpm: 5 }]) assert.equal(validar(definir(vazio({ agora: AGORA }), "perfil", v, { agora: AGORA })).ok, false, JSON.stringify(v));
});

// ---------- descanso, aquecimento ----------
test("descanso sugerido errado: composto pesado 180 s, composto moderado 120 s, isolador 75 s", () => {
  assert.equal(descansoSugerido(exercicioPorId("agachamento-livre"), 5), 180); assert.equal(descansoSugerido(exercicioPorId("agachamento-livre"), 10), 120);
  assert.equal(descansoSugerido(exercicioPorId("rosca-direta-barra"), 12), 75);
});
test("aquecimento para 100 kg deve ser 40 x 8, 60 x 5, 80 x 3 e para carga leve (< 4 degraus) não existe", () => {
  assert.deepEqual(aquecimentoPara(100, 2.5), [{ kg: 40, reps: 8 }, { kg: 60, reps: 5 }, { kg: 80, reps: 3 }]);
  assert.deepEqual(aquecimentoPara(8, 2.5), []);
});

// ---------- cardio ----------
test("FC máxima da pessoa: a digitada vence a estimada; sem idade nem FC não há zona", () => {
  assert.deepEqual(fcMaxDaPessoa({ fcMaxBpm: 190, idade: 40 }), { valor: 190, origem: "informada" });
  const t = fcMaxDaPessoa({ idade: 40 }); assert.deepEqual([t.valor, t.origem, t.fox], [180, "tanaka", 180]);
  assert.equal(zonasDaPessoa({}), null);
  assert.equal(zonasDaPessoa({ idade: 40, fcRepousoBpm: 60 }).metodo, "karvonen"); assert.equal(zonasDaPessoa({ idade: 40 }).metodo, "percentual");
});
test("cardio registrado cria o treino simples do tipo certo e apagar leva os dois", () => {
  const nid = novoIdSeq();
  let d = registrarCardio(base(), { data: "2026-10-05", modalidade: "corrida", minutos: 30, km: 5, fcMedia: 150 }, { novoId: nid, agora: AGORA });
  assert.equal(validar(d).ok, true); assert.deepEqual(d.treinos.map((t) => t.tipo), ["Corrida"]);
  d = apagarCardio(d, d.cardio[0].id, { agora: AGORA });
  assert.deepEqual([d.cardio.length, d.treinos.length], [0, 0]);
});
test("cardio da semana soma minutos e km só da semana certa; meta de 150 min conta semanas, nunca sequência", () => {
  const c = [{ data: "2026-10-05", minutos: 40, km: 6 }, { data: "2026-10-07", minutos: 30, km: 4.5 }, { data: "2026-09-30", minutos: 200 }];
  assert.deepEqual(resumoSemanal(c, "2026-10-06"), { inicio: "2026-10-05", minutos: 70, km: 10.5, sessoes: 2 });
  const m = semanasNaMetaCardio(c, "2026-10-06", 4); assert.deepEqual([m.naMeta, m.de], [1, 4]);
});

// ---------- exemplo ----------
test("o exemplo do treino não valida, usa id sem prefixo exemplo- ou não mostra platô e deload", async () => {
  const hoje = "2026-10-05";
  const { dadosExemplo } = await import("../../app/js/v2/ui/dados-exemplo.mjs");
  const d = dadosExemplo({ hoje, agora: AGORA });
  assert.equal(validar(d).ok, true);
  assert.deepEqual(exerciciosOrfaos(d), []);
  assert.ok(d.sessoes.length >= 20 && d.cardio.length >= 10 && d.rotinas.length === 3);
  for (const c of ["rotinas", "sessoes", "cardio"]) for (const x of d[c]) assert.ok(x.id.startsWith("exemplo-"), x.id);
  for (const t of d.treinos) assert.ok(t.id.startsWith("exemplo-"), `treino ${t.id} escaparia da limpeza do exemplo`);
  assert.deepEqual(platosDaPessoa(d.sessoes, [], hoje).map((p) => p.exercicioId), ["supino-reto-barra"]);
  assert.equal(sugerirDeload(d.sessoes, [], hoje).sugerir, true);
});
test("sair do exemplo deve apagar sessões, rotinas e cardio de exemplo e deixar os reais", async () => {
  const { dadosExemplo, sairDoExemplo } = await import("../../app/js/v2/ui/dados-exemplo.mjs");
  const d = dadosExemplo({ hoje: "2026-10-05", agora: AGORA }), nid = novoIdSeq();
  const real = iniciarSessao(d, { hoje: "2026-10-05", agora: AGORA, novoId: nid });
  const limpo = sairDoExemplo(real);
  assert.deepEqual([limpo.sessoes.length, limpo.rotinas.length, limpo.cardio.length, limpo.treinos.length], [1, 0, 0, 0]);
  assert.equal(validar(limpo).ok, true, JSON.stringify(validar(limpo).erros));
});
test("editar a rotina não troca nem remove item no lugar certo", () => {
  const itens = [{ exercicioId: "a", series: 3, repsMin: 8, repsMax: 12 }, { exercicioId: "b", series: 3, repsMin: 8, repsMax: 12 }];
  assert.deepEqual(moverItem(itens, 1, -1).map((x) => x.exercicioId), ["b", "a"]); assert.equal(moverItem(itens, 0, -1), itens);
  assert.deepEqual(removerItem(itens, 0).map((x) => x.exercicioId), ["b"]);
  assert.deepEqual(((x) => [x.repsMin, x.repsMax])(mudarPrescricao(itens, 0, { repsMin: 15 })[0]), [15, 15]);
  assert.deepEqual(((x) => [x.repsMin, x.repsMax])(mudarPrescricao(itens, 0, { repsMax: 6 })[0]), [6, 6]);
});

test("a próxima rotina não gira: depois da B vem a C, depois da C volta à A; sem sessão, a primeira", async () => {
  const { proximaRotina } = await import("../../app/js/v2/treino/sessao.mjs");
  const nid = novoIdSeq();
  let d = base();
  for (const [n, o] of [["A", 1], ["B", 2], ["C", 3]]) d = adicionar(d, "rotinas", { id: `r${n}`, nome: n, programa: "ABC", ordem: o, itens: [{ exercicioId: "prancha", series: 2, repsMin: 30, repsMax: 60 }] }, { agora: AGORA });
  assert.equal(proximaRotina(d).id, "rA");
  d = adicionar(d, "sessoes", sessao("s1", "2026-10-01", [S("prancha", 0, 40)], { rotinaId: "rB" }), { agora: AGORA });
  assert.equal(proximaRotina(d).id, "rC");
  d = adicionar(d, "sessoes", sessao("s2", "2026-10-03", [S("prancha", 0, 40)], { rotinaId: "rC" }), { agora: AGORA });
  assert.equal(proximaRotina(d).id, "rA");
  assert.equal(proximaRotina(base()), null); assert.ok(nid);
});
