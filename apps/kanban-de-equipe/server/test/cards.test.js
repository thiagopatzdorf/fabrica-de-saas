const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

let t, token;

before(async () => {
  t = await start();
  await t.createUser({ name: 'Gabi Dev', email: 'gabi@exemplo.test' });
  token = await t.login('gabi@exemplo.test');
});
after(() => t.stop());

async function newTask(body) {
  const r = await t.call('POST', '/api/tasks', { token, body });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.task;
}

test('cartão sem título é recusado com 400 (não cria cartão em branco)', async () => {
  const r = await t.call('POST', '/api/tasks', { token, body: { title: '   ' } });
  assert.equal(r.status, 400);
});

test('cartão novo nasce com os padrões: coluna A Fazer, prioridade Média, autor registrado', async () => {
  const task = await newTask({ title: '  Escrever o relatório  ' });
  assert.equal(task.title, 'Escrever o relatório');
  assert.equal(task.col, 'todo');
  assert.equal(task.priority, 'Média');
  assert.equal(task.createdBy, 'Gabi Dev');
  assert.deepEqual(task.comments, []);
  assert.ok(task.id && !task._id);
});

test('coluna inexistente na criação é recusada (cartão não some do quadro)', async () => {
  const r = await t.call('POST', '/api/tasks', { token, body: { title: 'x', col: 'arquivo-morto' } });
  assert.equal(r.status, 400);
});

test('mover o cartão entre colunas persiste e atualiza updatedAt', async () => {
  const task = await newTask({ title: 'Mover' });
  await new Promise(r => setTimeout(r, 5));
  const moved = await t.call('PATCH', '/api/tasks/' + task.id, { token, body: { col: 'doing' } });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.task.col, 'doing');
  assert.notEqual(moved.body.task.updatedAt, task.updatedAt);
  const list = (await t.call('GET', '/api/tasks', { token })).body.tasks;
  assert.equal(list.find(x => x.id === task.id).col, 'doing');
});

test('mover para coluna inválida devolve 400 e mantém a coluna anterior', async () => {
  const task = await newTask({ title: 'Coluna inválida', col: 'review' });
  const r = await t.call('PATCH', '/api/tasks/' + task.id, { token, body: { col: 'inexistente' } });
  assert.equal(r.status, 400);
  const list = (await t.call('GET', '/api/tasks', { token })).body.tasks;
  assert.equal(list.find(x => x.id === task.id).col, 'review');
});

test('PATCH não deixa religar o cartão a outro repositório do GitHub (campos fora da lista são ignorados)', async () => {
  const task = await newTask({ title: 'Mass assignment' });
  const r = await t.call('PATCH', '/api/tasks/' + task.id, { token, body: { title: 'Novo', githubRepoId: 'abc', createdById: 'fake', _id: 'troca' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.task.title, 'Novo');
  assert.equal(r.body.task.githubRepoId, undefined);
  assert.notEqual(r.body.task.createdById, 'fake');
  assert.equal(r.body.task.id, task.id);
});

test('PATCH em cartão inexistente devolve 404', async () => {
  const r = await t.call('PATCH', '/api/tasks/64b7f0000000000000000000', { token, body: { title: 'x' } });
  assert.equal(r.status, 404);
});

test('PATCH com ID malformado devolve 400', async () => {
  const r = await t.call('PATCH', '/api/tasks/abc', { token, body: { title: 'x' } });
  assert.equal(r.status, 400);
});

test('comentários e checklist enviados no PATCH são gravados como estão', async () => {
  const task = await newTask({ title: 'Comentar' });
  const comments = [{ who: 'Gabi Dev', when: 'agora', text: 'Pronto para revisão' }];
  const checklist = [{ t: 'Passo 1', done: true }, { t: 'Passo 2', done: false }];
  const r = await t.call('PATCH', '/api/tasks/' + task.id, { token, body: { comments, checklist } });
  assert.deepEqual(r.body.task.comments, comments);
  assert.deepEqual(r.body.task.checklist, checklist);
});

test('excluir cartão remove da listagem; excluir de novo continua 204 (idempotente)', async () => {
  const task = await newTask({ title: 'Apagar' });
  assert.equal((await t.call('DELETE', '/api/tasks/' + task.id, { token })).status, 204);
  assert.equal((await t.call('DELETE', '/api/tasks/' + task.id, { token })).status, 204);
  const list = (await t.call('GET', '/api/tasks', { token })).body.tasks;
  assert.equal(list.some(x => x.id === task.id), false);
});

test('falha inesperada do banco vira 500 em JSON e o servidor continua respondendo', async () => {
  const { getDb } = require('../db');
  const col = getDb().collection('tasks');
  const original = col.constructor.prototype.find;
  col.constructor.prototype.find = function (...a) { if (this.collectionName === 'tasks') throw new Error('banco caiu'); return original.apply(this, a); };
  try {
    const r = await t.call('GET', '/api/tasks', { token });
    assert.equal(r.status, 500);
    assert.equal(r.body.error, 'Erro interno do servidor.');
  } finally {
    col.constructor.prototype.find = original;
  }
  assert.equal((await t.call('GET', '/api/tasks', { token })).status, 200);
});
