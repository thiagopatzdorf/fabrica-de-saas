// Nutrição do Fitrich: fórmulas com valor conhecido calculado à mão, base de alimentos íntegra, diário, tendência
// e o esquema aditivo. Cada nome descreve a falha que o teste pega. Node 18, sem dependência.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { ALIMENTOS, BUSCA, PORCOES, POPULARES, TOTAL } from "../../app/js/v2/nutricao/base-alimentos.mjs";
import { criarBase, gramasDaPorcao, normalizar, nutrientes } from "../../app/js/v2/nutricao/alimentos.mjs";
import * as energia from "../../app/js/v2/nutricao/energia.mjs";
import { tendenciaPeso, taxaSemanal, sugerirAjuste } from "../../app/js/v2/nutricao/tendencia.mjs";
import * as diario from "../../app/js/v2/nutricao/diario.mjs";
import { ErroEsquema, NIVEIS_ATIVIDADE, OBJETIVOS_NUTRICAO, REFEICOES_NUTRICAO, adicionar, definir, validar, vazio } from "../../app/js/v2/esquema.mjs";
import { somarDias } from "../../app/js/datas.mjs";

const agora = () => "2026-10-05T12:00:00.000Z";
let seq = 0;
const novoId = () => `r-${++seq}`;
const base = criarBase({ ALIMENTOS, BUSCA, PORCOES, POPULARES });
const ARQ = new URL("../../app/js/v2/nutricao/base-alimentos.mjs", import.meta.url);

// ---------- base de alimentos ----------
test("a base embarcada tem pelo menos 300 alimentos e o total declarado confere", () => {
  assert.ok(ALIMENTOS.length >= 300, `só ${ALIMENTOS.length}`);
  assert.equal(TOTAL, ALIMENTOS.length);
  assert.equal(new Set(ALIMENTOS.map((l) => l[0])).size, ALIMENTOS.length, "id repetido");
});

test("a base cabe no orçamento: até 70 KB crus e 25 KB comprimidos (carrega sob demanda)", () => {
  const bruto = readFileSync(ARQ);
  assert.ok(bruto.length <= 70_000, `${bruto.length} bytes crus`);
  assert.ok(gzipSync(bruto).length <= 25_000, `${gzipSync(bruto).length} bytes gzip`);
});

test("energia de cada alimento fecha com 4P+4C+9G (Atwater) dentro de 25% + 15 kcal, exceto álcool e fermento", () => {
  const ISENTOS = new Set([220, 472, 474, 513]); // limão (fibra), aguardente e cerveja (álcool), fermento químico
  for (const [id, nome, , kcal, p, c, g] of ALIMENTOS) {
    if (ISENTOS.has(id)) continue;
    const atwater = 4 * p + 4 * c + 9 * g;
    assert.ok(Math.abs(kcal - atwater) <= 0.25 * kcal + 15, `${id} ${nome}: ${kcal} kcal declaradas, ${atwater.toFixed(0)} pelas macros`);
  }
});

test("nenhum alimento tem valor negativo, macro absurdo (>100 g por 100 g) ou nome vazio", () => {
  for (const [id, nome, cat, kcal, p, c, g, f] of ALIMENTOS) {
    assert.ok(nome.trim().length > 2, `nome vazio em ${id}`);
    assert.ok(Number.isInteger(cat) && cat >= 1 && cat <= 15, `categoria de ${id}`);
    for (const v of [kcal, p, c, g]) assert.ok(v >= 0, `${id} negativo`);
    assert.ok(p <= 100 && c <= 100 && g <= 100 && p + c + g <= 101, `${id} ${nome}: macros somam ${p + c + g} g por 100 g`);
    assert.ok(kcal <= 900, `${id}: ${kcal} kcal por 100 g passa do máximo físico (gordura pura = 900)`);
    assert.ok(f == null || (f >= 0 && f <= 100), `${id} fibra`);
  }
});

test("pratos compostos (origem 2) são a SOMA ponderada dos itens e não um número digitado", () => {
  // Arroz com feijão: 150 g de arroz tipo 1 cozido (128 kcal/100 g) + 100 g de feijão carioca cozido (76 kcal/100 g)
  const arroz = ALIMENTOS.find((l) => l[0] === 3), feijao = ALIMENTOS.find((l) => l[0] === 561), prato = ALIMENTOS.find((l) => l[0] === 2004);
  assert.equal(arroz[3], 128); assert.equal(feijao[3], 76);
  // (150*1,28 + 100*0,76) = 192 + 76 = 268 kcal em 250 g -> 107,2 por 100 g -> 107
  assert.equal(prato[3], 107);
  assert.equal(prato[8], 2);
  assert.deepEqual(PORCOES["2004"], [["prato", 250]]);
});

