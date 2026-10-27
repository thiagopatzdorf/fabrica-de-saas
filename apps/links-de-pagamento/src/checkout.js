// /p/<id> abre um Checkout Session NOVO a cada clique, com a sua marca. Sessão de pagamento
// vale uma vez só e expira em 24 h, então dividir uma sessão entre duas pessoas quebraria o segundo.
// O que não pode quebrar: o pagamento. Marca recusada -> abre sem marca; sessão recusada num link
// antigo -> volta para o Payment Link que ele sempre teve.
import { criarPreco } from "./links.js";
import { marca } from "./marca.js";
import { stripe } from "./stripe.js";

// branding_settings só existe a partir desta versão da API.
export const VERSAO_MARCA = "2025-09-30.clover";
export const LIMITE_POR_MINUTO = 30;

// Cada abertura cria uma sessão na conta do dono: sem teto, um robô enche o painel dele de sessões.
export async function dentroDoLimite(env, id, agora = Date.now()) {
  const k = `rl:${id}:${Math.floor(agora / 60000)}`;
  const n = Number(await env.ESTADO.get(k)) || 0;
  if (n >= LIMITE_POR_MINUTO) return false;
  await env.ESTADO.put(k, String(n + 1), { expirationTtl: 120 });
  return true;
}

export async function abrir(env, chave, link, origem) {
  let price = link.price;
  if (!price) { // link antigo (criado como Payment Link): ganha o preço na primeira abertura
    try {
      price = (await criarPreco(chave, link, link.id)).id;
      await env.ESTADO.put(`link:${link.id}`, JSON.stringify({ ...link, price }));
    } catch (e) {
      if (link.stripe_url) return { url: link.stripe_url, marca: `sem preço, usando o link antigo: ${e.message}` };
      throw e;
    }
  }
  const m = await marca(env, chave, origem);
  const base = {
    mode: link.recorrente ? "subscription" : "payment",
    line_items: [{ price, quantity: 1 }],
    success_url: link.retorno || `${origem}/obrigado`,
    cancel_url: `${origem}/cancelado`,
    locale: "pt-BR",
    metadata: { pagar_id: link.id, ref: link.ref ?? undefined },
    subscription_data: link.recorrente ? { metadata: { pagar_id: link.id }, trial_period_days: link.teste_dias ?? undefined } : undefined,
    // Mês grátis só vale com cartão na mão: sem isto o Stripe deixa a pessoa entrar sem cartão e a cobrança do 2º mês falha.
    payment_method_collection: link.teste_dias ? "always" : undefined,
  };
  // Parcelamento no cartão (Brasil) só em pagamento único: o Stripe não parcela recorrência. Apple Pay e Google Pay não pedem
  // nada aqui: aparecem sozinhos no Checkout hospedado quando a conta os tem ligados.
  const parcelado = link.recorrente ? base : { ...base, payment_method_options: { card: { installments: { enabled: true } } } };
  // Do mais completo ao mais simples: perder a marca ou o parcelamento nunca pode custar o pagamento.
  const tentativas = [
    ...(m.ok ? [{ corpo: { ...parcelado, branding_settings: m.campos }, opcoes: { versao: VERSAO_MARCA }, rotulo: "ok" }] : []),
    ...(parcelado !== base ? [{ corpo: parcelado, opcoes: {}, rotulo: m.ok ? "sem marca" : m.erro }] : []),
    ...(m.ok && parcelado !== base ? [{ corpo: { ...base, branding_settings: m.campos }, opcoes: { versao: VERSAO_MARCA }, rotulo: "sem parcelas" }] : []),
    { corpo: base, opcoes: {}, rotulo: m.ok || parcelado !== base ? "sem marca nem parcelas" : m.erro },
  ];
  let primeiroErro;
  for (const t of tentativas) {
    try {
      const s = await stripe(chave, "POST", "/v1/checkout/sessions", t.corpo, t.opcoes);
      return { url: s.url, marca: primeiroErro ? `recusada: ${primeiroErro.message}` : t.rotulo };
    } catch (e) { primeiroErro ??= e; }
  }
  if (link.stripe_url) return { url: link.stripe_url, marca: `sessão recusada, usando o link antigo: ${primeiroErro.message}` };
  throw primeiroErro;
}

// Usada pela página de configuração: prova AGORA que a chave nova abre checkout e sobe a marca,
// em vez de o dono descobrir na cara do primeiro pagador. A sessão de teste é expirada na hora.
export async function provar(env, chave, origem) {
  const m = await marca(env, chave, origem);
  const r = { marca: m.ok ? "ok" : `falhou: ${m.erro}` };
  try {
    const s = await stripe(chave, "POST", "/v1/checkout/sessions", {
      mode: "payment", success_url: `${origem}/obrigado`, cancel_url: `${origem}/cancelado`,
      line_items: [{ quantity: 1, price_data: { currency: "brl", unit_amount: 100, product_data: { name: "Teste de configuração" } } }],
      branding_settings: m.ok ? m.campos : undefined,
    }, { versao: VERSAO_MARCA });
    r.sessoes = "ok";
    try { await stripe(chave, "POST", `/v1/checkout/sessions/${s.id}/expire`, {}); } catch { /* expira sozinha em 24 h */ }
  } catch (e) { r.sessoes = `falhou: ${e.message}`; }
  return r;
}
