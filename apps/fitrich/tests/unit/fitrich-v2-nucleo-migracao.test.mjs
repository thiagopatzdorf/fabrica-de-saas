import assert from "node:assert/strict";
import { test } from "node:test";
import { adicionar as adicionarV1, exportarJSON as exportarV1, vazio as vazioV1 } from "../../app/js/dados.mjs";
import { validar, saldoDaConta, resumoMes } from "../../app/js/v2/esquema.mjs";
import { CONTA_V1_ID, assinatura, conferirMigracao, importarJSON, migrar } from "../../app/js/v2/migracao.mjs";
import {
  CHAVE_V1, MARCADOR_V2, criarAdaptadorMemoria, criarArmazem, deRegistros, paraRegistros, v1PodeSerApagada,
} from "../../app/js/v2/armazem.mjs";

const T0 = "2026-10-05T12:00:00.000Z";
const agora = () => T0;

// Um backup v1 realista, montado com o próprio código v1 (o que a pessoa tem no aparelho hoje).
function backupV1() {
  let d = vazioV1();
  d = adicionarV1(d, "lancamentos", { data: "2026-09-03", tipo: "receita", centavos: 450000, categoria: "Salário", descricao: "salário" });
  d = adicionarV1(d, "lancamentos", { data: "2026-09-05", tipo: "despesa", centavos: 120000, categoria: "Moradia", descricao: "aluguel" });
  d = adicionarV1(d, "lancamentos", { data: "2026-09-10", tipo: "despesa", centavos: 8990, categoria: "Saúde e fitness", descricao: "academia" });
  d = adicionarV1(d, "lancamentos", { data: "2026-09-12", tipo: "receita", centavos: 15000, categoria: "Outros", descricao: "venda" });
  d = adicionarV1(d, "lancamentos", { data: "2026-09-13", tipo: "despesa", centavos: 3700, categoria: "Outros", descricao: "" });
  d = adicionarV1(d, "pesos", { data: "2026-09-01", kg: 82.4 });
  d = adicionarV1(d, "pesos", { data: "2026-09-08", kg: 81.9 });
  d = adicionarV1(d, "medidas", { data: "2026-09-01", cinturaCm: 92, pescocoCm: 39 });
  d = adicionarV1(d, "treinos", { data: "2026-09-02", tipo: "Musculação", minutos: 50, esforco: 3 });
  d = adicionarV1(d, "treinos", { data: "2026-09-04", tipo: "Corrida", minutos: 30, esforco: 4 });
  d = { ...d, perfil: { sexo: "m", alturaCm: 180 }, metas: { pesoKg: 78, treinosSemana: 4, poupancaPct: 25, reservaAlvo: 1500000, reservaAtual: 200000 }, orcamento: { Moradia: 130000, Lazer: 30000 } };
  return d;
}

function localStorageFalso(inicial = {}) {
  const m = { ...inicial }, escritas = [];
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { escritas.push(k); m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, _m: m, _escritas: escritas };
}

