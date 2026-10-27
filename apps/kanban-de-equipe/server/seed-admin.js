// Cria (ou promove) o primeiro administrador. Rode uma vez, no servidor.
// Sem credencial padrão: nome, e-mail e senha vêm dos argumentos ou do ambiente.
//   node seed-admin.js "Nome Completo" email@exemplo.com 'senha-forte' [Função]
//   SEED_ADMIN_NAME=... SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... node seed-admin.js
// Prefira as variáveis de ambiente: argumento de linha de comando aparece no `ps`
// e no histórico do shell.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { connectDb, getDb } = require('./db');
const { pickColor, initialsFromName } = require('./utils');

async function main() {
  const args = process.argv.slice(2);
  const name = args[0] || process.env.SEED_ADMIN_NAME;
  const email = args[1] || process.env.SEED_ADMIN_EMAIL;
  const pass = args[2] || process.env.SEED_ADMIN_PASSWORD;
  const role = args[3] || process.env.SEED_ADMIN_ROLE;
  if (!name || !email || !pass) {
    console.error('Uso: node seed-admin.js "Nome Completo" email@exemplo.com senha [Função]');
    console.error('Ou defina SEED_ADMIN_NAME, SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD.');
    process.exit(1);
  }
  if (pass.length < 8) {
    console.error('A senha precisa ter pelo menos 8 caracteres.');
    process.exit(1);
  }
  await connectDb();
  const db = getDb();
  const emailNorm = email.trim().toLowerCase();
  const existing = await db.collection('users').findOne({ email: emailNorm });
  if (existing) {
    await db.collection('users').updateOne({ _id: existing._id }, { $set: { isAdmin: true } });
    console.log('Conta já existia — promovida a admin:', emailNorm);
  } else {
    const passwordHash = await bcrypt.hash(pass, 10);
    const count = await db.collection('users').countDocuments();
    await db.collection('users').insertOne({
      name, email: emailNorm, role: role || 'Admin', passwordHash,
      initials: initialsFromName(name), color: pickColor(count),
      isAdmin: true, createdAt: new Date().toISOString()
    });
    console.log('Admin criado:', emailNorm);
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