test("toda porção caseira e todo apelido apontam para um alimento que existe", () => {
  const ids = new Set(ALIMENTOS.map((l) => l[0]));
  for (const k of Object.keys(PORCOES)) { assert.ok(ids.has(Number(k)), `porção de ${k}`); for (const [chave, g] of PORCOES[k]) assert.ok(/^[a-z_]+$/.test(chave) && g > 0, `${k} ${chave}`); }
  for (const id of POPULARES) assert.ok(ids.has(id), `popular ${id}`);
  for (const id of ids) assert.ok(typeof BUSCA[id] === "string" && BUSCA[id].length > 0, `sem texto de busca para ${id}`);
});

test("busca sem acento e sem caixa acha 'Açaí' por 'acai' e 'Pão de queijo' por 'pao de queijo'", () => {
  assert.match(base.buscar("ACAI")[0].nome, /Açaí/);
  assert.equal(base.buscar("pao de queijo")[0].id, 140);
  assert.equal(normalizar("  Feijão   PRETO "), "feijao preto");
});

test("buscar 'arroz' põe o arroz do prato (cozido, popular) antes do cru; 'rice' também acha", () => {
  assert.equal(base.buscar("arroz")[0].id, 3);
  assert.equal(base.buscar("rice")[0].id, 3);
  assert.equal(base.buscar("feijao preto")[0].id, 567);
  assert.equal(base.buscar("leite").some((a) => a.id === 1001), true, "leite integral vem do complemento USDA porque a TACO não traz energia dele");
});

test("busca vazia devolve os populares e busca sem resultado devolve lista vazia, não erro", () => {
  assert.equal(base.buscar("").length, 12);
  assert.deepEqual(base.buscar("zzzxqj"), []);
});

test("nutrientes de 200 g de arroz (128 kcal, 2,5 P, 28,1 C, 0,2 G, 1,6 fibra por 100 g) = 256 kcal, 5 P, 56,2 C, 0,4 G, 3,2 fibra", () => {
  const arroz = base.obter(3);
  assert.deepEqual(nutrientes(arroz, 200), { kcal: 256, p: 5, c: 56.2, g: 0.4, fibra: 3.2 });
  assert.equal(gramasDaPorcao(arroz, "colher_servir", 2), 100);
  assert.equal(gramasDaPorcao(arroz, "fatia"), null);
});

// ---------- energia ----------
test("Mifflin-St Jeor: homem 30 a 80 kg 180 cm = 1780; mulher 25 a 60 kg 165 cm = 1345 (1345,25)", () => {
  assert.equal(energia.tmbMifflin({ sexo: "m", kg: 80, cm: 180, idade: 30 }).kcal, 10 * 80 + 6.25 * 180 - 5 * 30 + 5); // 1780
  assert.equal(energia.tmbMifflin({ sexo: "m", kg: 80, cm: 180, idade: 30 }).kcal, 1780);
  assert.equal(energia.tmbMifflin({ sexo: "f", kg: 60, cm: 165, idade: 25 }).kcal, 1345);
});

test("sem sexo informado a TMB usa o ponto médio (−78) e se declara estimada: 70 kg 170 cm 40 a = 1484,5 -> 1485", () => {
  const t = energia.tmbMifflin({ sexo: "", kg: 70, cm: 170, idade: 40 });
  assert.deepEqual(t, { kcal: 1485, estimado: true });
});

test("a fórmula adulta recusa menor de 18 anos e medidas fora da faixa em vez de inventar um número", () => {
  assert.equal(energia.tmbMifflin({ sexo: "m", kg: 60, cm: 170, idade: 17 }), null);
  assert.equal(energia.tmbMifflin({ sexo: "m", kg: 10, cm: 170, idade: 30 }), null);
  assert.equal(energia.tmbMifflin({ sexo: "m", kg: 60, cm: 20, idade: 30 }), null);
  assert.equal(energia.metaNutricional({ sexo: "m", kg: 60, cm: 170, idade: 17 }).codigo, "nutricao.menor_de_18");
});

test("idade em anos completos: nascido em 1990-06-15 tem 35 em 2026-06-14 e 36 em 2026-06-15", () => {
  assert.equal(energia.idadeEm("1990-06-15", "2026-06-14"), 35);
  assert.equal(energia.idadeEm("1990-06-15", "2026-06-15"), 36);
  assert.equal(energia.idadeEm(null, "2026-06-15"), null);
  assert.equal(energia.idadeEm("2030-01-01", "2026-06-15"), null);
});

