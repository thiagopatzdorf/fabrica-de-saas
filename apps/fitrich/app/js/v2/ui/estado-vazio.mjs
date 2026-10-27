// Estado vazio que ensina (O quê? Por quê? E agora?), a mesma peça em todas as telas (design-v3.md): ícone, título que diz
// o que vai morar ali, uma frase do porquê e no máximo duas ações. Sem culpa; texto sempre pelo t() da tela.
// opcoes: { icone, titulo, texto, passo?, acoes?: [{ rotulo, ir?, params?, onclick?, leve?, icone? }], nivel? }
import { icone } from "./icones.mjs";

export function criarEstadoVazio({ h, navegar }) {
  return ({ icone: nome = "ponto", titulo, texto, passo = null, acoes = [], nivel = 3 }) => h("section", { class: "vazio-ensina" },
    h("span", { class: "vazio-icone", "aria-hidden": "true" }, icone(nome)), h(`h${nivel}`, null, titulo),
    texto ? h("p", null, texto) : null, passo ? h("p", { class: "passo" }, passo) : null,
    acoes.length ? h("div", { class: "acoes" }, ...acoes.map((a) => h("button", { type: "button", class: ["botao", a.leve && "leve"], onclick: a.onclick ?? (() => navegar(a.ir, a.params)) }, a.icone ? icone(a.icone) : null, a.rotulo))) : null);
}
