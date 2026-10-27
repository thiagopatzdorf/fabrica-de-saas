// Ponto Eletrônico: app de ponto (Cloudflare Worker + D1 + Static Assets) no mesmo Worker.
// Arquivos (site/) são Static Assets; este código acorda só para /api/*.
// - RH: entra com e-mail e senha, cadastra locais e funcionários, gera o link de ativação de cada um,
//   vê o espelho do mês (tela, CSV) e ajusta com motivo. Tudo vira linha de auditoria.
// - Funcionário: abre o link no celular, aceita o termo (LGPD), cadastra o rosto e passa a bater ponto
//   com localização e rosto. O celular calcula o vetor do rosto; quem compara é o servidor.
// Falha FECHADA: sem SEGREDO nada é cifrado, assinado ou aceito.
import { aleatorio, assinar, cifrar, conferirSenha, decifrar, hashSenha, hmac, sha256, verificar } from "./src/cripto.js";
import { cnpjValido, cpfFormatado, cpfValido, distanciaM, semelhanca, soDigitos, veredito, vetorValido } from "./src/regras.js";
import { calcularEspelho, diaLocal, espelhoCsv, horaLocal, limitesDoMes, mesValido, msDe } from "./src/espelho.js";

export const TERMO_VERSAO = "2026-10-21";
const CAB = { "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "strict-transport-security": "max-age=31536000" };
const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CAB, ...extra } });
const erro = (msg, status) => json({ erro: msg }, status);
const agoraS = () => Math.floor(Date.now() / 1000);
const id = () => aleatorio(12);
const texto = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Escrita só por JSON do próprio site: formulário de outro domínio não consegue mandar application/json sem preflight.
function mesmaOrigem(pedido) {
  if (!(pedido.headers.get("content-type") || "").startsWith("application/json")) return false;
  const o = pedido.headers.get("origin");
  return !o || o === new URL(pedido.url).origin;
}
const corpo = async (p) => { try { return await p.json(); } catch { return null; } };
function lerCookie(pedido, nome) {
  for (const parte of (pedido.headers.get("cookie") || "").split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === nome) return v.join("=");
  }
  return "";
}
const COOKIE = { rh: "ponto_rh", func: "ponto_func" };
const DURACAO = { rh: 12 * 3600, func: 180 * 24 * 3600 };
const cookie = (tipo, valor, seg) => `${COOKIE[tipo]}=${valor}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seg}`;

