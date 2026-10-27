// Peças da tela Treino compartilhadas pelas abas. Nenhum texto de interface literal: tudo chega por `t()`.
import { nomeDe } from "../../../treino/catalogo.mjs";
import { numeroDeTexto } from "../_comum.mjs";

// Número no idioma da pessoa: 62.5 → "62,5" (pt-BR) ou "62.5" (en). Inteiro não ganha casa decimal.
export const numTexto = (v, idioma) => (v == null || Number.isNaN(v) ? "" : String(Math.round(v * 100) / 100).replace(".", idioma === "en" ? "." : ","));

// Nome do exercício no idioma da tela.
export const nomeEx = (ctx, ex) => (ex ? nomeDe(ex, ctx.idioma()) : "?");

// Campo numérico com − e + (alvo ≥ 44 px, uma mão só). `valor` inicial em número; devolve { elemento, ler(), definir(v) }.
export function passo(ctx, { rotulo, valor, passo: p = 1, min = 0, max = 999, decimal = false, classe = null, aoMudar = null }) {
  const { h, t, idioma } = ctx;
  const input = h("input", { type: "text", inputmode: decimal ? "decimal" : "numeric", autocomplete: "off", value: numTexto(valor, idioma()), "aria-label": rotulo, class: "passo-input" });
  const ler = () => { const n = numeroDeTexto(input.value); return n == null ? null : n; };
  const mover = (delta) => { const atual = ler() ?? valor ?? 0, n = Math.min(max, Math.max(min, Math.round((atual + delta) * 100) / 100)); input.value = numTexto(n, idioma()); aoMudar?.(n); };
  const rot = h("span", { class: "passo-rot", "aria-hidden": "true" }, rotulo);
  const el = h("div", { class: ["passo", classe] }, rot,
    h("div", { class: "passo-caixa" },
      h("button", { type: "button", class: "passo-btn", "aria-label": t("treino.menos", { campo: rotulo }), onclick: () => mover(-p) }, "−"),
      input,
      h("button", { type: "button", class: "passo-btn", "aria-label": t("treino.mais", { campo: rotulo }), onclick: () => mover(p) }, "+")));
  return { elemento: el, input, ler, definir: (v) => { input.value = numTexto(v, idioma()); } };
}

// Chips de uma lista fechada de valores (RIR, grupo...): botões com aria-pressed, um selecionado por vez.
export function escolha(ctx, { rotulo, opcoes, valor, aoEscolher, classe = null }) {
  const { h } = ctx;
  let atual = valor;
  const botoes = opcoes.map((o) => h("button", { type: "button", class: "chip", "aria-pressed": String(o.valor === atual), onclick: () => { atual = atual === o.valor && o.alternavel ? null : o.valor; botoes.forEach((b, i) => b.setAttribute("aria-pressed", String(opcoes[i].valor === atual))); aoEscolher?.(atual); } }, o.texto));
  const el = h("div", { class: ["escolha", classe], role: "group", "aria-label": rotulo }, h("span", { class: "passo-rot" }, rotulo), h("div", { class: "chips" }, botoes));
  return { elemento: el, ler: () => atual };
}

export const mmssTexto = (seg) => { const s = Math.max(0, Math.round(seg)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