test("gasto total = TMB × fator: 1780 × 1,55 = 2759 e 1345 × 1,2 = 1614", () => {
  assert.equal(energia.gastoTotal(1780, "moderado"), 2759);
  assert.equal(energia.gastoTotal(1345, "sedentario"), 1614);
  assert.equal(energia.gastoTotal(1345, "inexistente"), null);
});

test("meta de perder 0,5% por semana: homem 80 kg moderado = 2759 − 440 = 2319 kcal, proteína 152 g, gordura 71 g, carbo 268 g", () => {
  const m = energia.metaNutricional({ sexo: "m", kg: 80, cm: 180, idade: 30, atividade: "moderado", objetivo: "perder" });
  assert.equal(m.tmb, 1780); assert.equal(m.get, 2759); assert.equal(m.alvoKcal, 2319); // 0,5% de 80 = 0,4 kg/sem × 1100
  assert.equal(m.kgPorSemana, -0.4); assert.equal(m.limitadoPor, null);
  assert.deepEqual([m.proteina.alvoG, m.proteina.minG, m.proteina.maxG], [152, 128, 176]); // 1,9 / 1,6 / 2,2 g/kg × 80
  assert.deepEqual(m.gordura, { g: 71, pct: 27.6 }); // 2319 × 0,275 / 9 = 70,86
  assert.deepEqual(m.carbo, { g: 268, pct: 46.2 }); // (2319 − 608 − 639) / 4
  assert.equal(m.fibraG, 32); // 14 g por 1000 kcal × 2,319
  assert.equal(m.aguaMl, 2000);
});

test("manter = gasto total, sem déficit nem superávit", () => {
  const m = energia.metaNutricional({ sexo: "m", kg: 80, cm: 180, idade: 30, atividade: "moderado", objetivo: "manter" });
  assert.equal(m.alvoKcal, 2759); assert.equal(m.kgPorSemana, 0);
  assert.deepEqual([m.proteina.gKgMin, m.proteina.gKgMax], [1.4, 2.0]);
});

test("ganhar 0,25% por semana: 80 kg = +0,2 kg/sem = +220 kcal sobre 2759 = 2979", () => {
  const m = energia.metaNutricional({ sexo: "m", kg: 80, cm: 180, idade: 30, atividade: "moderado", objetivo: "ganhar" });
  assert.equal(m.alvoKcal, 2979); assert.equal(m.kgPorSemana, 0.2);
});

test("ritmo pedido acima do teto é cortado: perder 3% por semana vira 1% (0,8 kg) e nunca passa de 20% de déficit", () => {
  const m = energia.metaNutricional({ sexo: "m", kg: 80, cm: 180, idade: 30, atividade: "moderado", objetivo: "perder", ritmoPct: 3 });
  // 1% de 80 = 0,8 kg × 1100 = 880 -> 2759 − 880 = 1879; 20% de 2759 = 551,8 -> piso do déficit 2207,2
  assert.equal(m.alvoKcal, 2207); assert.equal(m.limitadoPor, "deficit_max");
});

test("o piso de calorias vale: mulher de 60 kg 150 cm 60 a sedentária pedindo 1%/sem cai em 1200, não em 632", () => {
  // TMB 600+937,5−300−161 = 1076,5 -> 1077; GET 1077 × 1,2 = 1292; alvo bruto 1292 − 660 = 632
  const m = energia.metaNutricional({ sexo: "f", kg: 60, cm: 150, idade: 60, atividade: "sedentario", objetivo: "perder", ritmoPct: 1 });
  assert.equal(m.get, 1292); assert.equal(m.alvoKcal, 1200); assert.equal(m.limitadoPor, "piso");
});

test("corpo pequeno cujo piso passa do gasto não recebe déficit: só mantém e avisa", () => {
  // 45 kg 150 cm 50 a: TMB 976,5 -> 977; GET 1172 < piso 1200
  const m = energia.metaNutricional({ sexo: "f", kg: 45, cm: 150, idade: 50, atividade: "sedentario", objetivo: "perder" });
  assert.equal(m.get, 1172); assert.equal(m.alvoKcal, 1172); assert.equal(m.limitadoPor, "piso_acima_do_gasto");
});