async function criarSessao(env, tipo, quem, empresa, versao = 0) {
  const token = aleatorio(32);
  await env.DB.prepare("INSERT INTO sessoes (hash, tipo, quem, empresa, versao, expira) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(await sha256(token), tipo, quem, empresa, versao, agoraS() + DURACAO[tipo]).run();
  return cookie(tipo, token, DURACAO[tipo]);
}
async function sessao(env, pedido, tipo) {
  const t = lerCookie(pedido, COOKIE[tipo]);
  if (!t) return null;
  const s = await env.DB.prepare("SELECT * FROM sessoes WHERE hash = ? AND tipo = ? AND expira > ?").bind(await sha256(t), tipo, agoraS()).first();
  if (!s) return null;
  if (tipo === "func") {
    // Link de ativação novo aumenta `dispositivo`: o celular antigo (perdido, trocado) perde o acesso na hora.
    const f = await env.DB.prepare("SELECT * FROM funcionarios WHERE id = ? AND empresa = ? AND ativo = 1").bind(s.quem, s.empresa).first();
    if (!f || f.dispositivo !== s.versao) return null;
    return { ...s, funcionario: f };
  }
  return s;
}

// Limite por chave numa janela (tabela `limites`): segura força bruta de senha e ponto duplicado.
async function dentroDoLimite(env, chave, max, janela) {
  const agora = agoraS();
  const l = await env.DB.prepare("SELECT n, ate FROM limites WHERE chave = ?").bind(chave).first();
  if (!l || l.ate < agora) { await env.DB.prepare("INSERT OR REPLACE INTO limites (chave, n, ate) VALUES (?, 1, ?)").bind(chave, agora + janela).run(); return true; }
  if (l.n >= max) return false;
  await env.DB.prepare("UPDATE limites SET n = n + 1 WHERE chave = ?").bind(chave).run();
  return true;
}
const auditar = (env, empresa, quem, acao, detalhe) =>
  env.DB.prepare("INSERT INTO auditoria (empresa, quem, acao, detalhe, quando) VALUES (?, ?, ?, ?, ?)").bind(empresa, quem, acao, detalhe, Date.now()).run();
const ipHash = async (env, pedido) => (await hmac(pedido.headers.get("cf-connecting-ip") || "", env.SEGREDO)).slice(0, 16);

// ------------------------------------------------------------------ instalação (convite assinado, uso único)
async function instalar(env, b) {
  const c = await verificar(b?.convite, env.SEGREDO);
  if (!c || c.c !== "ponto-instalar") return erro("Convite inválido ou vencido. Gere um novo (veja o README).", 403);
  if (await env.DB.prepare("SELECT 1 FROM convites_usados WHERE id = ?").bind(c.id).first()) return erro("Este convite já foi usado.", 409);
  const nome = texto(b?.empresa?.nome, 120), cnpj = soDigitos(b?.empresa?.cnpj);
  const rhNome = texto(b?.rh?.nome, 120), email = texto(b?.rh?.email, 160).toLowerCase(), senha = typeof b?.rh?.senha === "string" ? b.rh.senha : "";
  if (nome.length < 2) return erro("Informe o nome da empresa.", 400);
  if (!cnpjValido(cnpj)) return erro("CNPJ inválido.", 400);
  if (rhNome.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return erro("Informe nome e e-mail de quem cuida do RH.", 400);
  if (senha.length < 10) return erro("A senha precisa de pelo menos 10 caracteres.", 400);
  if (await env.DB.prepare("SELECT 1 FROM rh WHERE email = ?").bind(email).first()) return erro("Este e-mail já tem acesso.", 409);
  const empresa = id(), rh = id(), agora = Date.now();
  await env.DB.prepare("INSERT INTO convites_usados (id, usado) VALUES (?, ?)").bind(c.id, agora).run();
  await env.DB.prepare("INSERT INTO empresas (id, nome, cnpj, criado) VALUES (?, ?, ?, ?)").bind(empresa, nome, cnpj, agora).run();
  await env.DB.prepare("INSERT INTO rh (id, empresa, nome, email, senha, criado) VALUES (?, ?, ?, ?, ?, ?)").bind(rh, empresa, rhNome, email, await hashSenha(senha), agora).run();
  await auditar(env, empresa, rhNome, "instalou o sistema", `empresa ${nome}, CNPJ ${cnpj}`);
  return json({ ok: true }, 201, { "set-cookie": await criarSessao(env, "rh", rh, empresa) });
}

// ------------------------------------------------------------------ RH
async function apiRh(pedido, env, url, s) {
  const { pathname: p } = url, m = pedido.method;
  const rh = await env.DB.prepare("SELECT id, nome, email FROM rh WHERE id = ?").bind(s.quem).first();
  const empresa = await env.DB.prepare("SELECT * FROM empresas WHERE id = ?").bind(s.empresa).first();
  if (!rh || !empresa) return erro("não autorizado", 401);
  const quem = rh.nome;
  if (m !== "GET" && !mesmaOrigem(pedido)) return erro("pedido recusado", 403);
  const b = m === "GET" ? null : (await corpo(pedido)) || {};

  if (p === "/api/rh/eu" && m === "GET") return json({ rh, empresa: { nome: empresa.nome, cnpj: empresa.cnpj, limiar: empresa.limiar, limiar_revisao: empresa.limiar_revisao } });
  if (p === "/api/rh/sair" && m === "POST") {
    await env.DB.prepare("DELETE FROM sessoes WHERE hash = ?").bind(await sha256(lerCookie(pedido, COOKIE.rh))).run();
    return json({ ok: true }, 200, { "set-cookie": cookie("rh", "", 0) });
  }
  if (p === "/api/rh/locais" && m === "GET") return json({ locais: (await env.DB.prepare("SELECT id, nome, lat, lng, raio_m, exigir FROM locais WHERE empresa = ? ORDER BY nome").bind(s.empresa).all()).results });
  if (p === "/api/rh/locais" && m === "POST") {
    const nome = texto(b.nome, 80), lat = Number(b.lat), lng = Number(b.lng), raio = Math.round(Number(b.raio_m));
    if (nome.length < 2) return erro("Dê um nome ao local.", 400);
    if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180) || !Number.isFinite(lat) || !Number.isFinite(lng)) return erro("Latitude e longitude inválidas.", 400);
    if (!(raio >= 20 && raio <= 2000)) return erro("O raio da cerca vai de 20 a 2000 metros.", 400);
    const novo = id();
    await env.DB.prepare("INSERT INTO locais (id, empresa, nome, lat, lng, raio_m, exigir, criado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(novo, s.empresa, nome, lat, lng, raio, b.exigir === false ? 0 : 1, Date.now()).run();
    await auditar(env, s.empresa, quem, "cadastrou local", `${nome}: ${lat.toFixed(5)}, ${lng.toFixed(5)}, raio ${raio} m`);
    return json({ id: novo }, 201);
  }
  if (p === "/api/rh/funcionarios" && m === "GET") {
    const r = await env.DB.prepare(`SELECT f.id, f.nome, f.matricula, f.jornada_min, f.intervalo_min, f.local, f.ativo, f.admissao,
      f.rosto IS NOT NULL AS rosto, f.consentimento_em, (SELECT MAX(quando) FROM marcacoes WHERE funcionario = f.id AND empresa = f.empresa) AS ultimo
      FROM funcionarios f WHERE f.empresa = ? ORDER BY f.ativo DESC, f.nome`).bind(s.empresa).all();
    return json({ funcionarios: r.results.map((f) => ({ ...f, rosto: Boolean(f.rosto) })) });
  }
  if (p === "/api/rh/funcionarios" && m === "POST") {
    const nome = texto(b.nome, 120), cpf = soDigitos(b.cpf), jornada = Math.round(Number(b.jornada_min ?? 480)), intervalo = Math.round(Number(b.intervalo_min ?? 60));
    if (nome.length < 3) return erro("Informe o nome completo.", 400);
    if (!cpfValido(cpf)) return erro("CPF inválido.", 400);
    if (!(jornada >= 60 && jornada <= 720) || !(intervalo >= 0 && intervalo <= 240)) return erro("Jornada de 1 a 12 horas e intervalo de até 4 horas.", 400);
    if (b.local && !(await env.DB.prepare("SELECT 1 FROM locais WHERE id = ? AND empresa = ?").bind(b.local, s.empresa).first())) return erro("Local não encontrado.", 400);
    const cpfHash = await hmac(cpf, env.SEGREDO);
    if (await env.DB.prepare("SELECT 1 FROM funcionarios WHERE empresa = ? AND cpf_hash = ?").bind(s.empresa, cpfHash).first()) return erro("Já existe um funcionário com este CPF.", 409);
    const novo = id();
    const admissao = /^\d{4}-\d{2}-\d{2}$/.test(b.admissao || "") ? b.admissao : null;
    await env.DB.prepare(`INSERT INTO funcionarios (id, empresa, nome, cpf_hash, cpf_cifrado, matricula, jornada_min, intervalo_min, local, admissao, criado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(novo, s.empresa, nome, cpfHash, await cifrar(cpf, env.SEGREDO, "cpf"), texto(b.matricula, 30) || null,
      jornada, intervalo, b.local || null, admissao, Date.now()).run();
    await auditar(env, s.empresa, quem, "cadastrou funcionário", nome);
    return json({ id: novo }, 201);
  }
  const mf = p.match(/^\/api\/rh\/funcionarios\/([\w-]{8,32})\/(ativacao|rosto\/apagar|desativar)$/);
  if (mf && m === "POST") {
    const f = await env.DB.prepare("SELECT * FROM funcionarios WHERE id = ? AND empresa = ?").bind(mf[1], s.empresa).first();
    if (!f) return erro("Funcionário não encontrado.", 404);
    if (mf[2] === "ativacao") {
      if (!f.ativo) return erro("Funcionário desativado.", 409);
      const token = aleatorio(24);
      // `dispositivo + 1` derruba a sessão do celular anterior: um link novo é sempre "este celular, só este".
      await env.DB.prepare("UPDATE funcionarios SET ativacao_hash = ?, ativacao_expira = ?, dispositivo = dispositivo + 1 WHERE id = ?")
        .bind(await sha256(token), agoraS() + 7 * 24 * 3600, f.id).run();
      await auditar(env, s.empresa, quem, "gerou link de ativação", `${f.nome} (o celular anterior perde o acesso)`);
      return json({ url: `${url.origin}/app/ativar#${token}`, expira_em_dias: 7 });
    }
    if (mf[2] === "rosto/apagar") {
      await env.DB.prepare("UPDATE funcionarios SET rosto = NULL, rosto_em = NULL WHERE id = ?").bind(f.id).run();
      await auditar(env, s.empresa, quem, "apagou o cadastro do rosto", `${f.nome} (precisa cadastrar de novo para bater ponto)`);
      return json({ ok: true });
    }
    await env.DB.prepare("UPDATE funcionarios SET ativo = 0, dispositivo = dispositivo + 1, ativacao_hash = NULL WHERE id = ?").bind(f.id).run();
    await auditar(env, s.empresa, quem, "desativou funcionário", f.nome);
    return json({ ok: true });
  }
  if ((p === "/api/rh/espelho" || p === "/api/rh/espelho.csv") && m === "GET") {
    const mes = url.searchParams.get("mes"), fid = url.searchParams.get("funcionario");
    if (!mesValido(mes)) return erro("Mês inválido (AAAA-MM).", 400);
    const f = await env.DB.prepare("SELECT * FROM funcionarios WHERE id = ? AND empresa = ?").bind(fid, s.empresa).first();
    if (!f) return erro("Funcionário não encontrado.", 404);
    const { inicio, fim } = limitesDoMes(mes);
    const marcacoes = (await env.DB.prepare("SELECT id, nsr, quando, dentro, revisar, distancia_m, semelhanca FROM marcacoes WHERE empresa = ? AND funcionario = ? AND quando BETWEEN ? AND ? ORDER BY quando")
      .bind(s.empresa, f.id, inicio, fim).all()).results;
    const ajustes = (await env.DB.prepare("SELECT id, tipo, quando, marcacao, motivo, autor, criado FROM ajustes WHERE empresa = ? AND funcionario = ?").bind(s.empresa, f.id).all()).results
      .filter((a) => a.tipo === "desconsiderar" || (a.quando >= inicio && a.quando <= fim));
    const esp = calcularEspelho({ mes, marcacoes, ajustes, jornada_min: f.jornada_min, inicio: f.admissao || diaLocal(f.criado) });
    const cpf = await decifrar(f.cpf_cifrado, env.SEGREDO, "cpf");
    const cab = { empresa: empresa.nome, cnpj: empresa.cnpj, nome: f.nome, cpf: cpf ? cpfFormatado(cpf) : "", matricula: f.matricula, admissao: f.admissao, jornada_min: f.jornada_min, intervalo_min: f.intervalo_min };
    await auditar(env, s.empresa, quem, p.endsWith(".csv") ? "exportou espelho (CSV)" : "abriu espelho", `${f.nome}, ${mes}`);
    if (p.endsWith(".csv")) return new Response(espelhoCsv(esp, cab), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="espelho-${mes}-${f.nome.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}.csv"`, "cache-control": "no-store", ...CAB } });
    return json({ cabecalho: cab, espelho: esp, ajustes, gerado_em: Date.now() });
  }
  if (p === "/api/rh/ajustes" && m === "POST") {
    const f = await env.DB.prepare("SELECT id, nome FROM funcionarios WHERE id = ? AND empresa = ?").bind(b.funcionario, s.empresa).first();
    if (!f) return erro("Funcionário não encontrado.", 404);
    const motivo = texto(b.motivo, 300);
    if (motivo.length < 5) return erro("Escreva o motivo do ajuste (fica no espelho e na auditoria).", 400);
    if (b.tipo === "incluir") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.dia || "") || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.hora || "")) return erro("Informe dia e hora.", 400);
      const quando = msDe(b.dia, b.hora);
      if (quando > Date.now()) return erro("Não dá para incluir marcação no futuro.", 400);
      const novo = id();
      await env.DB.prepare("INSERT INTO ajustes (id, empresa, funcionario, tipo, quando, motivo, autor, criado) VALUES (?, ?, ?, 'incluir', ?, ?, ?, ?)").bind(novo, s.empresa, f.id, quando, motivo, quem, Date.now()).run();
      await auditar(env, s.empresa, quem, "incluiu marcação", `${f.nome}: ${b.dia.split("-").reverse().join("/")} ${b.hora}. Motivo: ${motivo}`);
      return json({ id: novo }, 201);
    }
    if (b.tipo === "desconsiderar") {
      const mk = await env.DB.prepare("SELECT id, nsr, quando FROM marcacoes WHERE id = ? AND empresa = ? AND funcionario = ?").bind(b.marcacao, s.empresa, f.id).first();
      if (!mk) return erro("Marcação não encontrada.", 404);
      if (await env.DB.prepare("SELECT 1 FROM ajustes WHERE empresa = ? AND marcacao = ? AND tipo = 'desconsiderar'").bind(s.empresa, mk.id).first()) return erro("Esta marcação já foi desconsiderada.", 409);
      const novo = id();
      await env.DB.prepare("INSERT INTO ajustes (id, empresa, funcionario, tipo, marcacao, motivo, autor, criado) VALUES (?, ?, ?, 'desconsiderar', ?, ?, ?, ?)").bind(novo, s.empresa, f.id, mk.id, motivo, quem, Date.now()).run();
      await auditar(env, s.empresa, quem, "desconsiderou marcação", `${f.nome}: NSR ${mk.nsr}, ${diaLocal(mk.quando).split("-").reverse().join("/")} ${horaLocal(mk.quando)}. Motivo: ${motivo}`);
      return json({ id: novo }, 201);
    }
    return erro("Tipo de ajuste inválido.", 400);
  }
  const mfoto = p.match(/^\/api\/rh\/foto\/([\w-]{8,32})$/);
  if (mfoto && m === "GET") {
    const f = await env.DB.prepare("SELECT jpeg FROM fotos WHERE marcacao = ? AND empresa = ?").bind(mfoto[1], s.empresa).first();
    if (!f) return erro("Sem foto.", 404);
    return new Response(f.jpeg, { headers: { "content-type": "image/jpeg", "cache-control": "private, no-store", ...CAB } });
  }
  if (p === "/api/rh/auditoria" && m === "GET") return json({ auditoria: (await env.DB.prepare("SELECT quem, acao, detalhe, quando FROM auditoria WHERE empresa = ? ORDER BY id DESC LIMIT 200").bind(s.empresa).all()).results });
  return erro("não encontrado", 404);
}

// ------------------------------------------------------------------ funcionário
async function ativacao(env, token) {
  if (typeof token !== "string" || token.length < 20) return null;
  return env.DB.prepare("SELECT * FROM funcionarios WHERE ativacao_hash = ? AND ativacao_expira > ? AND ativo = 1").bind(await sha256(token), agoraS()).first();
}

async function ativar(env, b) {
  const f = await ativacao(env, b?.token);
  if (!f) return erro("Link de ativação inválido ou vencido. Peça um novo ao RH.", 403);
  if (b.consentimento !== true) return erro("Para usar o rosto no ponto é preciso aceitar o termo.", 400);
  const vetores = Array.isArray(b.vetores) ? b.vetores : [];
  const reais = Array.isArray(b.reais) ? b.reais : [];
  if (vetores.length !== 3 || !vetores.every(vetorValido)) return erro("Cadastro do rosto incompleto. Tire as três fotos.", 400);
  const empresa = await env.DB.prepare("SELECT limiar_revisao, real_minimo, exigir_piscar FROM empresas WHERE id = ?").bind(f.empresa).first();
  if (empresa.exigir_piscar && b.piscou !== true) return erro("Não vi você piscar. Tente de novo e pisque devagar quando pedir.", 400);
  if (reais.length !== 3 || !reais.every((r) => r >= empresa.real_minimo)) return erro("Não deu para confirmar que é uma pessoa na frente da câmera. Tente com boa luz.", 400);
  // As três fotos têm de ser da mesma pessoa: sem isso, dava para cadastrar dois rostos num funcionário só.
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    if (semelhanca(vetores[i], vetores[j]) < empresa.limiar_revisao) return erro("As três fotos não parecem ser da mesma pessoa. Tente de novo, só você na câmera.", 400);
  }
  await env.DB.prepare("UPDATE funcionarios SET rosto = ?, rosto_em = ?, consentimento_em = ?, termo_versao = ?, ativacao_hash = NULL, ativacao_expira = NULL WHERE id = ?")
    .bind(await cifrar(vetores, env.SEGREDO, "rosto"), Date.now(), Date.now(), TERMO_VERSAO, f.id).run();
  await auditar(env, f.empresa, f.nome, "ativou o celular e cadastrou o rosto", `termo ${TERMO_VERSAO} aceito`);
  return json({ ok: true }, 200, { "set-cookie": await criarSessao(env, "func", f.id, f.empresa, f.dispositivo) });
}

async function eu(env, s) {
  const f = s.funcionario;
  const empresa = await env.DB.prepare("SELECT nome, exigir_piscar FROM empresas WHERE id = ?").bind(f.empresa).first();
  const local = f.local ? await env.DB.prepare("SELECT nome, lat, lng, raio_m, exigir FROM locais WHERE id = ? AND empresa = ?").bind(f.local, f.empresa).first() : null;
  const dia = diaLocal(Date.now());
  const hoje = (await env.DB.prepare("SELECT nsr, quando FROM marcacoes WHERE empresa = ? AND funcionario = ? AND quando >= ? ORDER BY quando").bind(f.empresa, f.id, msDe(dia, "00:00")).all()).results;
  return json({ nome: f.nome, empresa: empresa?.nome, piscar: Boolean(empresa?.exigir_piscar), local, rosto: Boolean(f.rosto), hoje: hoje.map((m) => ({ nsr: m.nsr, hora: horaLocal(m.quando) })) });
}

function decodificarFoto(b64) {
  if (typeof b64 !== "string" || b64.length > 120000) return null;
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return bytes[0] === 0xff && bytes[1] === 0xd8 ? bytes : null;
  } catch { return null; }
}

async function baterPonto(env, pedido, s, b) {
  const f = s.funcionario;
  if (!f.rosto) return erro("Seu rosto ainda não foi cadastrado. Peça ao RH um link de ativação.", 409);
  // Duplicado = ponto REGISTRADO há menos de 1 min (tentativa recusada não conta, senão quem errou a foto
  // teria de esperar). Tentativas, certas ou não, têm teto próprio.
  const ultimo = await env.DB.prepare("SELECT MAX(quando) AS q FROM marcacoes WHERE empresa = ? AND funcionario = ?").bind(f.empresa, f.id).first();
  if (ultimo?.q && Date.now() - ultimo.q < 60000) return erro("Você acabou de registrar o ponto. Espere um minuto para registrar de novo.", 429);
  if (!(await dentroDoLimite(env, `tentativa:${f.id}`, 20, 600))) return erro("Muitas tentativas seguidas. Espere 10 minutos ou fale com o RH.", 429);
  const empresa = await env.DB.prepare("SELECT * FROM empresas WHERE id = ?").bind(f.empresa).first();
  if (!vetorValido(b?.vetor)) return erro("Não foi possível ler o rosto. Tente de novo.", 400);
  if (empresa.exigir_piscar && b.piscou !== true) {
    await auditar(env, f.empresa, f.nome, "ponto recusado", "não piscou no desafio (foto na frente da câmera?)");
    return erro("Não vi você piscar. Tente de novo e pisque devagar quando pedir.", 403);
  }
  // Localização: a precisão informada pelo celular entra como tolerância (até 100 m), senão quem está
  // na porta com GPS ruim ficaria "fora" sem estar.
  const lat = Number(b.lat), lng = Number(b.lng), precisao = Math.max(0, Number(b.precisao) || 0);
  const temGps = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0);
  const local = f.local ? await env.DB.prepare("SELECT * FROM locais WHERE id = ? AND empresa = ?").bind(f.local, f.empresa).first() : null;
  let distancia = null, dentro = 1;
  if (local) {
    if (!temGps) return erro("Ative a localização do celular para registrar o ponto.", 400);
    distancia = Math.round(distanciaM(lat, lng, local.lat, local.lng));
    dentro = distancia - Math.min(precisao, 100) <= local.raio_m ? 1 : 0;
    if (!dentro && local.exigir) {
      const msg = `Você está a ${distancia} m de ${local.nome}. O ponto só vale a até ${local.raio_m} m.`;
      await auditar(env, f.empresa, f.nome, "ponto recusado", `${msg} (precisão ${Math.round(precisao)} m)`);
      return erro(msg, 403);
    }
  }
  const modelos = await decifrar(f.rosto, env.SEGREDO, "rosto");
  if (!Array.isArray(modelos)) return erro("Cadastro do rosto ilegível. Peça ao RH um novo link de ativação.", 409);
  const sem = Math.max(...modelos.map((v) => semelhanca(b.vetor, v)));
  const real = Number(b.real), vivo = Number(b.vivo);
  const v = veredito({ semelhanca: sem, real }, empresa);
  if (!v.ok) {
    await auditar(env, f.empresa, f.nome, "ponto recusado", `${v.motivo} (semelhança ${sem.toFixed(2)}, real ${Number.isFinite(real) ? real.toFixed(2) : "?"})`);
    return erro(v.motivo, 403);
  }
  // NSR sequencial por empresa (UPDATE ... RETURNING é atômico no D1) e hash encadeado por funcionário:
  // apagar ou trocar uma marcação no banco quebra a cadeia e aparece na conferência.
  const { nsr } = await env.DB.prepare("UPDATE empresas SET nsr = nsr + 1 WHERE id = ? RETURNING nsr").bind(f.empresa).first();
  const quando = Date.now();
  const ant = await env.DB.prepare("SELECT hash FROM marcacoes WHERE empresa = ? AND funcionario = ? ORDER BY quando DESC LIMIT 1").bind(f.empresa, f.id).first();
  const anterior = ant?.hash || "0".repeat(64);
  const hash = await sha256([anterior, f.empresa, f.id, nsr, quando, temGps ? lat.toFixed(6) : "", temGps ? lng.toFixed(6) : ""].join("|"));
  const mid = id();
  await env.DB.prepare(`INSERT INTO marcacoes (id, empresa, funcionario, nsr, quando, lat, lng, precisao_m, local, distancia_m, dentro, semelhanca, real, vivo, revisar, ip_hash, hash_anterior, hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(mid, f.empresa, f.id, nsr, quando, temGps ? lat : null, temGps ? lng : null, temGps ? precisao : null,
    local?.id || null, distancia, dentro, sem, Number.isFinite(real) ? real : null, Number.isFinite(vivo) ? vivo : null, v.revisar ? 1 : 0, await ipHash(env, pedido), anterior, hash).run();
  const foto = decodificarFoto(b.foto);
  if (foto) await env.DB.prepare("INSERT INTO fotos (marcacao, empresa, jpeg) VALUES (?, ?, ?)").bind(mid, f.empresa, foto).run();
  const cpf = await decifrar(f.cpf_cifrado, env.SEGREDO, "cpf");
  return json({ comprovante: { nsr, dia: diaLocal(quando).split("-").reverse().join("/"), hora: horaLocal(quando), empresa: empresa.nome, cnpj: empresa.cnpj,
    nome: f.nome, cpf: cpf ? cpfFormatado(cpf) : "", local: local?.nome || null, distancia_m: distancia, dentro: Boolean(dentro), revisar: v.revisar, hash } }, 201);
}

// ------------------------------------------------------------------ roteador
async function api(pedido, env, url) {
  if (!env.SEGREDO || !env.DB) return erro("O sistema ainda não foi configurado (faltam SEGREDO ou DB).", 503);
  const { pathname: p } = url, m = pedido.method;
  if (m !== "GET" && !mesmaOrigem(pedido)) return erro("pedido recusado", 403);
  if (p === "/api/instalar" && m === "POST") return instalar(env, await corpo(pedido));
  if (p === "/api/entrar" && m === "POST") {
    const b = (await corpo(pedido)) || {};
    const email = texto(b.email, 160).toLowerCase();
    if (!(await dentroDoLimite(env, `entrar:${await ipHash(env, pedido)}`, 10, 900))) return erro("Muitas tentativas. Espere 15 minutos.", 429);
    const rh = email ? await env.DB.prepare("SELECT * FROM rh WHERE email = ?").bind(email).first() : null;
    if (!rh || !(await conferirSenha(String(b.senha || ""), rh.senha))) return erro("E-mail ou senha não conferem.", 401);
    await auditar(env, rh.empresa, rh.nome, "entrou no painel", "");
    return json({ ok: true }, 200, { "set-cookie": await criarSessao(env, "rh", rh.id, rh.empresa) });
  }
  if (p === "/api/ativacao/info" && m === "POST") {
    const f = await ativacao(env, (await corpo(pedido))?.token);
    if (!f) return erro("Link de ativação inválido ou vencido. Peça um novo ao RH.", 403);
    const e = await env.DB.prepare("SELECT nome, exigir_piscar FROM empresas WHERE id = ?").bind(f.empresa).first();
    return json({ nome: f.nome, empresa: e.nome, termo_versao: TERMO_VERSAO, piscar: Boolean(e.exigir_piscar) });
  }
  if (p === "/api/ativacao" && m === "POST") return ativar(env, await corpo(pedido));
  if (p.startsWith("/api/rh/")) {
    const s = await sessao(env, pedido, "rh");
    return s ? apiRh(pedido, env, url, s) : erro("não autorizado", 401);
  }
  if (p === "/api/eu" || p === "/api/ponto") {
    const s = await sessao(env, pedido, "func");
    if (!s) return erro("Este celular não está ativado. Peça ao RH o link de ativação.", 401);
    if (p === "/api/eu" && m === "GET") return eu(env, s);
    if (p === "/api/ponto" && m === "POST") return baterPonto(env, pedido, s, (await corpo(pedido)) || {});
  }
  return erro("não encontrado", 404);
}

export default {
  async fetch(pedido, env) {
    const url = new URL(pedido.url);
    if (url.pathname.startsWith("/api/")) {
      try { return await api(pedido, env, url); }
      catch (e) { console.error(e); return erro("Erro interno. Tente de novo em instantes.", 500); }
    }
    return env.ASSETS.fetch(pedido);
  },
};

// Para scripts/convite.mjs e servir-local: o mesmo convite que /api/instalar aceita.
export const convite = (segredo, horas = 72) => assinar({ c: "ponto-instalar", id: aleatorio(9), exp: agoraS() + horas * 3600 }, segredo);
