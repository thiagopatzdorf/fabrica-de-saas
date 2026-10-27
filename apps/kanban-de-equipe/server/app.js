// Fábrica da aplicação Express. O index.js só conecta no banco e escuta a porta;
// separar aqui permite testar as rotas sem subir o servidor de verdade.
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { getDb, ObjectId } = require('./db');
const { toPublicUser, signToken, requireAuth, requireAuthOrApiKey, requireAdminOrApiKey } = require('./auth');
const { pickColor, initialsFromName } = require('./utils');
const { budgetFromThousands, DEFAULT_RATE, validateMoneyPatch } = require('./finance');
const githubSync = require('./githubSync');

const ROOT = path.join(__dirname, '..');
const COLUMNS = ['backlog', 'todo', 'doing', 'review', 'done'];
// Campos que o cliente pode alterar. Qualquer outro (githubRepoId, createdById,
// _id...) é ignorado: sem isso um PATCH religaria a tarefa a outro repositório.
const TASK_FIELDS = ['title', 'desc', 'projectId', 'assigneeId', 'col', 'priority', 'due', 'hours', 'tags', 'checklist', 'files', 'comments'];
const PROJECT_FIELDS = ['name', 'desc', 'color', 'due', 'status', 'budget', 'spent', 'rate'];

function toPublicDoc(doc) {
  const { _id, ...rest } = doc;
  return Object.assign({ id: _id.toString() }, rest);
}

function objectId(id) {
  try { return new ObjectId(id); } catch (e) { return null; }
}

function pick(body, fields) {
  const out = {};
  for (const f of fields) if (body && body[f] !== undefined) out[f] = body[f];
  return out;
}

