// Ciclo de vida da assinatura (qualquer link mensal): o Stripe avisa cada mudança de estado em
// customer.subscription.*. Guardamos o ÚLTIMO estado por assinatura; quem decide se a empresa tem acesso lê
// `acesso`, que só vale com teste ou pagamento em dia. past_due/unpaid/canceled/incomplete fecham.
// Evento atrasado (o Stripe não garante ordem) não pode sobrescrever um estado mais novo.
export const EVENTOS_ASSINATURA = ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"];
const COM_ACESSO = new Set(["trialing", "active"]);

export async function registrarAssinatura(env, evento) {
  if (!EVENTOS_ASSINATURA.includes(evento.type)) return { ignorado: true };
  if (await env.ESTADO.get(`evt:${evento.id}`)) return { repetido: true };
  const a = evento.data.object;
  const anterior = JSON.parse((await env.ESTADO.get(`ass:${a.id}`)) || "null");
  if (anterior && anterior.evento_em > evento.created) {
    await env.ESTADO.put(`evt:${evento.id}`, "1", { expirationTtl: 30 * 24 * 3600 });
    return { atrasado: true };
  }
  // customer.subscription.deleted chega com status "canceled"; o objeto vem completo, então o status basta.
  const status = evento.type === "customer.subscription.deleted" ? "canceled" : a.status;
  const reg = { id: a.id, cliente: a.customer ?? null, status, acesso: COM_ACESSO.has(status),
    fim_teste: a.trial_end ? new Date(a.trial_end * 1000).toISOString() : null,
    cancela_ao_fim: Boolean(a.cancel_at_period_end), link: a.metadata?.pagar_id ?? null,
    modo: evento.livemode ? "live" : "test", evento_em: evento.created, atualizado: new Date(evento.created * 1000).toISOString() };
  await env.ESTADO.put(`ass:${a.id}`, JSON.stringify(reg));
  if (!anterior) {
    const idx = JSON.parse((await env.ESTADO.get("idx:assinaturas")) || "[]");
    await env.ESTADO.put("idx:assinaturas", JSON.stringify([a.id, ...idx].slice(0, 1000)));
  }
  await env.ESTADO.put(`evt:${evento.id}`, "1", { expirationTtl: 30 * 24 * 3600 });
  return { assinatura: reg };
}

// O e-mail vem do checkout (guardado em cli:<cliente>): o evento de assinatura não traz.
export async function assinaturas(env, { email, limite = 100 } = {}) {
  const idx = JSON.parse((await env.ESTADO.get("idx:assinaturas")) || "[]").slice(0, limite);
  const regs = (await Promise.all(idx.map(async (id) => JSON.parse((await env.ESTADO.get(`ass:${id}`)) || "null")))).filter(Boolean);
  const comEmail = await Promise.all(regs.map(async (r) => ({ ...r, email: r.cliente ? (await env.ESTADO.get(`cli:${r.cliente}`)) ?? null : null })));
  return email ? comEmail.filter((r) => r.email && r.email.toLowerCase() === String(email).toLowerCase()) : comEmail;
}
