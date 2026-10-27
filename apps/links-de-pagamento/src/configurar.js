// Entrega da chave do Stripe sem terminal e sem colar no chat: um link de uso único (72 h)
// abre /configurar, a pessoa cola a chave, o Worker valida no Stripe, guarda CIFRADA no KV e
// cria o webhook sozinho. Nenhum valor volta para a tela.
import { aleatorio, cifrar, decifrar, verificar } from "./sessao.js";
import { provar } from "./checkout.js";
import { EVENTOS_ASSINATURA } from "./assinaturas.js";
import { chaveValida, modoDaChave, stripe } from "./stripe.js";

const EVENTOS = ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", ...EVENTOS_ASSINATURA];

export async function lerConfig(env) {
  const bruto = await env.ESTADO.get("cfg:stripe");
  return bruto && env.SESSAO_SEGREDO ? decifrar(bruto, env.SESSAO_SEGREDO, "stripe") : null;
}

export async function conviteValido(env, token) {
  const c = await verificar(String(token || ""), env.SESSAO_SEGREDO);
  if (!c || c.c !== "instalar" || !c.id) return null;
  return (await env.ESTADO.get(`convite:${c.id}`)) ? null : c; // uso único
}

export async function configurar(env, origem, { convite, chave, whsec }) {
  const c = await conviteValido(env, convite);
  if (!c) return { erro: "Esse link não vale mais (usado ou vencido). Peça um novo.", status: 403 };
  chave = String(chave || "").trim();
  if (!chaveValida(chave)) return { erro: "Isso não parece uma chave secreta do Stripe (começa com sk_ ou rk_).", status: 400 };
  // Ler preços valida a chave e já cobre parte da permissão de que precisamos (Prices).
  try { await stripe(chave, "GET", "/v1/prices", { limit: 1 }); }
  catch (e) { return { erro: `O Stripe recusou a chave: ${e.message}. Ela precisa poder escrever Prices, Products, Checkout Sessions, Files e Webhook Endpoints.`, status: 400 }; }
  const antiga = await lerConfig(env);
  let webhook = "mantido", segredo = String(whsec || "").trim() || (antiga?.whsec ?? null);
  if (whsec) webhook = "informado";
  else if (!antiga?.whsec || antiga.modo !== modoDaChave(chave)) {
    try {
      const ep = await stripe(chave, "POST", "/v1/webhook_endpoints", { url: `${origem}/webhook/stripe`, enabled_events: EVENTOS, description: "Links de Pagamento" });
      segredo = ep.secret; webhook = "criado";
    } catch (e) { webhook = `falhou: ${e.message}`; segredo = null; }
  }
  await env.ESTADO.put("cfg:stripe", await cifrar({ chave, whsec: segredo, modo: modoDaChave(chave), em: new Date().toISOString() }, env.SESSAO_SEGREDO, "stripe"));
  await env.ESTADO.put(`convite:${c.id}`, "usado", { expirationTtl: 7 * 24 * 3600 });
  // A chave já está guardada; agora prova o que ela consegue de fato (sessão de checkout e marca).
  return { ok: true, modo: modoDaChave(chave), webhook, ...(await provar(env, chave, origem)) };
}

export { aleatorio };

// Webhook criado antes de existir o ciclo da assinatura escuta só checkout.*: sem isto, cancelamento e cartão
// recusado nunca chegariam. Acha o endpoint pela URL e troca a lista de eventos (idempotente).
export async function sincronizarWebhook(chave, origem) {
  const url = `${origem}/webhook/stripe`;
  const lista = await stripe(chave, "GET", "/v1/webhook_endpoints", { limit: 100 });
  const ep = (lista.data ?? []).find((e) => e.url === url);
  if (!ep) return { erro: "Nenhum webhook do Stripe aponta para este Worker. Refaça a configuração." , status: 409 };
  const falta = EVENTOS.filter((e) => !ep.enabled_events.includes(e) && !ep.enabled_events.includes("*"));
  if (!falta.length) return { ok: true, alterado: false, eventos: ep.enabled_events };
  const novo = await stripe(chave, "POST", `/v1/webhook_endpoints/${ep.id}`, { enabled_events: [...new Set([...ep.enabled_events, ...EVENTOS])] });
  return { ok: true, alterado: true, adicionados: falta, eventos: novo.enabled_events };
}