test("faixa de proteína por objetivo e atividade: RDA 0,8-1,2 sedentário, 1,4-2,0 quem treina, 1,6-2,2 em déficit ou ganho", () => {
  assert.deepEqual(energia.faixaProteinaGKg({ objetivo: "manter", atividade: "sedentario" }), [0.8, 1.2]);
  assert.deepEqual(energia.faixaProteinaGKg({ objetivo: "manter", atividade: "leve" }), [1.0, 1.6]);
  assert.deepEqual(energia.faixaProteinaGKg({ objetivo: "manter", atividade: "sedentario", treinaForca: true }), [1.4, 2.0]);
  assert.deepEqual(energia.faixaProteinaGKg({ objetivo: "perder", atividade: "sedentario" }), [1.6, 2.2]);
  assert.deepEqual(energia.faixaProteinaGKg({ objetivo: "ganhar", atividade: "alto" }), [1.6, 2.2]);
});

test("com IMC ≥ 30 a proteína usa o peso ajustado: 100 kg 170 cm -> 72,25 + 25% de 27,75 = 79,2 kg", () => {
  assert.equal(energia.pesoReferencia(100, 170), 79.2);
  assert.equal(energia.pesoReferencia(80, 180), 80);
});

test("proteína nunca passa de 35% da energia, mesmo se a pessoa pedir 3 g/kg", () => {
  const m = energia.metaNutricional({ sexo: "m", kg: 100, cm: 170, idade: 40, atividade: "sedentario", objetivo: "perder", proteinaGKg: 3 });
  assert.equal(m.get, 2242); assert.equal(m.alvoKcal, 1794); // piso do déficit: 80% de 2242 = 1793,6
  assert.equal(m.proteina.alvoG, 156); // floor(1794 × 0,35 / 4) = 156, em vez de 3 × 79,2 = 238
  assert.ok(m.avisos.includes("proteina_limitada_pela_energia"));
  assert.ok(m.proteina.alvoG * 4 <= 1794 * 0.35);
});

test("água de bebidas: EFSA 2,5 L (homem) e 2,0 L (mulher) de água total × 80% = 2000 e 1600 ml", () => {
  assert.equal(energia.aguaMl("m"), 2000); assert.equal(energia.aguaMl("f"), 1600); assert.equal(energia.aguaMl(""), 1800);
});

test("os macros fecham com a energia da meta (±1%) em cenários variados", () => {
  for (const [sexo, kg, cm, idade, atividade, objetivo] of [["m", 80, 180, 30, "moderado", "perder"], ["f", 60, 165, 25, "leve", "manter"], ["f", 90, 160, 45, "sedentario", "perder"], ["m", 70, 175, 22, "alto", "ganhar"]]) {
    const m = energia.metaNutricional({ sexo, kg, cm, idade, atividade, objetivo });
    const soma = m.proteina.alvoG * 4 + m.carbo.g * 4 + m.gordura.g * 9;
    assert.ok(Math.abs(soma - m.alvoKcal) <= m.alvoKcal * 0.01 + 5, `${sexo} ${kg}: macros ${soma} vs ${m.alvoKcal}`);
    assert.ok(m.alvoKcal >= (sexo === "f" ? 1200 : 1500) || objetivo !== "perder", "piso");
  }
});

// ---------- tendência ----------
test("média móvel exponencial (10%): 80 -> 79 no dia 1 dá 79,9 e 78,9 no dia 3 (2 dias de gap, alfa 0,19) dá 79,71", () => {
  const s = tendenciaPeso([{ data: "2026-09-01", kg: 80 }, { data: "2026-09-02", kg: 79 }, { data: "2026-09-04", kg: 78.9 }]);
  assert.deepEqual(s.map((p) => p.tendencia), [80, 79.9, 79.71]);
});

test("duas pesagens no mesmo dia viram a média e uma pesagem fora do lugar mexe pouco na tendência", () => {
  assert.equal(tendenciaPeso([{ data: "2026-09-01", kg: 80 }, { data: "2026-09-01", kg: 81 }])[0].tendencia, 80.5);
  const s = tendenciaPeso([{ data: "2026-09-01", kg: 80 }, { data: "2026-09-02", kg: 82 }]); // +2 kg de água num dia
  assert.equal(s[1].tendencia, 80.2); // 80 + 0,1 × 2
});

// Série diária linear: peso = 80 − 0,1 d. A tendência tem fórmula fechada: e_d = a − b·d + 9b(1 − 0,9^d).
const serieLinear = (dias) => tendenciaPeso(Array.from({ length: dias }, (_, d) => ({ data: somarDias("2026-09-01", d), kg: Math.round((80 - 0.1 * d) * 100) / 100 })));
test("taxa semanal da tendência de uma queda de 0,1 kg/dia: a média atrasa e mostra −0,62 kg/sem, não −0,70 (fórmula fechada)", () => {
  // L_d = 0,9(L_{d-1} + b) => atraso 9b(1 − 0,9^d). Inclinação entre os dias 14 e 27 = −b + (9b/13)(0,9^14 − 0,9^27)
  // = −0,1 + 0,9 × 0,170618 / 13 = −0,088188 kg/dia -> ×7 = −0,617 -> −0,62
  const s = serieLinear(28), t = taxaSemanal(s, "2026-09-28");
  assert.equal(t.kgPorSemana, -0.62); assert.equal(t.pesagens, 14);
});

