// Cripto do Ponto Eletrônico, só WebCrypto (roda igual no Worker e no Node dos testes).
// Sem SEGREDO nada é assinado nem cifrado: falha fechada.
const enc = new TextEncoder();
const dec = new TextDecoder();

export const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const deb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
export const aleatorio = (n = 24) => b64u(crypto.getRandomValues(new Uint8Array(n)));
export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const sha256 = async (texto) => hex(await crypto.subtle.digest("SHA-256", enc.encode(texto)));

const chaveHmac = (segredo) => crypto.subtle.importKey("raw", enc.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
export async function hmac(texto, segredo) {
  if (!segredo) throw new Error("SEGREDO ausente");
  return hex(await crypto.subtle.sign("HMAC", await chaveHmac(segredo), enc.encode(texto)));
}

// Token assinado (convite de instalação): corpo.b64u + hmac.b64u.
export async function assinar(objeto, segredo) {
  if (!segredo) throw new Error("SEGREDO ausente");
  const corpo = b64u(enc.encode(JSON.stringify(objeto)));
  const sig = b64u(new Uint8Array(await crypto.subtle.sign("HMAC", await chaveHmac(segredo), enc.encode(corpo))));
  return `${corpo}.${sig}`;
}
export async function verificar(token, segredo) {
  if (!segredo || typeof token !== "string" || token.split(".").length !== 2) return null;
  try {
    const [corpo, sig] = token.split(".");
    if (!(await crypto.subtle.verify("HMAC", await chaveHmac(segredo), deb64u(sig), enc.encode(corpo)))) return null;
    const obj = JSON.parse(dec.decode(deb64u(corpo)));
    if (!obj || typeof obj !== "object" || (obj.exp && obj.exp < Date.now() / 1000)) return null;
    return obj;
  } catch { return null; }
}

// AES-GCM com chave derivada do segredo e de um rótulo: CPF e rosto ficam cifrados no banco,
// então quem lê o D1 sem o segredo do Worker não lê nenhum dos dois (LGPD: dado sensível).
async function chaveAes(segredo, rotulo) {
  const bruto = await crypto.subtle.digest("SHA-256", enc.encode(`${rotulo}:${segredo}`));
  return crypto.subtle.importKey("raw", bruto, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
export async function cifrar(objeto, segredo, rotulo) {
  if (!segredo) throw new Error("SEGREDO ausente");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dados = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await chaveAes(segredo, rotulo), enc.encode(JSON.stringify(objeto))));
  return `${b64u(iv)}.${b64u(dados)}`;
}
export async function decifrar(texto, segredo, rotulo) {
  if (!segredo || !texto || texto.split(".").length !== 2) return null;
  try {
    const [iv, dados] = texto.split(".");
    const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deb64u(iv) }, await chaveAes(segredo, rotulo), deb64u(dados));
    return JSON.parse(dec.decode(new Uint8Array(claro)));
  } catch { return null; }
}

// Senha do RH: PBKDF2-SHA256 com 100 mil voltas (o teto que o Worker aceita) e sal próprio.
const VOLTAS = 100000;
export async function hashSenha(senha, sal = aleatorio(16)) {
  const k = await crypto.subtle.importKey("raw", enc.encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(sal), iterations: VOLTAS }, k, 256);
  return `pbkdf2$${VOLTAS}$${sal}$${hex(bits)}`;
}
export async function conferirSenha(senha, guardado) {
  const [, , sal, esperado] = String(guardado || "").split("$");
  if (!sal || !esperado) return false;
  const obtido = (await hashSenha(senha, sal)).split("$")[3];
  let d = obtido.length ^ esperado.length;
  for (let i = 0; i < Math.min(obtido.length, esperado.length); i++) d |= obtido.charCodeAt(i) ^ esperado.charCodeAt(i);
  return d === 0;
}
