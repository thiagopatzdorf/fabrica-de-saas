// Loja Mínima: vitrine, carrinho e painel do dono para uma loja pequena. Páginas são Static Assets; este Worker acorda só
// para /api. Pagamento por um serviço de links de pagamento (src/pagamento.js é a única peça que o conhece). Falha FECHADO: sem ADMIN_TOKEN
// o painel não abre, sem PAGAR_URL/PAGAR_TOKEN nenhum pedido é cobrado.
import { entrar, sair, logado, listarProdutos, gravarProduto, apagarProduto, lerConfiguracao, gravarConfiguracao, listarPedidos, mudarPedido } from "./src/admin.js";
import { catalogoParaAgente, descritor } from "./src/agente.js";
import { lerCatalogo, paraVitrine } from "./src/catalogo.js";
import { lerConfig } from "./src/config.js";
import { conferirPagamento, criarPedido, idPedido, lerPedido, resumoPublico } from "./src/pedido.js";

const CAB = { "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin", "strict-transport-security": "max-age=31536000" };
const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CAB, ...extra } });
const resp = (r) => (r.erro ? json({ erro: r.erro }, r.status) : json(r.corpo, r.status, r.cookie ? { "set-cookie": r.cookie } : {}));
const corpo = async (p) => { try { return await p.json(); } catch { return null; } };

// Escrita só por JSON do próprio site: formulário de outro domínio não envia application/json sem preflight.
function mesmaOrigem(pedido) {
  if (!(pedido.headers.get("content-type") || "").startsWith("application/json")) return false;
  const o = pedido.headers.get("origin");
  return !o || o === new URL(pedido.url).origin;
}

// Compras por IP: 20 por minuto. Cada pedido válido cria um registro e uma cobrança, então o teto protege a conta do dono.
async function dentroDoLimite(env, ip) {
  const k = `lim:${ip}:${Math.floor(Date.now() / 60000)}`;
  const n = Number((await env.ESTADO.get(k)) || 0);
  if (n >= 20) return false;
  await env.ESTADO.put(k, String(n + 1), { expirationTtl: 120 });
  return true;
}

async function api(pedido, env, url) {
  const { pathname } = url;
  const m = pedido.method;
  const ip = pedido.headers.get("cf-connecting-ip") || "local";

  if (pathname === "/api/loja" && m === "GET") {
    const c = await lerCatalogo(env);
    const cfg = await lerConfig(env);
    const produtos = Object.values(c).filter((p) => p.ativo).map(paraVitrine);
    return json({ loja: { nome: cfg.nome, whatsapp: cfg.whatsapp, frete_centavos: cfg.frete_centavos, frete_gratis_acima: cfg.frete_gratis_acima, aviso: cfg.aviso }, produtos });
  }
  if (pathname === "/api/pedido" && m === "POST") {
    if (!mesmaOrigem(pedido)) return json({ erro: "pedido recusado" }, 403);
    if (!(await dentroDoLimite(env, ip))) return json({ erro: "Muitas tentativas. Aguarde um minuto." }, 429);
    return resp(await criarPedido(env, await corpo(pedido), url.origin));
  }
  if (pathname === "/api/agente" && m === "GET") return json(descritor(url.origin, await lerConfig(env)));
  if (pathname === "/api/agente/catalogo" && m === "GET") {
    const q = url.searchParams;
    return json(catalogoParaAgente(await lerCatalogo(env), { q: q.get("q") ?? "", categoria: q.get("categoria") ?? "", limite: q.get("limite") ?? undefined, depois: q.get("depois") ?? "" }, url.origin));
  }
  if (pathname === "/api/agente/pedidos" && m === "POST") {
    if (!mesmaOrigem(pedido)) return json({ erro: "envie application/json" }, 415);
    if (!(await dentroDoLimite(env, ip))) return json({ erro: "Muitas tentativas. Aguarde um minuto." }, 429);
    // Mesma chave, mesmo pedido: agente que repete a chamada (rede caiu) não gera segunda cobrança.
    const chave = pedido.headers.get("idempotency-key");
    if (chave !== null && !/^[A-Za-z0-9_-]{1,64}$/.test(chave)) return json({ erro: "Idempotency-Key inválida (até 64: letras, números, _ e -)" }, 400);
    const idem = chave ? `idem:${ip}:${chave}` : null; // por IP: chave adivinhada por outro agente não devolve o pedido de alguém
    const guardado = idem ? await env.ESTADO.get(idem) : null;
    if (guardado) return json(JSON.parse(guardado), 200);
    const r = await criarPedido(env, await corpo(pedido), url.origin, pedido.headers.get("x-agent-name") || pedido.headers.get("user-agent") || "agente");
    if (r.erro) return resp(r);
    const saida = { pedido: r.corpo.pedido, total_centavos: r.corpo.total, moeda: "BRL", pagamento: { tipo: "link_de_pagamento", url: r.corpo.url, quem_paga: "a pessoa que o agente representa" }, acompanhar: `${url.origin}/api/pedido/${r.corpo.pedido}` };
    if (idem) await env.ESTADO.put(idem, JSON.stringify(saida), { expirationTtl: 86400 });
    return json(saida, 201);
  }
  const mp = pathname.match(/^\/api\/pedido\/([0-9a-f]{32})$/);
  if (mp && m === "GET") {
    const p = await lerPedido(env, mp[1]);
    return p ? json({ pedido: resumoPublico(await conferirPagamento(env, p)) }) : json({ erro: "não encontrado" }, 404);
  }

  if (pathname === "/api/admin/entrar" && m === "POST") {
    if (!mesmaOrigem(pedido)) return json({ erro: "pedido recusado" }, 403);
    return resp(await entrar(env, await corpo(pedido), ip));
  }
  if (!pathname.startsWith("/api/admin/")) return json({ erro: "não encontrado" }, 404);
  if (!(await logado(pedido, env))) return json({ erro: "não autorizado" }, 401);
  // Escrita do painel: o cookie é SameSite=Lax e o pedido tem de vir do próprio site (DELETE não tem corpo, então só confere a origem).
  if (m !== "GET" && !(m === "DELETE" ? !pedido.headers.get("origin") || pedido.headers.get("origin") === url.origin : mesmaOrigem(pedido))) return json({ erro: "pedido recusado" }, 403);

  if (pathname === "/api/admin/sair" && m === "POST") return resp(sair());
  if (pathname === "/api/admin/produtos" && m === "GET") return resp(await listarProdutos(env));
  const pr = pathname.match(/^\/api\/admin\/produtos\/([a-z0-9-]{1,48})$/);
  if (pr && m === "PUT") return resp(await gravarProduto(env, pr[1], await corpo(pedido)));
  if (pr && m === "DELETE") return resp(await apagarProduto(env, pr[1]));
  if (pathname === "/api/admin/config" && m === "GET") return resp(await lerConfiguracao(env));
  if (pathname === "/api/admin/config" && m === "PUT") return resp(await gravarConfiguracao(env, await corpo(pedido)));
  if (pathname === "/api/admin/pedidos" && m === "GET") return resp(await listarPedidos(env));
  const pd = pathname.match(/^\/api\/admin\/pedidos\/([0-9a-f]{32})$/);
  if (pd && m === "POST") return resp(await mudarPedido(env, pd[1], await corpo(pedido)));
  return json({ erro: "não encontrado" }, 404);
}

export default {
  async fetch(pedido, env) {
    const url = new URL(pedido.url);
    if (url.pathname.startsWith("/api/")) return api(pedido, env, url);
    return env.ASSETS.fetch(pedido);
  },
};