test("migrar v1→v2: N registros viram N com a mesma soma de centavos, categorias viram ids fixos e a carteira recebe tudo", () => {
  const v1 = backupV1(), antes = assinatura(v1);
  const r = migrar(v1, { agora });
  assert.ok(r.ok, JSON.stringify(r.erros));
  const d = r.dados;
  assert.equal(r.passos, 1); assert.equal(d.versao, 2);
  assert.equal(validar(d).ok, true);
  assert.deepEqual(conferirMigracao(v1, d), { ok: true, divergencias: [] });
  const depois = assinatura(d);
  for (const c of ["pesos", "medidas", "treinos", "lancamentos"]) assert.equal(depois.contagens[c], antes.contagens[c], c);
  assert.equal(depois.somaReceitas, 465000); assert.equal(depois.somaDespesas, 132690);
  assert.deepEqual(d.lancamentos.map((l) => l.categoriaId), ["cat-salario", "cat-moradia", "cat-saude-fitness", "cat-outros-receita", "cat-outros"]);
  assert.ok(d.lancamentos.every((l) => l.contaId === CONTA_V1_ID && l.status === "efetivado" && l.moeda === "BRL" && typeof l.id === "string"));
  assert.deepEqual(d.lancamentos.map((l) => l.id), ["v1-lancamentos-1", "v1-lancamentos-2", "v1-lancamentos-3", "v1-lancamentos-4", "v1-lancamentos-5"]);
  assert.equal(d.contas[0].dataSaldoInicial, "2026-09-03", "a carteira nasce no dia do primeiro lançamento");
  assert.equal(saldoDaConta(d, CONTA_V1_ID, "2026-09-30"), 465000 - 132690);
  assert.equal(resumoMes(d, "2026-09").despesas, 132690);
  assert.deepEqual(d.orcamento, { metodo: "limites", rollover: false, limites: { "cat-moradia": 130000, "cat-lazer": 30000 } });
  assert.deepEqual(d.metas.map((m) => [m.tipo, m.alvo, m.atual]), [["peso", 78, undefined], ["treino", 4, undefined], ["poupanca", 25, undefined], ["reserva", 1500000, 200000]]);
  assert.deepEqual(d.perfil, { sexo: "m", alturaCm: 180, idioma: "pt-BR", moedaPadrao: "BRL" });
  assert.equal(d.meta.migradoDeV1Em, T0);
  assert.deepEqual(d.pesos.map((p) => p.id), ["v1-pesos-6", "v1-pesos-7"], "o contador `prox` da v1 é global: o número original fica");
  assert.equal(d.treinos[1].esforco, 4);
});

test("migrar é idempotente: rodar sobre o resultado devolve o mesmo objeto, e o v1 original não é alterado", () => {
  const v1 = backupV1(), copia = structuredClone(v1);
  const uma = migrar(v1, { agora }).dados, duas = migrar(uma, { agora });
  assert.ok(duas.ok); assert.equal(duas.passos, 0);
  assert.deepEqual(duas.dados, uma);
  assert.deepEqual(v1, copia);
  assert.deepEqual(migrar(structuredClone(v1), { agora }).dados, uma, "mesma v1 → mesmos ids (estáveis)");
});

test("v1 sem lançamentos e sem metas opcionais migra: carteira nasce hoje, metas só as obrigatórias", () => {
  const r = migrar(vazioV1(), { agora });
  assert.ok(r.ok, JSON.stringify(r.erros));
  assert.equal(r.dados.contas[0].dataSaldoInicial, "2026-10-05");
  assert.deepEqual(r.dados.metas.map((m) => m.tipo), ["treino", "poupanca"]);
  assert.equal(validar(r.dados).ok, true);
});

test("migrar recusa com código: versão futura, versão desconhecida, v1 inválida, JSON quebrado", () => {
  assert.deepEqual(migrar({ versao: 3 }).erros.map((e) => e.codigo), ["migracao.versao_futura"]);
  assert.deepEqual(migrar({ versao: "1" }).erros.map((e) => e.codigo), ["migracao.versao_desconhecida"]);
  assert.deepEqual(migrar(null).erros.map((e) => e.codigo), ["dados.nao_objeto"]);
  const ruim = { ...vazioV1(), lancamentos: [{ id: 1, data: "2026-09-01", tipo: "despesa", centavos: -5, categoria: "Mercado", descricao: "" }] };
  const r = migrar(ruim);
  assert.equal(r.ok, false); assert.equal(r.erros[0].codigo, "migracao.v1_invalida"); assert.ok(r.erros[0].detalhe.length > 0);
  assert.deepEqual(importarJSON("{quebrado").erros.map((e) => e.codigo), ["dados.json_invalido"]);
});

test("backup v1 exportado hoje pelo código v1 importa na v2 (a v1 recusava qualquer versão ≠ 1; a v2 aceita todas ≤ 2)", () => {
  const texto = exportarV1(backupV1());
  const r = importarJSON(texto, { agora });
  assert.ok(r.ok, JSON.stringify(r.erros));
  assert.equal(r.dados.versao, 2);
  assert.equal(r.dados.lancamentos.length, 5);
  const r2 = importarJSON(JSON.stringify(r.dados), { agora });
  assert.ok(r2.ok); assert.deepEqual(r2.dados, r.dados);
});

