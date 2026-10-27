// Webhook do Stripe: registra quem pagou. Idempotente pelo `evt_` (o Stripe reenvia o mesmo id),
// mesma regra da loja.
// Pix não é instantâneo: o Checkout termina com payment_status "unpaid" e o dinheiro chega depois,
// em checkout.session.async_payment_succeeded. Por isso "pago" só vale com payment_status "paid"
// (ou o evento assíncrono de sucesso); "unpaid" fica "aguardando".
import { idValido } from "./links.js";
import { registrarAssinatura } from "./assinaturas.js";
const TIPOS = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed"]);

export function statusDe(evento) {
  const s = evento.data.object;
  if (evento.type === "checkout.session.async_payment_failed") return "falhou";
  if (evento.type === "checkout.session.async_payment_succeeded") return "pago";
  // Assinatura com mês grátis termina em "no_payment_required": o cartão está salvo, mas nada foi cobrado ainda.
  if (s.mode === "subscription" && s.payment_status === "no_payment_required") return "em_teste";
  return s.payment_status === "paid" || s.payment_status === "no_payment_required" ? "pago" : "aguardando";
}

export async function registrar(env, evento) {
  if (evento.type.startsWith("customer.subscription.")) return registrarAssinatura(env, evento);
  if (!TIPOS.has(evento.type)) return { ignorado: true };
  if (await env.ESTADO.get(`evt:${evento.id}`)) return { repetido: true };
  const s = evento.data.object;
  // Link novo: o id nosso vai na metadata da sessão. Link antigo (Payment Link): vem pelo id do Stripe.
  const doMeta = idValido(s.metadata?.pagar_id || "") ? s.metadata.pagar_id : null;
  const linkId = doMeta ?? (s.payment_link ? await env.ESTADO.get(`plink:${s.payment_link}`) : null);
  const anterior = JSON.parse((await env.ESTADO.get(`pag:${s.id}`)) || "null");
  const status = statusDe(evento);
  // Um evento atrasado de "aguardando" não pode rebaixar um pagamento que já está pago.
  const final = anterior?.status === "pago" && status === "aguardando" ? "pago" : status;
  const reg = { sessao: s.id, link: linkId, valor: s.amount_total ?? null, moeda: s.currency ?? "brl", status: final,
    email: s.customer_details?.email ?? null, nome: s.customer_details?.name ?? null, modo: evento.livemode ? "live" : "test",
    assinatura: s.mode === "subscription", cliente: s.customer ?? null, assinatura_id: s.subscription ?? null, em: anterior?.em ?? new Date(evento.created * 1000).toISOString(), atualizado: new Date(evento.created * 1000).toISOString() };
  await env.ESTADO.put(`pag:${s.id}`, JSON.stringify(reg));
  // O evento de assinatura não traz e-mail: quem consulta o estado de uma empresa pelo e-mail usa este elo.
  if (s.customer && reg.email) await env.ESTADO.put(`cli:${s.customer}`, reg.email);
  // Índice "este link já foi pago" para quem cobra por pedido (sistemas externos consultam por ref).
  if (linkId && final === "pago") await env.ESTADO.put(`pago:${linkId}`, JSON.stringify({ sessao: s.id, modo: reg.modo, valor: reg.valor, em: reg.atualizado }));
  if (!anterior) {
    const idx = JSON.parse((await env.ESTADO.get("idx:pagamentos")) || "[]");
    await env.ESTADO.put("idx:pagamentos", JSON.stringify([s.id, ...idx].slice(0, 1000)));
  }
  await env.ESTADO.put(`evt:${evento.id}`, "1", { expirationTtl: 30 * 24 * 3600 });
  return { registrado: reg };
}

export async function pagamentos(env, limite = 50) {
  const idx = JSON.parse((await env.ESTADO.get("idx:pagamentos")) || "[]").slice(0, limite);
  return (await Promise.all(idx.map(async (id) => JSON.parse((await env.ESTADO.get(`pag:${id}`)) || "null")))).filter(Boolean);
}
