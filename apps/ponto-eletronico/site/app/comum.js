// Peças comuns das telas do app: chamada à API, escape de texto e formatação.
export const $ = (s, r = document) => r.querySelector(s);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function api(caminho, dados) {
  const op = dados === undefined ? { headers: { accept: "application/json" } }
    : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(dados) };
  let r;
  try { r = await fetch(caminho, { credentials: "same-origin", ...op }); }
  catch { return { ok: false, status: 0, erro: "Sem conexão. Confira a internet e tente de novo." }; }
  let j = {};
  try { j = await r.json(); } catch {}
  return { ok: r.ok, status: r.status, ...j, erro: j.erro || (r.ok ? null : "Algo deu errado. Tente de novo.") };
}

export const hhmm = (min) => (min == null ? "" : `${min < 0 ? "−" : ""}${Math.floor(Math.abs(min) / 60)}:${String(Math.abs(min) % 60).padStart(2, "0")}`);
export const dataBr = (iso) => iso.split("-").reverse().join("/");
export const mesAtual = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 7);
export function mesNome(mes) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}
export function somarMes(mes, n) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
export function aviso(el, texto, tipo = "erro") {
  el.textContent = texto || "";
  el.className = `aviso ${tipo}`;
  el.hidden = !texto;
}
