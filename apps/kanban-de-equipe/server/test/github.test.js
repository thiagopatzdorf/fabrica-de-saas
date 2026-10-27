// Sincronização com o GitHub usando respostas simuladas: nenhuma chamada sai da máquina.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');
const { getDb, ObjectId } = require('../db');
const { mapLabels, matchAssignee } = require('../githubSync');

let t, adminToken;
const realFetch = global.fetch;
let routes; // [{ method, test: RegExp, handler }]
let seen;   // chamadas ao GitHub

function json(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function issue(n, extra = {}) {
  return { number: n, title: 'Issue ' + n, body: 'corpo ' + n, state: 'open', labels: [{ name: 'bug' }], assignees: [],
    html_url: 'https://github.com/org/repo/issues/' + n, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z', ...extra };
}

before(async () => {
  process.env.GITHUB_TOKEN = 'token-de-teste';
  t = await start();
  process.env.GITHUB_TOKEN = 'token-de-teste'; // start() limpa; o sync precisa dele
  await t.createUser({ name: 'Ivo Admin', email: 'ivo@exemplo.test', isAdmin: true });
  await t.createUser({ name: 'Joana Dev', email: 'joana@exemplo.test', githubUsername: 'JoanaDev' });
  adminToken = await t.login('ivo@exemplo.test');
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (!u.startsWith('https://api.github.com')) return realFetch(url, opts);
    const path = u.replace('https://api.github.com', '');
    const method = (opts.method || 'GET').toUpperCase();
    seen.push({ method, path, body: opts.body ? JSON.parse(opts.body) : null, auth: opts.headers && opts.headers.Authorization });
    const r = routes.find(x => x.method === method && x.test.test(path));
    if (!r) return json({ message: 'sem rota simulada' }, { status: 404 });
    return r.handler(path, opts);
  };
});
after(async () => { global.fetch = realFetch; await t.stop(); });
beforeEach(async () => {
  routes = []; seen = [];
  for (const c of ['tasks', 'projects', 'githubRepos']) await getDb().collection(c).deleteMany({});
});

const onIssues = (list, headers) => routes.push({ method: 'GET', test: /\/issues\?/, handler: () => json(list, { headers: headers || {} }) });
const onComments = (n, list) => routes.push({ method: 'GET', test: new RegExp('/issues/' + n + '/comments'), handler: () => json(list) });

async function connect() {
  return t.call('POST', '/api/github/repos', { token: adminToken, body: { owner: 'org', repo: 'repo' } });
}

test('rótulos do GitHub viram etiquetas, aceitando objeto ou texto e descartando vazios', () => {
  assert.deepEqual(mapLabels([{ name: 'bug' }, 'urgente', { name: '' }, null]), ['bug', 'urgente']);
  assert.deepEqual(mapLabels(undefined), []);
});

test('responsável da issue é casado pelo githubUsername ignorando maiúsculas', () => {
  const users = [{ _id: '1', githubUsername: 'joanadev' }, { _id: '2' }];
  assert.equal(matchAssignee({ assignees: [{ login: 'JoanaDEV' }] }, users)._id, '1');
  assert.equal(matchAssignee({ assignees: [] }, users), null);
  assert.equal(matchAssignee({ assignees: [{ login: 'ninguem' }] }, users), null);
});

test('conectar repositório cria projeto e importa issues como tarefas (aberta -> A Fazer, fechada -> Concluído)', async () => {
  onIssues([issue(1), issue(2, { state: 'closed' })]);
  onComments(1, []); onComments(2, []);
  const r = await connect();
  assert.equal(r.status, 201);
  assert.deepEqual({ created: r.body.summary.created, updated: r.body.summary.updated }, { created: 2, updated: 0 });
  const tasks = (await t.call('GET', '/api/tasks', { token: adminToken })).body.tasks;
  assert.equal(tasks.find(x => x.githubIssueNumber === 1).col, 'todo');
  assert.equal(tasks.find(x => x.githubIssueNumber === 2).col, 'done');
  assert.deepEqual(tasks.find(x => x.githubIssueNumber === 1).tags, ['bug']);
  assert.equal(tasks[0].projectId, r.body.project.id);
});

test('pull requests devolvidos pelo endpoint de issues não viram tarefa', async () => {
  onIssues([issue(1), issue(2, { pull_request: { url: 'x' } })]);
  onComments(1, []);
  const r = await connect();
  assert.equal(r.body.summary.created, 1);
});

test('issue atribuída a quem tem githubUsername cadastrado já nasce com responsável', async () => {
  onIssues([issue(1, { assignees: [{ login: 'joanadev' }] })]);
  onComments(1, []);
  await connect();
  const users = (await t.call('GET', '/api/users', { token: adminToken })).body.users;
  const joana = users.find(u => u.email === 'joana@exemplo.test');
  const task = (await t.call('GET', '/api/tasks', { token: adminToken })).body.tasks[0];
  assert.equal(task.assigneeId, joana.id);
});

test('conectar o mesmo repositório duas vezes devolve 409 e não duplica projeto', async () => {
  onIssues([]);
  assert.equal((await connect()).status, 201);
  assert.equal((await connect()).status, 409);
  assert.equal((await t.call('GET', '/api/projects', { token: adminToken })).body.projects.length, 1);
});

test('owner ou repo vazio devolve 400 sem chamar o GitHub', async () => {
  const r = await t.call('POST', '/api/github/repos', { token: adminToken, body: { owner: 'org' } });
  assert.equal(r.status, 400);
  assert.equal(seen.length, 0);
});

test('lastSyncedAt é gravado de verdade no repositório (antes o filtro por string nunca casava)', async () => {
  onIssues([issue(1)]); onComments(1, []);
  const r = await connect();
  const doc = await getDb().collection('githubRepos').findOne({ _id: new ObjectId(r.body.repo.id) });
  assert.ok(doc.lastSyncedAt, 'lastSyncedAt deveria estar preenchido');
});

test('segunda rodada manda since com a data da primeira (sincronização incremental)', async () => {
  onIssues([issue(1)]); onComments(1, []);
  await connect();
  seen.length = 0;
  await t.call('POST', '/api/github/sync', { token: adminToken });
  const call = seen.find(c => /\/issues\?/.test(c.path));
  assert.match(call.path, /since=/);
});

test('issue fechada no GitHub move a tarefa para Concluído; reaberta, volta para A Fazer', async () => {
  onIssues([issue(1)]); onComments(1, []);
  await connect();
  routes = []; onComments(1, []);
  onIssues([issue(1, { state: 'closed' })]);
  await t.call('POST', '/api/github/sync', { token: adminToken });
  let task = (await t.call('GET', '/api/tasks', { token: adminToken })).body.tasks[0];
  assert.equal(task.col, 'done');
  routes = []; onComments(1, []);
  onIssues([issue(1, { state: 'open' })]);
  await t.call('POST', '/api/github/sync', { token: adminToken });
  task = (await t.call('GET', '/api/tasks', { token: adminToken })).body.tasks[0];
  assert.equal(task.col, 'todo');
});

test('segunda sincronização atualiza a tarefa existente em vez de duplicar', async () => {
  onIssues([issue(1)]); onComments(1, []);
  await connect();
  routes = []; onComments(1, []);
  onIssues([issue(1, { title: 'Título novo' })]);
  const r = await t.call('POST', '/api/github/sync', { token: adminToken });
  assert.deepEqual({ c: r.body.results[0].created, u: r.body.results[0].updated }, { c: 0, u: 1 });
  const tasks = (await t.call('GET', '/api/tasks', { token: adminToken })).body.tasks;
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, 'Título novo');
});

