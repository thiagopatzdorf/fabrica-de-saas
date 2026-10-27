// Link de pagamento = um Price + um Payment Link no Stripe do dono, e um id curto nosso
// (/p/<id>) que redireciona para ele. O link do Stripe não expira; o nosso é o que se manda.
import { stripe } from "./stripe.js";

const ALFABETO = "23456789abcdefghijkmnpqrstuvwxyz"; // sem 0, 1, l, o: ninguém confunde ao ditar
export const MINIMO = 100;        // R$ 1,00 em centavos
export const MAXIMO = 5_000_000;  // R$ 50 mil: acima disso, conversa antes
export const novoId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => ALFABETO[b % 32]).join("");
export const idValido = (s) => /^[2-9a-km-np-z]{8}$/.test(s);

export function validar(d) {
  d = d && typeof d === "object" ? d : {};
  const descricao = String(d.descricao ?? "").trim();
  if (descricao.length < 3 || descricao.length > 120) return { erro: "Descreva o que está sendo pago (3 a 120 caracteres)." };
  const recorrente = d.recorrente ?? null;
  if (![null, "month", "year"].includes(recorrente)) return { erro: "recorrente deve ser month, year ou ficar de fora." };
  const teste_dias = d.teste_dias ?? null;
  if (teste_dias != null && !recorrente) return { erro: "teste_dias só existe para assinatura (recorrente)." };
  if (teste_dias != null && !(Number.isInteger(teste_dias) && teste_dias >= 1 && teste_dias <= 90)) return { erro: "teste_dias deve ser um número inteiro de dias entre 1 e 90." };
  const livre = d.livre === true;
  if (livre && recorrente) return { erro: "Valor livre só existe para pagamento único, não para assinatura." };
  const centavos = (n, nome) => (Number.isInteger(n) && n >= MINIMO && n <= MAXIMO ? null : `${nome} deve ser um número inteiro de centavos entre ${MINIMO} e ${MAXIMO}.`);
  let valor = null, minimo = null, maximo = null;
  if (livre) {
    for (const [nome, v] of [["valor", d.valor], ["minimo", d.minimo], ["maximo", d.maximo]]) if (v != null) { const e = centavos(v, nome); if (e) return { erro: e }; }
    valor = d.valor ?? null; minimo = d.minimo ?? MINIMO; maximo = d.maximo ?? null;
    if (maximo != null && minimo > maximo) return { erro: "minimo não pode passar de maximo." };
  } else {
    const e = centavos(d.valor, "valor");
    if (e) return { erro: e };
    valor = d.valor;
  }
  const retorno = d.retorno == null ? null : String(d.retorno);
  if (retorno && (!/^https:\/\/[^\s]{3,280}$/.test(retorno))) return { erro: "retorno precisa ser um endereço https." };
  const ref = d.ref == null ? null : String(d.ref);
  if (ref && !/^[A-Za-z0-9_.:-]{1,64}$/.test(ref)) return { erro: "ref aceita letras, números e _ . : - (até 64)." };
  return { ok: { descricao, valor, livre, minimo, maximo, recorrente, teste_dias, retorno, ref } };
}

// O preço no Stripe (valor fixo, livre ou recorrente). Serve ao registro novo e ao link antigo que
// ainda não tem preço: o checkout é montado a cada abertura de /p/<id> (src/checkout.js).
export const criarPreco = (chave, v, id) => stripe(chave, "POST", "/v1/prices", {
  currency: "brl",
  product_data: { name: v.descricao },
  unit_amount: v.livre ? undefined : v.valor,
  custom_unit_amount: v.livre ? { enabled: true, minimum: v.minimo, maximum: v.maximo ?? undefined, preset: v.valor ?? undefined } : undefined,
  recurring: v.recorrente ? { interval: v.recorrente } : undefined,
}, { idem: `pagar-price-${id}` });

// Mesmo `ref` devolve o mesmo link: um pedido que tenta pagar duas vezes não gera dois links.
// Criar já cria o preço: valor ou conta que o Stripe recusa falha AQUI, para quem manda o link, e não
// na cara de quem vai pagar.
export async function criar(env, chave, v, origem) {
  if (v.ref) {
    const id = await env.ESTADO.get(`ref:${v.ref}`);
    const reg = id ? await env.ESTADO.get(`link:${id}`) : null;
    if (reg) return { link: JSON.parse(reg), repetido: true };
  }
  let id = novoId();
  while (await env.ESTADO.get(`link:${id}`)) id = novoId();
  const price = await criarPreco(chave, v, id);
  const link = { id, url: `${origem}/p/${id}`, price: price.id, descricao: v.descricao, valor: v.valor, livre: v.livre,
    minimo: v.minimo, maximo: v.maximo, recorrente: v.recorrente, teste_dias: v.teste_dias ?? null, retorno: v.retorno, ref: v.ref, modo: price.livemode ? "live" : "test", criado: new Date().toISOString() };
  await env.ESTADO.put(`link:${id}`, JSON.stringify(link));
  if (v.ref) await env.ESTADO.put(`ref:${v.ref}`, id);
  const idx = JSON.parse((await env.ESTADO.get("idx:links")) || "[]");
  await env.ESTADO.put("idx:links", JSON.stringify([id, ...idx].slice(0, 500)));
  return { link, repetido: false };
}

export async function listar(env) {
  const idx = JSON.parse((await env.ESTADO.get("idx:links")) || "[]");
  return (await Promise.all(idx.map(async (id) => JSON.parse((await env.ESTADO.get(`link:${id}`)) || "null")))).filter(Boolean);
}
