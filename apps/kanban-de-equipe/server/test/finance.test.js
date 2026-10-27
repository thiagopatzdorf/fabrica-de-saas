const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { budgetFromThousands, usagePercent, validateMoneyPatch, DEFAULT_BUDGET } = require('../finance');
const { initialsFromName, pickColor } = require('../utils');
const { start } = require('./helpers');

describe('regras puras do financeiro', () => {
  test('orçamento informado em milhares de reais vira reais (60 -> 60000)', () => {
    assert.equal(budgetFromThousands(60), 60000);
    assert.equal(budgetFromThousands('12.5'), 12500);
  });
  test('orçamento vazio, zero, negativo ou texto cai no padrão, nunca NaN nem 0', () => {
    for (const v of [undefined, '', 0, -5, 'abc', null, NaN]) assert.equal(budgetFromThousands(v), DEFAULT_BUDGET, String(v));
  });
  test('percentual de uso com orçamento zero devolve 0, não Infinity', () => {
    assert.equal(usagePercent(5000, 0), 0);
    assert.equal(usagePercent(5000, undefined), 0);
  });
  test('percentual de uso arredonda e pode passar de 100 quando estoura o orçamento', () => {
    assert.equal(usagePercent(15000, 30000), 50);
    assert.equal(usagePercent(45000, 30000), 150);
  });
  test('valores monetários negativos ou não numéricos são recusados', () => {
    assert.match(validateMoneyPatch({ spent: -1 }), /spent/);
    assert.match(validateMoneyPatch({ budget: 'muito' }), /budget/);
    assert.match(validateMoneyPatch({ budget: '' }), /budget/);
    assert.match(validateMoneyPatch({ spent: true }), /spent/);
  });
  test('valor monetário em texto numérico é convertido para número', () => {
    const patch = { spent: '2500.5', budget: 10000 };
    assert.equal(validateMoneyPatch(patch), null);
    assert.strictEqual(patch.spent, 2500.5);
  });
  test('iniciais usam as duas primeiras palavras e aguentam nome vazio', () => {
    assert.equal(initialsFromName('maria da silva'), 'MD');
    assert.equal(initialsFromName('  Zé '), 'Z');
    assert.equal(initialsFromName(''), '—');
  });
  test('cores de avatar dão a volta na paleta em vez de virar undefined', () => {
    assert.ok(pickColor(1000));
  });
});

describe('financeiro pela API', () => {
  let t, token;
  before(async () => {
    t = await start();
    await t.createUser({ name: 'Hugo Fin', email: 'hugo@exemplo.test' });
    token = await t.login('hugo@exemplo.test');
  });
  after(() => t.stop());

  test('projeto criado com hours=60 ganha orçamento 60000, gasto zero e taxa padrão', async () => {
    const r = await t.call('POST', '/api/projects', { token, body: { name: 'Site novo', hours: 60 } });
    assert.equal(r.status, 201);
    assert.equal(r.body.project.budget, 60000);
    assert.equal(r.body.project.spent, 0);
    assert.equal(r.body.project.rate, 'R$ 130');
    assert.equal(r.body.project.status, 'Planejado');
  });

  test('projeto sem orçamento informado usa o padrão em vez de gravar NaN', async () => {
    const r = await t.call('POST', '/api/projects', { token, body: { name: 'Sem verba' } });
    assert.equal(r.body.project.budget, DEFAULT_BUDGET);
  });

  test('projeto sem nome devolve 400', async () => {
    assert.equal((await t.call('POST', '/api/projects', { token, body: { name: ' ' } })).status, 400);
  });

  test('PATCH com gasto negativo devolve 400 e não altera o projeto', async () => {
    const p = (await t.call('POST', '/api/projects', { token, body: { name: 'Gastos', hours: 10 } })).body.project;
    const bad = await t.call('PATCH', '/api/projects/' + p.id, { token, body: { spent: -100 } });
    assert.equal(bad.status, 400);
    const list = (await t.call('GET', '/api/projects', { token })).body.projects;
    assert.equal(list.find(x => x.id === p.id).spent, 0);
  });

  test('PATCH registra gasto como número mesmo vindo como texto', async () => {
    const p = (await t.call('POST', '/api/projects', { token, body: { name: 'Gastos 2', hours: 10 } })).body.project;
    const ok = await t.call('PATCH', '/api/projects/' + p.id, { token, body: { spent: '2500' } });
    assert.equal(ok.body.project.spent, 2500);
  });

  test('PATCH em projeto inexistente devolve 404 (antes quebrava ao ler documento nulo)', async () => {
    const r = await t.call('PATCH', '/api/projects/64b7f0000000000000000000', { token, body: { name: 'x' } });
    assert.equal(r.status, 404);
  });

  test('PATCH ignora campos fora da lista (githubFullName não é editável pelo cliente)', async () => {
    const p = (await t.call('POST', '/api/projects', { token, body: { name: 'Protegido' } })).body.project;
    const r = await t.call('PATCH', '/api/projects/' + p.id, { token, body: { githubFullName: 'alguem/outro', name: 'Renomeado' } });
    assert.equal(r.body.project.name, 'Renomeado');
    assert.equal(r.body.project.githubFullName, undefined);
  });
});
