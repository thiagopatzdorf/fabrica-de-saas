// Catálogo da loja: um JSON no KV (chave `catalogo`), validado a cada escrita. O que o navegador manda nunca vira
// registro sem passar por `validarProduto`: id vira chave, foto vira <img>, texto vira conteúdo de página.
import { centavos } from "./dinheiro.js";

export const ID_PRODUTO = /^[a-z0-9][a-z0-9-]{0,47}$/;
const texto = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, max) : "");

// Foto: endereço https, ou caminho do próprio site (ex.: /img/mochila.svg). "//host" não vale: seria outro domínio.
function urlFoto(v) {
  if (typeof v === "string" && /^\/(?!\/)[A-Za-z0-9._\/-]{1,200}$/.test(v) && !v.includes("..")) return v;
  return urlHttps(v);
}

function urlHttps(v) {
  try {
    const u = new URL(String(v));
    return u.protocol === "https:" && !u.username && !u.password && String(v).length <= 600 ? u.href : null;
  } catch { return null; }
}

// Erro em texto para quem edita, ou { ok: produto }. Estoque null = sem controle de estoque.
export function validarProduto(p) {
  if (!p || typeof p !== "object") return { erro: "Produto inválido." };
  const id = texto(p.id, 48);
  if (!ID_PRODUTO.test(id)) return { erro: "Código do produto: letras minúsculas, números e traço (até 48)." };
  const nome = texto(p.nome, 120);
  if (!nome) return { erro: "O produto precisa de um nome." };
  const preco = centavos(p.preco);
  if (preco === null || preco < 100) return { erro: "Preço inválido (mínimo R$ 1,00, em centavos)." };
  let precoAntigo = null;
  if (p.preco_antigo !== undefined && p.preco_antigo !== null) {
    precoAntigo = centavos(p.preco_antigo);
    if (precoAntigo === null || precoAntigo <= preco) return { erro: "O preço antigo precisa ser maior que o atual." };
  }
  const fotos = [];
  for (const f of Array.isArray(p.fotos) ? p.fotos.slice(0, 8) : []) {
    const u = urlFoto(f);
    if (!u) return { erro: "Foto: use um endereço https ou um caminho do site (ex.: /img/foto.svg)." };
    fotos.push(u);
  }
  let estoque = null;
  if (p.estoque !== undefined && p.estoque !== null) {
    if (!Number.isSafeInteger(p.estoque) || p.estoque < 0 || p.estoque > 100000) return { erro: "Estoque inválido." };
    estoque = p.estoque;
  }
  const variacoes = [...new Set((Array.isArray(p.variacoes) ? p.variacoes : []).map((v) => texto(v, 24)).filter(Boolean))].slice(0, 20);
  return {
    ok: {
      id, nome, categoria: texto(p.categoria, 60) || "Outros", descricao: texto(p.descricao, 2000),
      preco, preco_antigo: precoAntigo, fotos, estoque, variacoes,
      destaque: p.destaque === true, ativo: p.ativo !== false,
    },
  };
}

export async function lerCatalogo(env) {
  try { const c = JSON.parse((await env.ESTADO.get("catalogo")) || "{}"); return c && typeof c === "object" && !Array.isArray(c) ? c : {}; } catch { return {}; }
}
export const gravarCatalogo = (env, c) => env.ESTADO.put("catalogo", JSON.stringify(c));

// O que a vitrine pública vê: sem o número exato do estoque.
export function paraVitrine(p) {
  const { estoque, ...resto } = p;
  return { ...resto, disponivel: estoque === null || estoque > 0 };
}
