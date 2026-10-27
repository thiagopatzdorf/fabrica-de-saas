// Cartão "Para olhar hoje" da tela Hoje: até 3 insights do motor, sem o que a pessoa dispensou. Único ponto de extensão
// da Hoje para os insights. Carregado SOB DEMANDA pela Hoje (import dinâmico): o motor e os textos não entram no
// carregamento inicial. Usa o próprio dicionário (independente do que o shell já carregou) e o `t` do shell só para
// o nome das categorias.
import { definir } from "../esquema.mjs";
import { criarI18n } from "./i18n.mjs";
import { linhaDeInsight } from "./insights-ui.mjs";

export async function cartaoParaOlhar(ctx) {
  const [{ paraOlhar, dispensar, dispensadosDe }, { default: dicionario }] = await Promise.all([import("../insights/motor.mjs"), import("./telas/revisao.i18n.mjs")]);
  const { h, fmt } = ctx;
  const i18n = criarI18n({ idioma: ctx.idioma(), dicionarios: [dicionario] }), t = i18n.t;
  const d = ctx.estado();
  const { itens } = paraOlhar(d, ctx.hoje());
  const nomeCategoria = (id) => { const c = d.categorias.find((x) => x.id === id); return c && c.id.startsWith("cat-") ? ctx.t(`cat.${c.id}`) : c?.nome ?? ctx.t("cat.sem-categoria"); };
  const aoDispensar = (i) => ctx.mudar((x) => definir(x, "perfil", { insightsDispensados: dispensar(dispensadosDe(x), i.chave) }, { agora: ctx.agora }));
  return h("section", { class: "cartao olhar-hoje", "aria-labelledby": "olhar-h" },
    h("h2", { id: "olhar-h" }, t("revisao.olhar.titulo")),
    itens.length ? h("ul", { class: "insights" }, itens.map((i) => linhaDeInsight({ h, t, fmt, nomeCategoria }, i, { aoDispensar }))) : h("p", { class: "nota" }, t("revisao.olhar.vazio")),
    h("button", { type: "button", class: "botao leve", onclick: () => ctx.navegar("revisao") }, t("revisao.olhar.irRevisao")));
}
