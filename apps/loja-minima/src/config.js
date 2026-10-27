// Configuração da loja (KV `config`): nome, WhatsApp e frete. Edita-se no painel; nada aqui é segredo.
const texto = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, max) : "");

export const PADRAO = { nome: "Minha loja", whatsapp: "", frete_centavos: 0, frete_gratis_acima: null, aviso: "" };

export function validarConfig(c) {
  if (!c || typeof c !== "object") return { erro: "Configuração inválida." };
  const nome = texto(c.nome, 60);
  if (!nome) return { erro: "A loja precisa de um nome." };
  const whatsapp = texto(c.whatsapp, 20).replace(/\D/g, "");
  if (whatsapp && !/^\d{10,15}$/.test(whatsapp)) return { erro: "WhatsApp: só números com DDD (ex.: 5547999999999)." };
  const frete = c.frete_centavos ?? 0;
  if (!Number.isSafeInteger(frete) || frete < 0 || frete > 100_000) return { erro: "Frete inválido." };
  let gratis = null;
  if (c.frete_gratis_acima !== undefined && c.frete_gratis_acima !== null) {
    gratis = c.frete_gratis_acima;
    if (!Number.isSafeInteger(gratis) || gratis < 0 || gratis > 5_000_000) return { erro: "Valor do frete grátis inválido." };
  }
  return { ok: { nome, whatsapp, frete_centavos: frete, frete_gratis_acima: gratis, aviso: texto(c.aviso, 300) } };
}

export async function lerConfig(env) {
  try { const r = validarConfig(JSON.parse((await env.ESTADO.get("config")) || "null")); return r.ok ?? PADRAO; } catch { return PADRAO; }
}
export const gravarConfig = (env, c) => env.ESTADO.put("config", JSON.stringify(c));

export function frete(cfg, subtotal) {
  return cfg.frete_gratis_acima !== null && subtotal >= cfg.frete_gratis_acima ? 0 : cfg.frete_centavos;
}