test("armazém: salvar e carregar devolve o documento idêntico (memória), paraRegistros/deRegistros são inversas", async () => {
  const d = migrar(backupV1(), { agora }).dados;
  assert.deepEqual(deRegistros(paraRegistros(d)), d);
  assert.equal(deRegistros(null), null);
  const arm = criarArmazem({ adaptador: criarAdaptadorMemoria(), agora });
  assert.equal(await arm.carregar(), null, "armazém vazio carrega null, não um documento inventado");
  assert.deepEqual(await arm.salvarLote(d), { ok: true });
  assert.deepEqual(await arm.carregar(), d);
  assert.equal(await arm.exportarTudo(), JSON.stringify(d, null, 1));
  const invalido = await arm.salvarLote({ ...d, versao: 1 });
  assert.equal(invalido.ok, false); assert.equal(invalido.erros[0].codigo, "dados.versao_diferente");
  assert.deepEqual(await arm.carregar(), d, "documento inválido não sobrescreve o válido");
});

test("migração v1→v2 no armazém: grava, relê, confere e só então marca; a chave v1 nunca é escrita", async () => {
  const v1 = backupV1(), ls = localStorageFalso({ [CHAVE_V1]: exportarV1(v1) });
  const arm = criarArmazem({ adaptador: criarAdaptadorMemoria(), localStorage: ls, agora });
  const r = await arm.migrarDaV1();
  assert.equal(r.codigo, "migracao.feita", JSON.stringify(r));
  assert.deepEqual(ls._escritas, [MARCADOR_V2], "só o marcador foi escrito");
  assert.equal(ls.getItem(CHAVE_V1), exportarV1(v1), "v1 intacta");
  const marcador = JSON.parse(ls.getItem(MARCADOR_V2));
  assert.equal(marcador.em, T0);
  assert.deepEqual(marcador.contagens, { pesos: 2, medidas: 1, treinos: 2, lancamentos: 5 });
  assert.deepEqual(await arm.carregar(), r.dados);
  assert.equal((await arm.migrarDaV1()).codigo, "migracao.ja_feita", "segunda abertura não migra de novo");
  assert.deepEqual(arm.estadoV1("2026-12-31"), { temV1: true, migrada: true, podeApagarV1: false });
  assert.deepEqual(arm.estadoV1("2027-01-03"), { temV1: true, migrada: true, podeApagarV1: true });
});

test("migração interrompida no meio (exceção ao gravar) deixa a v1 intacta, não grava marcador e oferece o JSON v1", async () => {
  const v1 = backupV1(), texto = exportarV1(v1), ls = localStorageFalso({ [CHAVE_V1]: texto });
  const adaptador = criarAdaptadorMemoria();
  adaptador.gravarTudo = async () => { throw new Error("QuotaExceededError"); };
  const arm = criarArmazem({ adaptador, localStorage: ls, agora });
  const r = await arm.migrarDaV1();
  assert.equal(r.ok, false); assert.equal(r.codigo, "migracao.gravacao_falhou");
  assert.equal(r.jsonV1, texto);
  assert.deepEqual(ls._escritas, []);
  assert.equal(ls.getItem(MARCADOR_V2), null);
  assert.equal(ls.getItem(CHAVE_V1), texto);
  assert.equal(await arm.carregar(), null);
});

test("migração com releitura divergente (o adaptador perdeu um registro) não marca, limpa a v2 parcial e mantém a v1", async () => {
  const v1 = backupV1(), texto = exportarV1(v1), ls = localStorageFalso({ [CHAVE_V1]: texto });
  const adaptador = criarAdaptadorMemoria(), lerTudo = adaptador.lerTudo.bind(adaptador);
  let primeiraLeitura = true;
  adaptador.lerTudo = async () => { const r = await lerTudo(); if (r && primeiraLeitura) { primeiraLeitura = false; r.colecoes.lancamentos.pop(); } return r; };
  const arm = criarArmazem({ adaptador, localStorage: ls, agora });
  const r = await arm.migrarDaV1();
  assert.equal(r.codigo, "migracao.divergencia");
  assert.deepEqual(r.divergencias.map((x) => [x.codigo, x.caminho]), [["migracao.contagem_divergente", "lancamentos"], ["migracao.soma_divergente", "despesas"]]);
  assert.equal(r.jsonV1, texto);
  assert.equal(ls.getItem(MARCADOR_V2), null);
  assert.equal(await arm.carregar(), null, "a v2 meio-gravada foi limpa");
});