test('comentário do GitHub é importado uma vez só, mesmo sincronizando de novo', async () => {
  const comment = { id: 99, body: 'Oi do GitHub', user: { login: 'maria' } };
  onIssues([issue(1)]); onComments(1, [comment]);
  await connect();
  await t.call('POST', '/api/github/sync', { token: adminToken });
  const task = (await t.call('GET', '/api/tasks', { token: adminToken })).body.tasks[0];
  assert.equal(task.comments.length, 1);
  assert.equal(task.comments[0].text, 'Oi do GitHub');
  assert.equal(task.comments[0].initials, 'MA');
});

test('paginação segue o cabeçalho Link até acabar', async () => {
  let page = 0;
  routes.push({ method: 'GET', test: /\/issues\?/, handler: () => {
    page++;
    if (page === 1) return json([issue(1)], { headers: { link: '<https://api.github.com/repos/org/repo/issues?page=2>; rel="next"' } });
    return json([issue(2)]);
  } });
  onComments(1, []); onComments(2, []);
  const r = await connect();
  assert.equal(r.body.summary.total, 2);
});

test('mover a tarefa para Concluído fecha a issue no GitHub; tirar de Concluído reabre', async () => {
  onIssues([issue(7)]); onComments(7, []);
  await connect();
  const task = (await t.call('GET', '/api/tasks', { token: adminToken })).body.tasks[0];
  routes.push({ method: 'PATCH', test: /\/issues\/7$/, handler: (p, o) => json({ updated_at: '2026-02-01T00:00:00Z', state: JSON.parse(o.body).state }) });
  seen.length = 0;
  await t.call('PATCH', '/api/tasks/' + task.id, { token: adminToken, body: { col: 'done' } });
  assert.equal(seen.find(c => c.method === 'PATCH').body.state, 'closed');
  seen.length = 0;
  await t.call('PATCH', '/api/tasks/' + task.id, { token: adminToken, body: { col: 'doing' } });
  assert.equal(seen.find(c => c.method === 'PATCH').body.state, 'open');
});

