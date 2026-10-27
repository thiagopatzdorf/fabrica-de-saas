// Sobe um MongoDB em memória e a API real numa porta efêmera.
// Se o binário do Mongo não puder ser baixado (sem rede), defina
// MONGODB_URI_TESTE apontando para um Mongo descartável.
process.env.JWT_SECRET = 'segredo-de-teste-nao-usar-em-producao';
process.env.MCP_API_KEY = 'chave-de-teste-mcp';
delete process.env.GITHUB_TOKEN;

const bcrypt = require('bcryptjs');
const { connectDb, getDb, closeDb } = require('../db');
const { createApp } = require('../app');

async function start() {
  let mongod = null;
  let uri = process.env.MONGODB_URI_TESTE;
  if (!uri) {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    uri = mongod.getUri();
  }
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB = 'teste_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
  await connectDb();
  const server = await new Promise(resolve => { const s = createApp().listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;

  async function call(method, path, { body, token, key } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    if (key) headers['x-api-key'] = key;
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { json = { raw: text }; }
    return { status: res.status, body: json };
  }

  async function createUser({ name = 'Pessoa Teste', email, password = 'senha-de-teste-1', isAdmin = false, githubUsername } ) {
    const r = await getDb().collection('users').insertOne({
      name, email: email.toLowerCase(), role: 'Colaborador', passwordHash: await bcrypt.hash(password, 4),
      initials: 'PT', color: '#0B71F5', isAdmin, githubUsername, createdAt: new Date().toISOString()
    });
    return r.insertedId.toString();
  }

  async function login(email, password = 'senha-de-teste-1') {
    const r = await call('POST', '/api/auth/login', { body: { email, password } });
    return r.body && r.body.token;
  }

  async function stop() {
    await new Promise(r => server.close(r));
    await getDb().dropDatabase();
    await closeDb();
    if (mongod) await mongod.stop();
  }

  return { base, call, createUser, login, stop, key: process.env.MCP_API_KEY };
}

module.exports = { start };