test("sem v1 no aparelho a migração é um não-evento; v1 ilegível e IDB já populado sem marcador têm código próprio", async () => {
  const arm0 = criarArmazem({ adaptador: criarAdaptadorMemoria(), localStorage: localStorageFalso(), agora });
  assert.deepEqual(await arm0.migrarDaV1(), { ok: true, codigo: "migracao.sem_v1" });
  const arm1 = criarArmazem({ adaptador: criarAdaptadorMemoria(), localStorage: localStorageFalso({ [CHAVE_V1]: "{x" }), agora });
  assert.equal((await arm1.migrarDaV1()).codigo, "migracao.v1_ilegivel");
  const adaptador = criarAdaptadorMemoria();
  const arm2 = criarArmazem({ adaptador, localStorage: localStorageFalso({ [CHAVE_V1]: exportarV1(backupV1()) }), agora });
  await arm2.salvarLote(migrar(vazioV1(), { agora }).dados);
  assert.equal((await arm2.migrarDaV1()).codigo, "migracao.idb_ja_tem_dados");
  const semLS = criarArmazem({ adaptador: criarAdaptadorMemoria(), localStorage: null, agora });
  assert.equal((await semLS.migrarDaV1()).codigo, "migracao.sem_v1", "localStorage bloqueado não derruba a abertura");
});

test("v1 fica 90 dias: pode ser apagada no 90º dia, não no 89º; marcador quebrado nunca libera; apagarV1 respeita isso", () => {
  const marcador = JSON.stringify({ em: "2026-10-05T12:00:00.000Z" });
  assert.equal(v1PodeSerApagada(marcador, "2027-01-02"), false, "89 dias");
  assert.equal(v1PodeSerApagada(marcador, "2027-01-03"), true, "90 dias");
  assert.equal(v1PodeSerApagada("{", "2030-01-01"), false);
  assert.equal(v1PodeSerApagada(null, "2030-01-01"), false);
  const ls = localStorageFalso({ [CHAVE_V1]: "{}", [MARCADOR_V2]: marcador });
  const arm = criarArmazem({ adaptador: criarAdaptadorMemoria(), localStorage: ls, agora });
  assert.deepEqual(arm.apagarV1("2027-01-02"), { ok: false, codigo: "v1.ainda_na_guarda" });
  assert.equal(ls.getItem(CHAVE_V1), "{}");
  assert.deepEqual(arm.apagarV1("2027-01-03"), { ok: true, codigo: "v1.apagada" });
  assert.equal(ls.getItem(CHAVE_V1), null);
});

test("persistência e estimativa: usam navigator.storage injetado e devolvem null quando a API não existe ou lança", async () => {
  const nav = { storage: { persist: async () => true, estimate: async () => ({ usage: 1234, quota: 5000000 }) } };
  const arm = criarArmazem({ adaptador: criarAdaptadorMemoria(), navegador: nav, agora });
  assert.equal(await arm.pedirPersistencia(), true);
  assert.deepEqual(await arm.estimativa(), { usoBytes: 1234, cotaBytes: 5000000 });
  const sem = criarArmazem({ adaptador: criarAdaptadorMemoria(), navegador: {}, agora });
  assert.equal(await sem.pedirPersistencia(), null); assert.equal(await sem.estimativa(), null);
  const quebra = criarArmazem({ adaptador: criarAdaptadorMemoria(), navegador: { storage: { persist: async () => { throw new Error("x"); } } }, agora });
  assert.equal(await quebra.pedirPersistencia(), null);
});
