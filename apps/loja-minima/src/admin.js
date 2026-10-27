// Painel do dono: entra com a chave de admin (ADMIN_TOKEN, 20+ caracteres, guardada como segredo do Worker) e recebe um cookie
// assinado de 12 h. Falha FECHADO: sem ADMIN_TOKEN ou sem SESSAO_SEGREDO ninguém entra.
import { ID_PRODUTO, gravarCatalogo, lerCatalogo, validarProduto } from "./catalogo.js";
import { gravarConfig, lerConfig, validarConfig } from "./config.js";
import { ESTADOS, conferirPagamento, idPedido, lerPedido } from "./pedido.js";
import { agora, apagarCookie, assinar, lerCookie, montarCookie, verificar } from "./sessao.js";

const COOKIE = "loja_adm";
const DURACAO = 12 * 3600;

function igual(a, b) {
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function logado(pedido, env) {
  const s = await verificar(lerCookie(pedido, COOKIE), env.SESSAO_SEGREDO);
  return s?.c === "admin";
}

// Tentativas por IP: 10 a cada 10 minutos. A chave é longa e aleatória, o limite só segura quem tenta adivinhar.
async function dentroDoLimite(env, ip) {
  const k = `tent:${ip}:${Math.floor(agora() / 600)}`;
  const n = Number((await env.ESTADO.get(k)) || 0);
  if (n >= 10) return false;
  await env.ESTADO.put(k, String(n + 1), { expirationTtl: 700 });
  return true;
}

export async function entrar(env, corpo, ip) {
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 20 || !env.SESSAO_SEGREDO) return { status: 503, erro: "O painel ainda não foi ligado." };
  if (!(await dentroDoLimite(env, ip))) return { status: 429, erro: "Muitas tentativas. Aguarde alguns minutos." };
  if (typeof corpo?.chave !== "string" || !igual(corpo.chave, env.ADMIN_TOKEN)) return { status: 401, erro: "Chave incorreta." };
  return abrirSessao(env);
}
async function abrirSessao(env) {
  const sessao = await assinar({ c: "admin", exp: agora() + DURACAO }, env.SESSAO_SEGREDO);
  return { status: 200, corpo: { ok: true }, cookie: montarCookie(COOKIE, sessao, DURACAO) };
}
export const sair = () => ({ status: 200, corpo: { ok: true }, cookie: apagarCookie(COOKIE) });

export async function listarProdutos(env) {
  return { status: 200, corpo: { produtos: Object.values(await lerCatalogo(env)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) } };
}

export async function gravarProduto(env, id, corpo) {
  if (!ID_PRODUTO.test(id)) return { status: 400, erro: "Código de produto inválido." };
  const v = validarProduto({ ...corpo, id });
  if (v.erro) return { status: 400, erro: v.erro };
  const c = await lerCatalogo(env);
  if (!c[id] && Object.keys(c).length >= 2000) return { status: 400, erro: "Limite de produtos atingido." };
  c[id] = v.ok;
  await gravarCatalogo(env, c);
  return { status: 200, corpo: { produto: v.ok } };
}

// Apagar tira da loja de vez; pedidos antigos guardam nome e preço como estavam (a linha do pedido é uma cópia).
export async function apagarProduto(env, id) {
  const c = await lerCatalogo(env);
  if (!c[id]) return { status: 404, erro: "Produto não encontrado." };
  delete c[id];
  await gravarCatalogo(env, c);
  return { status: 200, corpo: { ok: true } };
}

export async function lerConfiguracao(env) { return { status: 200, corpo: { config: await lerConfig(env) } }; }
export async function gravarConfiguracao(env, corpo) {
  const v = validarConfig(corpo);
  if (v.erro) return { status: 400, erro: v.erro };
  await gravarConfig(env, v.ok);
  return { status: 200, corpo: { config: v.ok } };
}

export async function listarPedidos(env) {
  const out = [];
  let cursor;
  do {
    const r = await env.ESTADO.list({ prefix: "pedido:", cursor });
    for (const k of r.keys) { const p = await lerPedido(env, k.name.slice(7)); if (p) out.push(await conferirPagamento(env, p)); }
    cursor = r.list_complete ? undefined : r.cursor;
  } while (cursor && out.length < 500);
  // Quem nunca chegou a pagar (cobrança que falhou) não é pedido: fica fora da lista do dono.
  return { status: 200, corpo: { pedidos: out.filter((p) => !(p.estado === "cancelado" && p.motivo)).sort((a, b) => b.criado.localeCompare(a.criado)) } };
}

// Dono: marcar enviado (com rastreio) ou cancelar. Pagar não se marca à mão: só o pagamento confirma.
export async function mudarPedido(env, id, corpo) {
  if (!idPedido(id)) return { status: 400, erro: "Pedido inválido." };
  const p = await lerPedido(env, id);
  if (!p) return { status: 404, erro: "Pedido não encontrado." };
  const estado = corpo?.estado;
  if (!ESTADOS.includes(estado) || estado === "pago" || estado === "aguardando_pagamento") return { status: 400, erro: "Estado inválido (use enviado ou cancelado)." };
  if (estado === "enviado" && p.estado !== "pago") return { status: 409, erro: "Só dá para enviar um pedido pago." };
  if (p.estado === "enviado" || p.estado === "cancelado") return { status: 409, erro: "Este pedido já foi encerrado." };
  const rastreio = typeof corpo.rastreio === "string" ? corpo.rastreio.replace(/[^\w .-]/g, "").slice(0, 40) : "";
  const novo = { ...p, estado, rastreio: estado === "enviado" ? rastreio : "" };
  await env.ESTADO.put(`pedido:${id}`, JSON.stringify(novo));
  return { status: 200, corpo: { pedido: novo } };
}