test("com menos de 6 pesagens na janela, ou menos de 21 dias de história, não há taxa (não se afirma tendência com pouco dado)", () => {
  assert.equal(taxaSemanal(serieLinear(28).filter((_, i) => i % 5 === 0), "2026-09-28"), null);
  assert.equal(taxaSemanal(serieLinear(15), "2026-09-15"), null);
});

const serieFixa = (kgSemana, dias = 28) => Array.from({ length: dias }, (_, d) => ({ data: somarDias("2026-09-01", d), kg: 80, tendencia: 80 + (kgSemana / 7) * d }));
const base80 = { hoje: "2026-09-28", alvoKcal: 2319, get: 2759, objetivo: "perder", sexo: "m", kgPorSemanaAlvo: -0.4, diasRegistrados: 12 };
test("perdendo mais rápido que o pedido (−0,62 contra −0,4): sugere COMER mais, +250 kcal (0,22 × 1100 = 242, arredondado a 25 = 250)", () => {
  const r = sugerirAjuste({ ...base80, serie: serieLinear(28) });
  assert.equal(r.tipo, "ajustar"); assert.equal(r.deltaKcal, 250); assert.equal(r.novoAlvo, 2569);
});

test("peso parado com meta de perder: o corte sugerido respeita o limite de 20% de déficit (−112, não −250)", () => {
  const r = sugerirAjuste({ ...base80, serie: serieFixa(0) });
  assert.equal(r.tipo, "ajustar"); assert.equal(r.novoAlvo, 2207); assert.equal(r.deltaKcal, -112);
});

test("diferença de até 0,1 kg/sem é 'no meio-termo' e não gera ajuste (−0,35 contra −0,4)", () => {
  assert.equal(sugerirAjuste({ ...base80, serie: serieFixa(-0.35) }).tipo, "no_meio_termo");
});

test("sugestão só a cada 14 dias e só com registro suficiente: 'cedo' e 'registro_insuficiente' não mexem na meta", () => {
  assert.deepEqual(sugerirAjuste({ ...base80, serie: serieFixa(0), ultimoAjusteEm: "2026-09-20" }), { tipo: "cedo", proximaEm: "2026-10-04" });
  assert.equal(sugerirAjuste({ ...base80, serie: serieFixa(0), diasRegistrados: 9 }).tipo, "registro_insuficiente");
  assert.equal(sugerirAjuste({ ...base80, serie: [] }).tipo, "sem_peso");
});

test("já no limite seguro: o corte pedido não passa e o resultado diz 'no_limite' em vez de fingir ajuste", () => {
  const r = sugerirAjuste({ ...base80, alvoKcal: 2207, serie: serieFixa(0) });
  assert.equal(r.tipo, "no_limite");
});

// ---------- diário ----------
const arroz = base.obter(3), frango = base.obter(410), ovo = base.obter(488);
const reg = (alimento, gramas, data, refeicao = "almoco") => diario.novoRegistro({ alimento, gramas, data, refeicao, id: novoId(), agora });

test("refeição sugerida pela hora: 7h café, 12h almoço, 16h lanche, 20h jantar, 23h ceia", () => {
  assert.deepEqual([7, 12, 16, 20, 23, 3].map(diario.refeicaoPorHora), ["cafe", "almoco", "lanche", "jantar", "ceia", "ceia"]);
});

test("registro guarda a foto dos macros: 150 g de arroz (128 kcal/100 g) = 192 kcal", () => {
  const r = reg(arroz, 150, "2026-10-05");
  assert.equal(r.kcal, 192); assert.equal(r.alimentoId, "3"); assert.equal(r.nome, "Arroz branco, cozido");
});

