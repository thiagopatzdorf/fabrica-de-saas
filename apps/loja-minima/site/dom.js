// Montagem de página sem innerHTML: tudo que vem do servidor entra como texto (textContent) ou atributo validado.
export function el(tag, props = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "texto") n.textContent = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const f of filhos.flat()) if (f !== null && f !== undefined && f !== false) n.append(f.nodeType ? f : document.createTextNode(String(f)));
  return n;
}
export const reais = (c) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// "89,90" ou "89.90" -> 8990 (centavos); texto inválido -> null
export function paraCentavos(t) {
  const s = String(t ?? "").trim().replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}
export async function api(caminho, { metodo = "GET", corpo } = {}) {
  const r = await fetch(caminho, { method: metodo, headers: corpo !== undefined ? { "content-type": "application/json" } : {}, body: corpo !== undefined ? JSON.stringify(corpo) : undefined, credentials: "same-origin" });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(dados.erro || "Algo deu errado."), { status: r.status });
  return dados;
}