test('falha ao fechar a issue no GitHub não impede de mover o cartão localmente', async () => {
  onIssues([issue(8)]); onComments(8, []);
  await connect();
  const task = (await t.call('GET', '/api/tasks', { token: adminToken })).body.tasks[0];
  routes.push({ method: 'PATCH', test: /\/issues\/8$/, handler: () => json({ message: 'boom' }, { status: 500 }) });
  const r = await t.call('PATCH', '/api/tasks/' + task.id, { token: adminToken, body: { col: 'done' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.task.col, 'done');
});

test('comentário novo no cartão vira comentário na issue e leva o id do GitHub (não volta duplicado)', async () => {
  onIssues([issue(9)]); onComments(9, []);
  await connect();
  const task = (await t.call('GET', '/api/tasks', { token: adminToken })).body.tasks[0];
  routes.push({ method: 'POST', test: /\/issues\/9\/comments$/, handler: () => json({ id: 555 }, { status: 201 }) });
  const r = await t.call('PATCH', '/api/tasks/' + task.id, { token: adminToken, body: { comments: [{ who: 'Ivo', text: 'Olá GitHub' }] } });
  assert.equal(r.status, 200);
  assert.equal(seen.find(c => c.method === 'POST').body.body, 'Olá GitHub');
  const saved = (await t.call('GET', '/api/tasks', { token: adminToken })).body.tasks[0];
  assert.equal(saved.comments[0].githubCommentId, 555);
});

test('erro do GitHub em um repositório vira resultado com error e não derruba a rodada', async () => {
  routes.push({ method: 'GET', test: /\/issues\?/, handler: () => json({ message: 'Not Found' }, { status: 404 }) });
  await getDb().collection('githubRepos').insertOne({ owner: 'org', repo: 'sumiu', projectId: 'x', lastSyncedAt: null });
  const r = await t.call('POST', '/api/github/sync', { token: adminToken });
  assert.equal(r.status, 200);
  assert.match(r.body.results[0].error, /GitHub API 404/);
});

test('token do GitHub vai no cabeçalho Authorization das chamadas', async () => {
  onIssues([]);
  await connect();
  assert.equal(seen[0].auth, 'Bearer token-de-teste');
});