test("soma do dia exclui a água dos macros e soma a água em ml à parte; restante pode ser negativo sem virar erro", () => {
  const rs = [reg(arroz, 200, "2026-10-05"), reg(ovo, 100, "2026-10-05", "cafe"), diario.novoRegistroAgua({ ml: 300, data: "2026-10-05", id: novoId(), agora }), reg(arroz, 100, "2026-10-04")];
  const s = diario.somaDoDia(rs, "2026-10-05");
  // arroz 200 g: 256 kcal; ovo cozido 100 g (146 kcal na TACO)
  assert.equal(s.kcal, 256 + base.obter(488).kcal); assert.equal(s.aguaMl, 300); assert.equal(s.itens, 2);
  const r = diario.restante(s, { kcal: 300, p: 100, c: 100, g: 50, fibra: 25, aguaMl: 2000 });
  assert.equal(r.kcal, 300 - s.kcal); assert.ok(r.kcal < 0, "passar da meta vira número negativo, a tela diz 'acima da meta'");
  assert.equal(r.aguaMl, 1700);
});

test("recentes: um por alimento, o mais novo primeiro, ignorando água", () => {
  const rs = [reg(arroz, 100, "2026-10-01"), reg(frango, 100, "2026-10-03"), reg(arroz, 150, "2026-10-04"), diario.novoRegistroAgua({ ml: 200, data: "2026-10-05", id: novoId(), agora })];
  const r = diario.recentes(rs);
  assert.deepEqual(r.map((x) => x.alimentoId), ["3", "410"]); assert.equal(r[0].gramas, 150, "última quantidade usada");
});

test("favoritos: marcados primeiro, depois os repetidos 2+ vezes nos últimos 60 dias; um único registro não vira favorito", () => {
  const rs = [reg(arroz, 100, "2026-10-01"), reg(arroz, 100, "2026-10-02"), reg(frango, 100, "2026-10-03"), reg(ovo, 50, "2026-10-04"), reg(ovo, 50, "2026-10-05"), reg(arroz, 100, "2026-05-01")];
  assert.deepEqual(diario.favoritos(rs, "2026-10-05", []).map((x) => x.alimentoId).sort(), ["3", "488"]);
  assert.deepEqual(diario.favoritos(rs, "2026-10-05", ["410"]).map((x) => x.alimentoId)[0], "410");
});

test("repetir ontem copia a comida (não a água) com ids novos e a data de hoje", () => {
  const rs = [reg(arroz, 100, "2026-10-04"), diario.novoRegistroAgua({ ml: 250, data: "2026-10-04", id: novoId(), agora }), reg(frango, 120, "2026-10-03")];
  const nov = diario.repetirDia(rs, "2026-10-04", "2026-10-05", { novoId, agora });
  assert.equal(nov.length, 1); assert.equal(nov[0].data, "2026-10-05"); assert.notEqual(nov[0].id, rs[0].id); assert.equal(nov[0].kcal, rs[0].kcal);
});

test("semana na faixa: 4 dias registrados com média entre 90% e 110% do alvo conta; 3 dias ou 115% não contam", () => {
  const hoje = "2026-10-05"; // segunda; a semana anterior é 28/09 a 04/10
  const dia = (d, kcal) => ({ ...reg(arroz, 100, d), kcal });
  const quatro = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"].map((d) => dia(d, 2000));
  const s = diario.semanas(quatro, hoje, 2000, 2);
  assert.equal(s[0].naFaixa, true); assert.equal(s[0].diasRegistrados, 4); assert.equal(s[0].mediaKcal, 2000); assert.equal(s[1].naFaixa, false);
  assert.equal(diario.semanas(quatro.slice(0, 3), hoje, 2000, 2)[0].naFaixa, false, "3 dias é pouco para afirmar");
  assert.equal(diario.semanas(quatro.map((r) => ({ ...r, kcal: 2300 })), hoje, 2000, 2)[0].naFaixa, false, "2300 é 115% da meta");
  assert.equal(diario.semanas(quatro.map((r) => ({ ...r, kcal: 2200 })), hoje, 2000, 2)[0].naFaixa, true, "2200 é exatamente 110%");
});

test("a visão semanal devolve N semanas ordenadas, da mais antiga à corrente, com 7 dias cada", () => {
  const s = diario.semanas([], "2026-10-07", 2000, 8);
  assert.equal(s.length, 8); assert.equal(s[7].inicio, "2026-10-05"); assert.equal(s[0].inicio, "2026-08-17");
  assert.ok(s.every((x) => x.dias.length === 7 && x.naFaixa === false));
});

test("dias registrados na janela de 14 dias conta dias distintos e ignora água e dias fora da janela", () => {
  const rs = [reg(arroz, 100, "2026-10-05"), reg(frango, 100, "2026-10-05"), reg(arroz, 100, "2026-09-30"), reg(arroz, 100, "2026-09-20"), diario.novoRegistroAgua({ ml: 200, data: "2026-10-04", id: novoId(), agora })];
  assert.equal(diario.diasRegistrados(rs, "2026-10-05", 14), 2);
});

