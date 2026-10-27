// Controles de aparência (alto contraste e texto maior), carregados sob demanda ao abrir "Mais" (ou a lateral).
// O estado em texto ("Ligado"/"Desligado") acompanha o aria-pressed: nunca só cor.
import { CHAVES, gravar, ler } from "./preferencias.mjs";

// Aparência: o <html> é quem carrega (data-gs-contraste, data-gs-texto); o tema.js aplica antes da primeira pintura.
export function aplicarAparencia(raiz = document.documentElement) {
  const c = ler(CHAVES.contraste), x = ler(CHAVES.texto);
  const alto = c === "alto" || (c == null && globalThis.matchMedia?.("(prefers-contrast: more)").matches);
  if (alto) {
    raiz.setAttribute("data-gs-contraste", "alto");
    // O tema.js já injetou a folha no carregamento; aqui cobre a escolha feita com a página aberta.
    if (typeof document !== "undefined" && !document.querySelector('link[href="/css/alto-contraste.css"]')) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/css/alto-contraste.css"; document.head.append(l); }
  } else raiz.removeAttribute("data-gs-contraste");
  if (x === "grande") raiz.setAttribute("data-gs-texto", "grande"); else raiz.removeAttribute("data-gs-texto");
}
export function alternarAparencia(nome, raiz = document.documentElement) {
  if (nome === "contraste") { const ligado = raiz.getAttribute("data-gs-contraste") === "alto"; gravar(CHAVES.contraste, ligado ? "normal" : "alto"); }
  else { const ligado = raiz.getAttribute("data-gs-texto") === "grande"; gravar(CHAVES.texto, ligado ? "normal" : "grande"); }
  aplicarAparencia(raiz);
  return nome === "contraste" ? raiz.getAttribute("data-gs-contraste") === "alto" : raiz.getAttribute("data-gs-texto") === "grande";
}

export function controlesAparencia({ h, t }) {
  const root = document.documentElement;
  const botao = (nome, chave, atributo, valor) => {
    const chip = h("span", { class: "chave" }, "");
    const pinta = (ligado) => { chip.textContent = t(ligado ? "app.ligado" : "app.desligado"); b.setAttribute("aria-pressed", String(ligado)); };
    const b = h("button", { type: "button", onclick: () => pinta(alternarAparencia(nome)) }, h("span", null, t(chave)), chip);
    pinta(root.getAttribute(atributo) === valor);
    return b;
  };
  return h("div", { class: "aparencia" }, h("h3", null, t("app.aparencia")), botao("contraste", "app.contraste", "data-gs-contraste", "alto"), botao("texto", "app.texto_maior", "data-gs-texto", "grande"));
}
