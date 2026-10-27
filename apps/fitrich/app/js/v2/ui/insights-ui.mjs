// Apresentação de UM insight (frase, próximo passo, quantos registros o comprovam, botão de dispensar). Compartilhada
// entre a tela Revisão e o cartão "Para olhar hoje" da Hoje. Texto 100% por `t`; DOM só por `h`; estado nunca só por cor
// (ícone + palavra). Nada aqui calcula insight: isso é do motor.
import { parametrosDoInsight } from "../insights/apresentar.mjs";
import { icone } from "./icones.mjs";

export const totalEvidencias = (i) => Object.values(i.evidencia ?? {}).reduce((s, l) => s + (Array.isArray(l) ? l.length : 0), 0);

// `nomeCategoria(id)` e `t` são injetados: a Hoje usa o dicionário do shell para categorias e o próprio para o resto.
export function linhaDeInsight({ h, t, fmt, nomeCategoria }, i, { aoDispensar = null } = {}) {
  const p = parametrosDoInsight(i, fmt, nomeCategoria, (x) => t(`revisao.tipo.${x}`));
  const frase = t(`${i.texto}.t`, p), passo = t(`${i.texto}.p`, p), n = totalEvidencias(i);
  const atencao = i.severidade === "atencao";
  return h("li", { class: ["insight", atencao ? "insight-atencao" : "insight-info"], dataset: { chave: i.chave } },
    h("span", { class: "insight-estado" }, icone(atencao ? "atencao" : "info"), t(atencao ? "revisao.olhar.atencao" : "revisao.olhar.info")),
    h("p", { class: "insight-frase" }, frase),
    h("p", { class: "insight-passo" }, h("strong", null, `${t("revisao.olhar.proximo")}: `), passo),
    n ? h("small", { class: "insight-prova" }, t("revisao.olhar.evidencia", { n })) : null,
    aoDispensar ? h("button", { type: "button", class: "botao leve insight-dispensar", "aria-label": t("revisao.olhar.dispensarRotulo", { texto: frase }), onclick: () => aoDispensar(i) }, t("revisao.olhar.dispensar")) : null);
}