test("cruzamento com Finanças só põe números lado a lado: mercado, delivery e dias com registro no mês", () => {
  const resumo = { porCategoria: [{ categoriaId: "cat-mercado", centavos: 123456 }, { categoriaId: "cat-delivery", centavos: 7890 }, { categoriaId: "cat-lazer", centavos: 1 }] };
  const rs = [reg(arroz, 100, "2026-10-01"), reg(arroz, 100, "2026-10-01"), reg(arroz, 100, "2026-10-03"), reg(arroz, 100, "2026-09-30")];
  assert.deepEqual(diario.cruzamentoFinancas({ resumo, refeicoes: rs, ym: "2026-10", hoje: "2026-10-05" }), { mercadoCentavos: 123456, deliveryCentavos: 7890, diasComRegistro: 2, diasNoMes: 5 });
  assert.equal(diario.cruzamentoFinancas({ resumo: { porCategoria: [] }, refeicoes: [], ym: "2026-02", hoje: "2026-10-05" }).diasNoMes, 28);
});

// ---------- esquema aditivo ----------
test("as listas do esquema (refeições, atividade, objetivo) são as mesmas dos módulos de nutrição", () => {
  assert.deepEqual(NIVEIS_ATIVIDADE, Object.keys(energia.ATIVIDADES));
  assert.deepEqual(OBJETIVOS_NUTRICAO, energia.OBJETIVOS);
  assert.deepEqual(REFEICOES_NUTRICAO, [...diario.REFEICOES, diario.AGUA]);
});

test("documento v2 gravado ANTES da coleção refeicoes continua válido e aceita o primeiro registro", () => {
  const antigo = vazio({ agora }); delete antigo.refeicoes;
  assert.equal(validar(antigo).ok, true);
  const novo = adicionar(antigo, "refeicoes", reg(arroz, 100, "2026-10-05"), { novoId, agora });
  assert.equal(novo.refeicoes.length, 1); assert.equal(validar(novo).ok, true);
});

test("registro de refeição inválido é recusado com código: quantidade zero, refeição desconhecida, data impossível", () => {
  const d = vazio({ agora }), ok = reg(arroz, 100, "2026-10-05");
  for (const [mudanca, codigo] of [[{ gramas: 0 }, "refeicao.quantidade_invalida"], [{ refeicao: "brunch" }, "refeicao.tipo_invalido"], [{ data: "2026-02-31" }, "refeicao.data_invalida"], [{ kcal: -1 }, "refeicao.nutriente_invalido"]]) {
    assert.throws(() => adicionar(d, "refeicoes", { ...ok, ...mudanca }, { novoId, agora }), (e) => e instanceof ErroEsquema && e.erros.some((x) => x.codigo === codigo), codigo);
  }
});

test("perfil de nutrição: aceita os campos novos e recusa objetivo, atividade, ritmo e ajuste fora da faixa", () => {
  const d = vazio({ agora });
  const ok = definir(d, "perfil", { nascimento: "1990-06-15", cruzamentoDelivery: true, nutricao: { objetivo: "perder", atividade: "moderado", ritmoPct: 0.5, ajusteKcal: -100, ultimoAjusteEm: "2026-10-01", favoritos: ["3"] } }, { agora });
  assert.equal(validar(ok).ok, true);
  for (const nutricao of [{ objetivo: "emagrecer" }, { atividade: "extremo" }, { ritmoPct: 5 }, { ajusteKcal: 900 }, { favoritos: [3] }]) {
    assert.equal(validar(definir(d, "perfil", { nutricao }, { agora })).ok, false, JSON.stringify(nutricao));
  }
  assert.equal(validar(definir(d, "perfil", { nascimento: "ontem" }, { agora })).ok, false);
});

// ---------- tela (apresentação pura e contrato) ----------
import dic from "../../app/js/v2/ui/telas/nutricao.i18n.mjs";
import { paridade } from "../../app/js/v2/ui/i18n.mjs";
import { calcularMeta, escolhaInicial, faltasParaMeta, gramasDaEscolha, situacao, tela } from "../../app/js/v2/ui/telas/nutricao.mjs";
import { TELAS } from "../../app/js/v2/ui/telas/indice.mjs";

test("dicionário da Nutrição: mesmas chaves e placeholders em pt-BR e en, e nenhum texto vazio", () => {
  assert.deepEqual(paridade(dic), []);
});

