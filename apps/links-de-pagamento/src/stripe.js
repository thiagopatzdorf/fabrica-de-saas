// Cliente mínimo do Stripe por REST (sem SDK: o Worker não precisa de dependência).
// O Stripe recebe formulário (application/x-www-form-urlencoded) com colchetes aninhados.
const API = "https://api.stripe.com";

export function formEncode(obj, prefixo = "", saida = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const chave = prefixo ? `${prefixo}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => (x !== null && typeof x === "object" ? formEncode(x, `${chave}[${i}]`, saida) : saida.push([`${chave}[${i}]`, String(x)])));
    else if (typeof v === "object") formEncode(v, chave, saida);
    else saida.push([chave, String(v)]);
  }
  return saida;
}

// `idem` vira Idempotency-Key: repetir o mesmo pedido (rede que caiu) não cria um segundo preço/link.
// `versao` fixa a versão da API só nas chamadas que precisam dela (branding_settings do Checkout exige
// 2025-09-30.clover ou mais nova); sem ela vale a versão padrão da conta.
export async function stripe(chave, metodo, caminho, dados, { idem, versao } = {}) {
  const cab = { authorization: `Bearer ${chave}` };
  if (versao) cab["stripe-version"] = versao;
  let url = API + caminho, corpo;
  if (dados && metodo === "GET") url += "?" + new URLSearchParams(formEncode(dados));
  else if (dados) { corpo = new URLSearchParams(formEncode(dados)).toString(); cab["content-type"] = "application/x-www-form-urlencoded"; }
  if (idem) cab["idempotency-key"] = idem;
  const r = await fetch(url, { method: metodo, headers: cab, body: corpo });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error?.message || `Stripe respondeu ${r.status}`), { status: r.status, codigo: j?.error?.code });
  return j;
}

// Arquivo (ícone ou logo da marca) pela API de arquivos do Stripe, que fica em outro host.
export async function enviarArquivo(chave, bytes, nome, purpose) {
  const f = new FormData();
  f.append("purpose", purpose);
  f.append("file", new Blob([bytes], { type: "image/png" }), nome);
  const r = await fetch("https://files.stripe.com/v1/files", { method: "POST", headers: { authorization: `Bearer ${chave}` }, body: f });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error?.message || `Stripe (arquivos) respondeu ${r.status}`), { status: r.status });
  return j;
}

export const modoDaChave = (c) => (/^(sk|rk)_live_/.test(c) ? "live" : /^(sk|rk)_test_/.test(c) ? "test" : null);
export const chaveValida = (c) => /^(sk|rk)_(live|test)_[A-Za-z0-9]{20,}$/.test(c);

// Stripe-Signature: t=<epoch>,v1=<hmac hex>[,v1=...]; assinado sobre "<t>.<corpo cru>" com o whsec_.
// Recusa evento com mais de 5 minutos (replay).
export async function verificarAssinatura(corpoCru, cabecalho, whsec, { agora = Math.floor(Date.now() / 1000), tolerancia = 300 } = {}) {
  if (!whsec || !cabecalho) return false;
  const partes = Object.fromEntries(cabecalho.split(",").map((p) => p.trim().split("=", 2)).filter((p) => p.length === 2).map(([k, v]) => [k, v]));
  const t = Number(partes.t);
  const sigs = cabecalho.split(",").map((p) => p.trim()).filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !sigs.length || Math.abs(agora - t) > tolerancia) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(whsec), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const esperado = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${t}.${corpoCru}`))), (b) => b.toString(16).padStart(2, "0")).join("");
  let ok = false;
  for (const s of sigs) { // sem parar no primeiro igual: tempo não depende de onde bate
    let d = s.length ^ esperado.length;
    for (let i = 0; i < Math.min(s.length, esperado.length); i++) d |= s.charCodeAt(i) ^ esperado.charCodeAt(i);
    if (d === 0) ok = true;
  }
  return ok;
}
