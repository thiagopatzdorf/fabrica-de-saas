// Sessão sem banco: token assinado por HMAC-SHA256 num cookie HttpOnly, e cifra AES-GCM
// para o que precisa ficar guardado (segredo do App do GitHub, token do usuário no KV).
// Sem SESSAO_SEGREDO nada é assinado, cifrado nem aceito: falha fechada.
// Molde: apps/aspas-site/src/sessao.js (mesmo desenho, mesmos nomes).
const enc = new TextEncoder();
const dec = new TextDecoder();

export const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const deb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

const chaveHmac = (segredo) => crypto.subtle.importKey("raw", enc.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export const aleatorio = (n = 16) => b64u(crypto.getRandomValues(new Uint8Array(n)));
export const agora = () => Math.floor(Date.now() / 1000);

export async function assinar(objeto, segredo) {
  if (!segredo) throw new Error("SESSAO_SEGREDO ausente");
  const corpo = b64u(enc.encode(JSON.stringify(objeto)));
  const sig = b64u(new Uint8Array(await crypto.subtle.sign("HMAC", await chaveHmac(segredo), enc.encode(corpo))));
  return `${corpo}.${sig}`;
}

// O objeto, ou null se a assinatura não bate, se expirou ou se o token está malformado.
export async function verificar(token, segredo) {
  if (!segredo || !token || token.split(".").length !== 2) return null;
  try {
    const [corpo, sig] = token.split(".");
    if (!(await crypto.subtle.verify("HMAC", await chaveHmac(segredo), deb64u(sig), enc.encode(corpo)))) return null;
    const obj = JSON.parse(dec.decode(deb64u(corpo)));
    if (!obj || typeof obj !== "object") return null;
    if (obj.exp && obj.exp < agora()) return null;
    return obj;
  } catch {
    return null;
  }
}

// Chave de cifra derivada do segredo (SHA-256 do segredo com um rótulo): o KV guarda só
// ciphertext, então quem lê o KV sem o segredo da unit não lê o client_secret do App.
async function chaveAes(segredo, rotulo) {
  const bruto = await crypto.subtle.digest("SHA-256", enc.encode(`${rotulo}:${segredo}`));
  return crypto.subtle.importKey("raw", bruto, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function cifrar(objeto, segredo, rotulo = "kv") {
  if (!segredo) throw new Error("SESSAO_SEGREDO ausente");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dados = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await chaveAes(segredo, rotulo), enc.encode(JSON.stringify(objeto))));
  return `${b64u(iv)}.${b64u(dados)}`;
}

export async function decifrar(texto, segredo, rotulo = "kv") {
  if (!segredo || !texto || texto.split(".").length !== 2) return null;
  try {
    const [iv, dados] = texto.split(".");
    const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deb64u(iv) }, await chaveAes(segredo, rotulo), deb64u(dados));
    return JSON.parse(dec.decode(new Uint8Array(claro)));
  } catch {
    return null;
  }
}

export function lerCookie(pedido, nome) {
  for (const parte of (pedido.headers.get("cookie") || "").split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === nome) return v.join("=");
  }
  return "";
}

// SameSite=Lax (e não Strict) porque o cookie precisa acompanhar a volta do GitHub.
export const montarCookie = (nome, valor, segundos) => `${nome}=${valor}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${segundos}`;
export const apagarCookie = (nome) => `${nome}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
