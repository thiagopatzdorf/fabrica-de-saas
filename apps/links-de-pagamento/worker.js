// Links de Pagamento: links de pagamento no Stripe do dono, com link curto (/p/<id>), registro de quem pagou (webhook) e uma API para sites e agentes.
// As páginas são Static Assets; este Worker acorda só para o que não é arquivo.
// Falha FECHADO: sem SESSAO_SEGREDO não há convite nem configuração; sem PAGAR_TOKEN a API não abre;
// sem a chave do Stripe configurada nenhum link é criado e o webhook recusa tudo.
import { configurar, lerConfig, sincronizarWebhook } from "./src/configurar.js";
import { assinaturas } from "./src/assinaturas.js";
import { abrir, dentroDoLimite } from "./src/checkout.js";
import { criar, idValido, listar, validar } from "./src/links.js";
import { pagamentos, registrar } from "./src/webhook.js";
import { verificarAssinatura } from "./src/stripe.js";

const CAB = { "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin", "strict-transport-security": "max-age=31536000" };
const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CAB, ...extra } });

// Token da API (sites do servidor e agentes), comparado sem parar no primeiro byte diferente.
function autorizado(pedido, env) {
  const t = env.PAGAR_TOKEN;
  const dado = (pedido.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!t || t.length < 20) return false;
  let d = t.length ^ dado.length;
  for (let i = 0; i < Math.min(t.length, dado.length); i++) d |= t.charCodeAt(i) ^ dado.charCodeAt(i);
  return d === 0;
}

// Escrita só por JSON do próprio site (formulário de outro domínio não envia application/json sem preflight).
function mesmaOrigem(pedido) {
  if (!(pedido.headers.get("content-type") || "").startsWith("application/json")) return false;
  const o = pedido.headers.get("origin");
  return !o || o === new URL(pedido.url).origin;
}
const corpo = async (p) => { try { return await p.json(); } catch { return null; } };

async function api(pedido, env, url) {
  const { pathname } = url;
  const m = pedido.method;
  if (pathname === "/api/status" && m === "GET") {
    const cfg = await lerConfig(env);
    return json({ stripe: Boolean(cfg?.chave), modo: cfg?.modo ?? null, webhook: Boolean(cfg?.whsec) });
  }
  if (pathname === "/api/configurar" && m === "POST") {
    if (!env.SESSAO_SEGREDO) return json({ erro: "Links de Pagamento ainda não foi ligado." }, 503);
    if (!mesmaOrigem(pedido)) return json({ erro: "pedido recusado" }, 403);
    const r = await configurar(env, url.origin, (await corpo(pedido)) || {});
    return r.erro ? json({ erro: r.erro }, r.status) : json(r);
  }
  // Tudo abaixo exige o token.
  if (!autorizado(pedido, env)) return json({ erro: "não autorizado" }, 401);
  if (pathname === "/api/links" && m === "GET") return json({ links: await listar(env) });
  if (pathname === "/api/pagamentos" && m === "GET") return json({ pagamentos: await pagamentos(env) });
  if (pathname === "/api/assinaturas" && m === "GET") return json({ assinaturas: await assinaturas(env, { email: url.searchParams.get("email") || undefined }) });
  if (pathname === "/api/webhook/sincronizar" && m === "POST") {
    const cfg = await lerConfig(env);
    if (!cfg?.chave) return json({ erro: "O Stripe ainda não foi ligado." }, 409);
    try {
      const r = await sincronizarWebhook(cfg.chave, url.origin);
      return r.erro ? json({ erro: r.erro }, r.status) : json(r);
    } catch (e) { return json({ erro: `O Stripe recusou: ${e.message}` }, 502); }
  }
  const mr = pathname.match(/^\/api\/links\/ref\/([A-Za-z0-9_.:-]{1,64})$/);
  if (mr && m === "GET") {
    const id = await env.ESTADO.get(`ref:${mr[1]}`);
    const reg = id ? await env.ESTADO.get(`link:${id}`) : null;
    if (!reg) return json({ erro: "não encontrado" }, 404);
    const pago = JSON.parse((await env.ESTADO.get(`pago:${id}`)) || "null");
    return json({ link: JSON.parse(reg), pago: Boolean(pago), pagamento: pago });
  }
  if (pathname === "/api/links" && m === "POST") {
    if (!(pedido.headers.get("content-type") || "").startsWith("application/json")) return json({ erro: "envie application/json" }, 415);
    const cfg = await lerConfig(env);
    if (!cfg?.chave) return json({ erro: "O Stripe ainda não foi ligado. Abra o link de configuração." }, 409);
    const v = validar(await corpo(pedido));
    if (v.erro) return json({ erro: v.erro }, 400);
    try {
      const { link, repetido } = await criar(env, cfg.chave, v.ok, url.origin);
      return json({ ...link, repetido }, repetido ? 200 : 201);
    } catch (e) {
      return json({ erro: `O Stripe recusou: ${e.message}` }, 502);
    }
  }
  return json({ erro: "não encontrado" }, 404);
}

async function webhook(pedido, env) {
  if (pedido.method !== "POST") return json({ erro: "método não permitido" }, 405);
  const cfg = await lerConfig(env);
  const cru = await pedido.text();
  if (!(await verificarAssinatura(cru, pedido.headers.get("stripe-signature"), cfg?.whsec))) return json({ erro: "assinatura inválida" }, 400);
  let evento;
  try { evento = JSON.parse(cru); } catch { return json({ erro: "corpo inválido" }, 400); }
  return json({ recebido: true, ...(await registrar(env, evento)) });
}

const pagina = (texto, status) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Links de Pagamento</title><p style="font:18px/1.5 system-ui;max-width:32rem;margin:15vh auto;padding:0 20px">${texto}</p>`,
  { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'", ...CAB } });

async function abrirLink(env, id, origem) {
  const reg = idValido(id) ? await env.ESTADO.get(`link:${id}`) : null;
  if (!reg) return pagina("Link de pagamento não encontrado.", 404);
  const cfg = await lerConfig(env);
  if (!cfg?.chave) return pagina("Este link de pagamento ainda não está ativo. Tente de novo em instantes.", 503);
  if (!(await dentroDoLimite(env, id))) return pagina("Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo.", 429);
  try {
    const { url } = await abrir(env, cfg.chave, JSON.parse(reg), origem);
    return new Response(null, { status: 303, headers: { location: url, "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex" } });
  } catch {
    return pagina("Não foi possível abrir o pagamento agora. Tente de novo em instantes.", 502);
  }
}

export default {
  async fetch(pedido, env) {
    const url = new URL(pedido.url);
    if (url.pathname.startsWith("/api/")) return api(pedido, env, url);
    if (url.pathname === "/webhook/stripe") return webhook(pedido, env);
    const m = url.pathname.match(/^\/p\/([^/]+)$/);
    if (m) return abrirLink(env, m[1], url.origin);
    // Link por ref, só para pedidos de sistemas externos (ref "pg-<128 bits em hex>", impossível de adivinhar):
    // a página do pedido aponta o botão para cá sem precisar guardar o id do link.
    const r = url.pathname.match(/^\/r\/(pg-[0-9a-f]{32})$/);
    if (r) { const id = await env.ESTADO.get(`ref:${r[1]}`); return id ? abrirLink(env, id, url.origin) : pagina("Pagamento ainda sendo preparado. Volte em um minuto.", 404); }
    return env.ASSETS.fetch(pedido);
  },
};
