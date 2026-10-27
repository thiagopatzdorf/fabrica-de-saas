// A marca do checkout vem de arquivos do repositório (site/marca/), não do painel do Stripe:
// a conta é "standard", e o Stripe só deixa mudar a marca da própria conta pelo painel. O que a API
// aceita é a marca POR SESSÃO de Checkout (branding_settings), então o Worker sobe os PNGs ao Stripe
// uma vez (id guardado pelo sha256 do arquivo: trocou o arquivo, sobe de novo) e passa em cada sessão.
import { enviarArquivo } from "./stripe.js";

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

async function bytesDe(env, origem, caminho) {
  const r = await env.ASSETS.fetch(new Request(origem + caminho));
  if (!r.ok) throw new Error(`arquivo da marca ausente: ${caminho} (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}

async function arquivoNoStripe(env, chave, origem, caminho, purpose) {
  const bytes = await bytesDe(env, origem, caminho);
  const k = `arq:${purpose}:${hex(await crypto.subtle.digest("SHA-256", bytes))}`;
  const ja = await env.ESTADO.get(k);
  if (ja) return ja;
  const f = await enviarArquivo(chave, bytes, caminho.split("/").pop(), purpose);
  await env.ESTADO.put(k, f.id);
  return f.id;
}

// { ok: true, campos } para passar em branding_settings, ou { ok: false, erro }. Nunca lança:
// marca com problema não pode impedir ninguém de pagar.
export async function marca(env, chave, origem) {
  try {
    const r = await env.ASSETS.fetch(new Request(origem + "/marca/marca.json"));
    if (!r.ok) return { ok: false, erro: `marca.json ausente (${r.status})` };
    const c = await r.json();
    const campos = { display_name: c.nome, background_color: c.fundo, button_color: c.botao, border_style: c.bordas };
    if (c.icone) campos.icon = { type: "file", file: await arquivoNoStripe(env, chave, origem, c.icone, "business_icon") };
    if (c.logo) campos.logo = { type: "file", file: await arquivoNoStripe(env, chave, origem, c.logo, "business_logo") };
    return { ok: true, campos };
  } catch (e) {
    return { ok: false, erro: String(e?.message || e) };
  }
}
