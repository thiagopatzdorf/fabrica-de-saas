const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { start } = require('./helpers');

let t, adminId, adminToken, memberToken;

before(async () => {
  t = await start();
  adminId = await t.createUser({ name: 'Ana Admin', email: 'Ana@Exemplo.test', isAdmin: true });
  await t.createUser({ name: 'Beto Membro', email: 'beto@exemplo.test' });
  adminToken = await t.login('ana@exemplo.test');
  memberToken = await t.login('beto@exemplo.test');
});
after(() => t.stop());

test('login com e-mail em caixa diferente funciona (e-mail é normalizado)', async () => {
  const r = await t.call('POST', '/api/auth/login', { body: { email: '  ANA@exemplo.TEST ', password: 'senha-de-teste-1' } });
  assert.equal(r.status, 200);
  assert.ok(r.body.token);
});

test('login com senha errada devolve 401 e nenhum token', async () => {
  const r = await t.call('POST', '/api/auth/login', { body: { email: 'ana@exemplo.test', password: 'errada' } });
  assert.equal(r.status, 401);
  assert.equal(r.body.token, undefined);
});

test('login sem senha devolve 400, não 500 do bcrypt', async () => {
  const r = await t.call('POST', '/api/auth/login', { body: { email: 'ana@exemplo.test' } });
  assert.equal(r.status, 400);
});

test('resposta de login e de listagem de usuários nunca expõe o hash da senha', async () => {
  const login = await t.call('POST', '/api/auth/login', { body: { email: 'ana@exemplo.test', password: 'senha-de-teste-1' } });
  assert.equal(login.body.user.passwordHash, undefined);
  const list = await t.call('GET', '/api/users', { token: adminToken });
  assert.equal(list.status, 200);
  for (const u of list.body.users) assert.equal(u.passwordHash, undefined);
});

test('rota protegida sem token devolve 401', async () => {
  const r = await t.call('GET', '/api/tasks');
  assert.equal(r.status, 401);
});

test('token assinado com outro segredo é recusado (não dá para forjar sessão)', async () => {
  const forged = jwt.sign({ uid: adminId }, 'outro-segredo');
  const r = await t.call('GET', '/api/auth/me', { token: forged });
  assert.equal(r.status, 401);
});

test('token expirado é recusado', async () => {
  const expired = jwt.sign({ uid: adminId }, process.env.JWT_SECRET, { expiresIn: -10 });
  const r = await t.call('GET', '/api/auth/me', { token: expired });
  assert.equal(r.status, 401);
});

test('token de usuário apagado deixa de valer (sessão não sobrevive à exclusão)', async () => {
  await t.createUser({ name: 'Cris Temporária', email: 'cris@exemplo.test' });
  const crisToken = await t.login('cris@exemplo.test');
  const users = (await t.call('GET', '/api/users', { token: adminToken })).body.users;
  const cris = users.find(u => u.email === 'cris@exemplo.test');
  assert.equal((await t.call('DELETE', '/api/users/' + cris.id, { token: adminToken })).status, 204);
  assert.equal((await t.call('GET', '/api/auth/me', { token: crisToken })).status, 401);
});

test('membro comum não cria usuário (não vira admin por conta própria)', async () => {
  const r = await t.call('POST', '/api/users', { token: memberToken, body: { name: 'X', email: 'x@exemplo.test', password: 'abcdef12', isAdmin: true } });
  assert.equal(r.status, 403);
});

test('membro comum não apaga usuário', async () => {
  const r = await t.call('DELETE', '/api/users/' + adminId, { token: memberToken });
  assert.equal(r.status, 403);
});

test('admin cria usuário com senha curta: recusado com 400', async () => {
  const r = await t.call('POST', '/api/users', { token: adminToken, body: { name: 'Dani', email: 'dani@exemplo.test', password: '123' } });
  assert.equal(r.status, 400);
});

test('e-mail duplicado (mesmo em caixa diferente) devolve 409', async () => {
  const body = { name: 'Edu', email: 'edu@exemplo.test', password: 'abcdef12' };
  assert.equal((await t.call('POST', '/api/users', { token: adminToken, body })).status, 201);
  const again = await t.call('POST', '/api/users', { token: adminToken, body: { ...body, email: 'EDU@exemplo.test' } });
  assert.equal(again.status, 409);
});

test('usuário criado pelo admin consegue entrar e guarda só o hash, não a senha', async () => {
  const body = { name: 'Fabi Lima', email: 'fabi@exemplo.test', password: 'abcdef12', isAdmin: 'true' };
  const created = await t.call('POST', '/api/users', { token: adminToken, body });
  assert.equal(created.status, 201);
  assert.equal(created.body.user.isAdmin, true);
  assert.equal(created.body.user.initials, 'FL');
  assert.ok(await t.login('fabi@exemplo.test', 'abcdef12'));
});

test('chave de API correta age como admin; chave errada é recusada', async () => {
  const ok = await t.call('GET', '/api/github/repos', { key: t.key });
  assert.equal(ok.status, 200);
  const bad = await t.call('GET', '/api/github/repos', { key: 'chave-errada-com-mesmo-tamanho' });
  assert.equal(bad.status, 401);
  const shorter = await t.call('GET', '/api/github/repos', { key: 'x' });
  assert.equal(shorter.status, 401);
});

test('rotas de GitHub exigem admin: membro comum recebe 403', async () => {
  const r = await t.call('GET', '/api/github/repos', { token: memberToken });
  assert.equal(r.status, 403);
});

test('ações feitas pela chave de API ficam atribuídas ao usuário de serviço', async () => {
  const r = await t.call('POST', '/api/tasks', { key: t.key, body: { title: 'Criada pelo agente' } });
  assert.equal(r.status, 201);
  assert.equal(r.body.task.createdBy, 'Integração (MCP/GPT)');
});

test('ID malformado em rota de exclusão devolve 400, não derruba o servidor', async () => {
  const r = await t.call('DELETE', '/api/users/nao-e-um-id', { token: adminToken });
  assert.equal(r.status, 400);
  assert.equal((await t.call('GET', '/api/auth/me', { token: adminToken })).status, 200);
});

test('JSON malformado no corpo devolve 400 em vez de 500 sem corpo', async () => {
  const res = await fetch(t.base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nao-e-json' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'JSON inválido.');
});
