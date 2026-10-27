require('dotenv').config();
const { connectDb } = require('./db');
const { createApp } = require('./app');
const githubSync = require('./githubSync');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-this-to-a-long-random-string') {
  // Sem segredo próprio qualquer pessoa forjaria um token de admin.
  console.error('Defina JWT_SECRET no .env com uma string longa e aleatória.');
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
connectDb().then(() => {
  createApp().listen(PORT, () => console.log('Kanban de Equipe ouvindo na porta ' + PORT));
  if (process.env.GITHUB_TOKEN) {
    const minutes = Number(process.env.GITHUB_SYNC_MINUTES) || 5;
    setInterval(() => githubSync.syncAll().catch(e => console.error('github sync tick failed:', e.message)), minutes * 60000);
    console.log('GitHub sync enabled, polling every ' + minutes + ' min.');
  }
}).catch(e => {
  console.error('Failed to connect to MongoDB:', e.message);
  process.exit(1);
});
