// Construtor de DOM SEGURO: texto vira nó de texto (nunca HTML), `style` como atributo é recusado
// (a CSP do site não tem 'unsafe-inline'; use classe, data-* ou `vars` que vira CSSOM setProperty).
// Toda tela monta o DOM por aqui: descrição de extrato e nome de categoria são texto hostil.
const SVG = "http://www.w3.org/2000/svg";

function aplicar(el, attrs) {
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === "style") throw new Error("h(): atributo style é proibido (CSP); use class, dataset ou vars");
    if (k === "class") el.setAttribute("class", Array.isArray(v) ? v.filter(Boolean).join(" ") : v);
    else if (k === "dataset") for (const [n, val] of Object.entries(v)) el.dataset[n] = String(val);
    else if (k === "vars") for (const [n, val] of Object.entries(v)) el.style.setProperty(n, String(val)); // CSSOM: permitido pela CSP
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "texto") el.textContent = String(v);
    else if (k === "value" || k === "checked" || k === "selected" || k === "disabled") el[k] = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
}
function anexar(el, filhos) {
  for (const f of filhos.flat(Infinity)) {
    if (f == null || f === false) continue;
    el.append(typeof f === "object" && "nodeType" in f ? f : document.createTextNode(String(f)));
  }
}
export function h(tag, attrs, ...filhos) { const el = document.createElement(tag); aplicar(el, attrs); anexar(el, filhos); return el; }
export function hs(tag, attrs, ...filhos) { const el = document.createElementNS(SVG, tag); aplicar(el, attrs); anexar(el, filhos); return el; }
export function limpar(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