// Express 4 não captura rejeição de handler async: sem isto uma falha do banco
// deixa a requisição pendurada e derruba o processo (unhandledRejection).
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  /* ---------- frontend estático (lista explícita, nunca serve server/ nem .git) ---------- */
  app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
  app.get('/index.html', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
  app.get('/app.js', (req, res) => res.sendFile(path.join(ROOT, 'app.js')));
  app.get('/styles.css', (req, res) => res.sendFile(path.join(ROOT, 'styles.css')));
  app.use('/assets', express.static(path.join(ROOT, 'assets')));
  app.get('/openapi.yaml', (req, res) => res.sendFile(path.join(__dirname, 'openapi.yaml')));

  /* ---------- auth ---------- */
  app.post('/api/auth/login', wrap(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const pass = String(req.body.password || '');
    if (!email || !pass) return res.status(400).json({ error: 'Informe e-mail e senha.' });
    const userDoc = await getDb().collection('users').findOne({ email });
    if (!userDoc) return res.status(401).json({ error: 'Não encontramos uma conta com esse e-mail.' });
    const ok = await bcrypt.compare(pass, userDoc.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Senha incorreta.' });
    const token = signToken(userDoc._id.toString());
    res.json({ token, user: toPublicUser(userDoc) });
  }));

  app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));

  /* ---------- users ---------- */
  app.get('/api/users', requireAuthOrApiKey, wrap(async (req, res) => {
    const docs = await getDb().collection('users').find({}).toArray();
    res.json({ users: docs.map(toPublicUser) });
  }));

  app.post('/api/users', requireAdminOrApiKey, wrap(async (req, res) => {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const pass = String(req.body.password || '');
    const role = String(req.body.role || '').trim() || 'Colaborador';
    const isAdmin = req.body.isAdmin === true || req.body.isAdmin === 'true';
    if (!name) return res.status(400).json({ error: 'Informe o nome da pessoa.' });
    if (!email || !pass) return res.status(400).json({ error: 'Informe e-mail e senha temporária.' });
    if (pass.length < 6) return res.status(400).json({ error: 'A senha temporária precisa ter pelo menos 6 caracteres.' });
    const existing = await getDb().collection('users').findOne({ email });
    if (existing) return res.status(409).json({ error: 'Já existe uma conta com esse e-mail.' });
    const passwordHash = await bcrypt.hash(pass, 10);
    const count = await getDb().collection('users').countDocuments();
    const githubUsername = String(req.body.githubUsername || '').trim();
    const doc = {
      name, email, role, passwordHash, isAdmin,
      initials: initialsFromName(name), color: pickColor(count),
      githubUsername: githubUsername || undefined,
      invitedBy: req.user.name, createdAt: new Date().toISOString()
    };
    const result = await getDb().collection('users').insertOne(doc);
    doc._id = result.insertedId;
    res.status(201).json({ user: toPublicUser(doc) });
  }));

  app.delete('/api/users/:id', requireAdminOrApiKey, wrap(async (req, res) => {
    const _id = objectId(req.params.id);
    if (!_id) return res.status(400).json({ error: 'ID inválido.' });
    await getDb().collection('users').deleteOne({ _id });
    res.status(204).end();
  }));

  /* ---------- projects ---------- */
  app.get('/api/projects', requireAuthOrApiKey, wrap(async (req, res) => {
    const docs = await getDb().collection('projects').find({}).toArray();
    res.json({ projects: docs.map(toPublicDoc) });
  }));

  app.post('/api/projects', requireAuthOrApiKey, wrap(async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Informe o nome do projeto.' });
    const count = await getDb().collection('projects').countDocuments();
    const doc = {
      name, desc: req.body.desc || 'Sem descrição.', color: pickColor(count),
      due: req.body.due || 'sem prazo', status: 'Planejado',
      budget: budgetFromThousands(req.body.hours), spent: 0, rate: DEFAULT_RATE,
      createdAt: new Date().toISOString()
    };
    const result = await getDb().collection('projects').insertOne(doc);
    doc._id = result.insertedId;
    res.status(201).json({ project: toPublicDoc(doc) });
  }));

  app.patch('/api/projects/:id', requireAuthOrApiKey, wrap(async (req, res) => {
    const _id = objectId(req.params.id);
    if (!_id) return res.status(400).json({ error: 'ID inválido.' });
    const patch = pick(req.body, PROJECT_FIELDS);
    const moneyError = validateMoneyPatch(patch);
    if (moneyError) return res.status(400).json({ error: moneyError });
    if (Object.keys(patch).length) await getDb().collection('projects').updateOne({ _id }, { $set: patch });
    const doc = await getDb().collection('projects').findOne({ _id });
    if (!doc) return res.status(404).json({ error: 'Projeto não encontrado.' });
    res.json({ project: toPublicDoc(doc) });
  }));

  app.delete('/api/projects/:id', requireAuthOrApiKey, wrap(async (req, res) => {
    const _id = objectId(req.params.id);
    if (!_id) return res.status(400).json({ error: 'ID inválido.' });
    await getDb().collection('projects').deleteOne({ _id });
    res.status(204).end();
  }));

  /* ---------- tasks ---------- */
  app.get('/api/tasks', requireAuthOrApiKey, wrap(async (req, res) => {
    const docs = await getDb().collection('tasks').find({}).toArray();
    res.json({ tasks: docs.map(toPublicDoc) });
  }));

  app.post('/api/tasks', requireAuthOrApiKey, wrap(async (req, res) => {
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Informe o título da tarefa.' });
    const col = req.body.col || 'todo';
    if (!COLUMNS.includes(col)) return res.status(400).json({ error: 'Coluna inválida: ' + col + '.' });
    const doc = {
      title, desc: req.body.desc || 'Sem descrição.', projectId: req.body.projectId || '',
      assigneeId: req.body.assigneeId || '', col,
      priority: req.body.priority || 'Média', due: req.body.due || 'sem prazo',
      hours: req.body.hours || 0, tags: [], createdBy: req.user.name, createdById: req.user.id,
      checklist: [], files: [], comments: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    const result = await getDb().collection('tasks').insertOne(doc);
    doc._id = result.insertedId;
    res.status(201).json({ task: toPublicDoc(doc) });
  }));

  app.patch('/api/tasks/:id', requireAuthOrApiKey, wrap(async (req, res) => {
    const _id = objectId(req.params.id);
    if (!_id) return res.status(400).json({ error: 'ID inválido.' });
    const before = await getDb().collection('tasks').findOne({ _id });
    if (!before) return res.status(404).json({ error: 'Tarefa não encontrada.' });
    const patch = pick(req.body, TASK_FIELDS);
    if (patch.col !== undefined && !COLUMNS.includes(patch.col)) return res.status(400).json({ error: 'Coluna inválida: ' + patch.col + '.' });
    patch.updatedAt = new Date().toISOString();
    if (before.githubRepoId) await githubSync.pushTaskChangeToGithub(before, patch).catch(e => console.error(e));
    await getDb().collection('tasks').updateOne({ _id }, { $set: patch });
    const doc = await getDb().collection('tasks').findOne({ _id });
    res.json({ task: toPublicDoc(doc) });
  }));

  app.delete('/api/tasks/:id', requireAuthOrApiKey, wrap(async (req, res) => {
    const _id = objectId(req.params.id);
    if (!_id) return res.status(400).json({ error: 'ID inválido.' });
    await getDb().collection('tasks').deleteOne({ _id });
    res.status(204).end();
  }));

  /* ---------- GitHub Issues <-> Kanban sync ---------- */
  app.get('/api/github/repos', requireAdminOrApiKey, wrap(async (req, res) => {
    const docs = await getDb().collection('githubRepos').find({}).toArray();
    res.json({ repos: docs.map(toPublicDoc) });
  }));

  app.post('/api/github/repos', requireAdminOrApiKey, wrap(async (req, res) => {
    const owner = String(req.body.owner || '').trim();
    const repo = String(req.body.repo || '').trim();
    if (!owner || !repo) return res.status(400).json({ error: 'Informe owner e repo (ex: minha-empresa/meu-projeto).' });
    try {
      const result = await githubSync.connectRepo(owner, repo);
      res.status(201).json({ repo: toPublicDoc(result.repo), project: toPublicDoc(result.project), summary: result.summary });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  }));

  app.delete('/api/github/repos/:id', requireAdminOrApiKey, wrap(async (req, res) => {
    const _id = objectId(req.params.id);
    if (!_id) return res.status(400).json({ error: 'ID inválido.' });
    await getDb().collection('githubRepos').deleteOne({ _id });
    res.status(204).end();
  }));

  app.post('/api/github/sync', requireAdminOrApiKey, wrap(async (req, res) => {
    try {
      const results = await githubSync.syncAll();
      res.json({ results });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return;
    res.status(err.type === 'entity.parse.failed' ? 400 : 500).json({ error: err.type === 'entity.parse.failed' ? 'JSON inválido.' : 'Erro interno do servidor.' });
  });

  return app;
}

module.exports = { createApp, toPublicDoc, COLUMNS };