test("vocabulário sem culpa e sem sequência no dicionário da Nutrição (nenhuma das palavras proibidas do contrato)", () => {
  const proibidas = /estour|falhou|falhar|perdeu a sequ|sequência|seguidas|streak|atrasad|culpa|failed|you broke|cheat|trapaça/i;
  for (const l of ["pt-BR", "en"]) for (const [k, v] of Object.entries(dic[l])) assert.doesNotMatch(v, proibidas, `${l}:${k}`);
});

test("a tela Nutrição está registrada, pede CSS e dicionário que existem, e o título tem chave no shell", async () => {
  const e = TELAS.find((x) => x.id === "nutricao");
  assert.ok(e && e.grupo === "mais");
  assert.equal(tela.i18n, "/js/v2/ui/telas/nutricao.i18n.mjs");
  const { default: app } = await import("../../app/js/v2/ui/app.i18n.mjs");
  assert.ok(app["pt-BR"]["tela.nutricao"] && app.en["tela.nutricao"]);
  const { NOMES_ICONES } = await import("../../app/js/v2/ui/icones.mjs").then((m) => ({ NOMES_ICONES: m.NOMES_ICONES ?? null }));
  if (NOMES_ICONES) assert.ok(NOMES_ICONES.includes("nutricao"));
});

test("o módulo da tela não usa innerHTML, atributo style, rede nem importa outra tela", () => {
  const src = readFileSync(new URL("../../app/js/v2/ui/telas/nutricao.mjs", import.meta.url), "utf8");
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(src));
  assert.ok(!/\bstyle:|setAttribute\(\s*["']style/.test(src));
  assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|sendBeacon/.test(src));
  assert.ok(!/from "\.\/(?!_comum)[a-z-]+\.mjs"/.test(src), "importa outra tela");
});

const perfilCompleto = (extra = {}) => ({ ...vazio({ agora }), pesos: [{ id: "p1", data: "2026-10-01", kg: 80 }], perfil: { ...vazio({ agora }).perfil, sexo: "m", alturaCm: 180, nascimento: "1990-06-15", nutricao: { atividade: "moderado", objetivo: "perder" }, ...extra } });
test("faltas para a meta listam só o que falta (peso, altura, nascimento, atividade) e a meta só sai com tudo", () => {
  assert.deepEqual(faltasParaMeta(vazio({ agora }), "2026-10-05"), ["peso", "altura", "nascimento", "atividade"]);
  assert.deepEqual(faltasParaMeta(perfilCompleto(), "2026-10-05"), []);
  assert.equal(calcularMeta(vazio({ agora }), "2026-10-05"), null);
});

test("a meta da tela usa a idade do dia: nascido em 1990-06-15 em 2026-10-05 tem 36 anos = TMB 1750, GET 2713, alvo 2273 (perder 0,5%)", () => {
  // 10×80 + 6,25×180 − 5×36 + 5 = 800 + 1125 − 180 + 5 = 1750; ×1,55 = 2712,5 -> 2713; −0,4×1100 = 440 -> 2273
  const m = calcularMeta(perfilCompleto(), "2026-10-05");
  assert.equal(m.tmb, 1750); assert.equal(m.get, 2713); assert.equal(m.alvoKcal, 2273); assert.equal(m.alvo.kcal, 2273);
  assert.equal(m.alvo.aguaMl, 2000);
});

test("ajuste aceito pela pessoa entra na meta (−100 kcal) e a água personalizada vence a de referência", () => {
  const m = calcularMeta(perfilCompleto({ nutricao: { atividade: "moderado", objetivo: "perder", ajusteKcal: -100, aguaMl: 2500 } }), "2026-10-05");
  assert.equal(m.alvoKcal, 2173); assert.equal(m.alvo.aguaMl, 2500);
});

test("situação do macro: abaixo de 90%, dentro de 90 a 110%, acima de 110% da meta; sem meta não julga", () => {
  assert.deepEqual([89, 90, 100, 110, 111].map((v) => situacao(v, 100)), ["abaixo", "dentro", "dentro", "dentro", "acima"]);
  assert.equal(situacao(50, null), "sem_meta");
});

test("escolha inicial em 1 toque: última quantidade usada, senão 1 da primeira medida caseira, senão 100 g", () => {
  const arrozA = base.obter(3), semMedida = base.obter(2);
  assert.deepEqual(escolhaInicial(arrozA, { gramas: 150 }), { medida: "g", qtd: 150 });
  assert.deepEqual(escolhaInicial(arrozA, null), { medida: "escumadeira", qtd: 1 });
  assert.deepEqual(escolhaInicial(semMedida, null), { medida: "g", qtd: 100 });
  assert.equal(gramasDaEscolha(arrozA, "escumadeira", 2), 180); assert.equal(gramasDaEscolha(arrozA, "g", 75), 75);
});
