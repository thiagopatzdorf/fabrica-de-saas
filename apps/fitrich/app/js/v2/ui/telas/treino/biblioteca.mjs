// Aba "Exercícios": a biblioteca (92 exercícios originais) com busca e filtros por grupo muscular, equipamento
// e padrão de movimento; mostra músculos primários e secundários; e permite criar exercício próprio.
import { CATALOGO, EQUIPAMENTOS, GRUPOS, PADROES, buscar, incrementoPadrao } from "../../../treino/catalogo.mjs";
import { adicionar, remover } from "../../../esquema.mjs";
import { alternador, aviso, campo, confirmar, nota, secao, selecionar, vazio } from "../_comum.mjs";
import { nomeEx } from "./comum.mjs";

const MAX = 40;

export function aba(ctx, ui, render, raiz) {
  const { h, t } = ctx;
  const d = ctx.estado(), f = ui.filtro ?? (ui.filtro = { texto: "", grupo: "", equipamento: "", padrao: "" });
  const salvar = (fn) => ctx.mudar(fn).then(() => { ui.msg = null; }).catch((e) => { ui.msg = t("treino.erro", { codigo: (e?.erros ?? []).map((x) => x.codigo).join(", ") || String(e?.message ?? e) }); render(); });
  const partes = [];
  if (ui.msg) partes.push(aviso(h, ui.msg));
  const busca = h("input", { type: "search", id: "treino-busca", value: f.texto, "aria-label": t("treino.buscar"), placeholder: t("treino.buscarEx"), oninput: () => { f.texto = busca.value; ui.reFiltrar(); } });
  const sel = (campoNome, rotulo, lista, chave) => { const s = h("select", { id: `treino-f-${campoNome}`, "aria-label": rotulo, onchange: () => { f[campoNome] = s.value; render(); } }, h("option", { value: "" }, `${rotulo}: ${t("treino.todos")}`), lista.map((x) => h("option", { value: x, selected: f[campoNome] === x }, t(`${chave}.${x}`)))); return s; };
  const lista = h("div", { id: "treino-lista-ex" });
  ui.reFiltrar = () => { lista.replaceChildren(...listaEx()); };
  function listaEx() {
    const r = buscar(d.exercicios, { texto: f.texto, grupo: f.grupo || null, equipamento: f.equipamento || null, padrao: f.padrao || null });
    const ordem = r.sort((a, b) => GRUPOS.indexOf(a.grupo) - GRUPOS.indexOf(b.grupo) || nomeEx(ctx, a).localeCompare(nomeEx(ctx, b), ctx.idioma()));
    const nos = [h("p", { class: "nota", role: "status", "aria-live": "polite" }, t("treino.resultados", { n: ordem.length, total: CATALOGO.length + d.exercicios.length }))];
    if (!ordem.length) return [...nos, vazio(h, t("treino.nenhum"))];
    nos.push(h("ul", { class: "lista treino-bib" }, ordem.slice(0, MAX).map((e) => {
      const propria = d.exercicios.some((x) => x.id === e.id);
      return h("li", null, h("details", { class: "tab" }, h("summary", null, h("span", { class: "item" }, nomeEx(ctx, e), h("small", null, `${t(`treino.grupo.${e.grupo}`)} · ${t(`treino.equip.${e.equipamento}`)} · ${t(`treino.padrao.${e.padrao}`)}`))),
        h("p", { class: "nota" }, `${t("treino.primarios")}: ${e.primarios.map((g) => t(`treino.grupo.${g}`)).join(", ")}`), e.secundarios.length ? h("p", { class: "nota" }, `${t("treino.secundarios")}: ${e.secundarios.map((g) => t(`treino.grupo.${g}`)).join(", ")}`) : null,
        h("p", { class: "nota" }, t("treino.degrau", { kg: incrementoPadrao(e) })),
        propria ? h("button", { type: "button", class: "peq perigo", onclick: async () => { if (await confirmar(h, raiz, { titulo: t("treino.apagarExTitulo", { nome: nomeEx(ctx, e) }), texto: t("treino.apagarExTexto"), ok: t("treino.apagar"), cancelar: t("treino.cancelar") })) salvar((x) => remover(x, "exercicios", e.id, { agora: ctx.agora })); } }, t("treino.apagar")) : null));
    })));
    if (ordem.length > MAX) nos.push(nota(h, t("treino.maisResultados", { n: MAX })));
    return nos;
  }
  lista.append(...listaEx());
  const form = formNovo(ctx, salvar);
  partes.push(secao(h, t("treino.biblioteca"), "treino-biblioteca",
    h("div", { class: "treino-filtros" }, h("label", { class: "campo", for: "treino-busca" }, h("span", { class: "campo-rot" }, t("treino.buscar")), busca), sel("grupo", t("treino.grupo"), GRUPOS, "treino.grupo"), sel("equipamento", t("treino.equipamento"), EQUIPAMENTOS, "treino.equip"), sel("padrao", t("treino.padrao"), PADROES, "treino.padrao")),
    lista, h("div", { class: "botoes" }, alternador(h, { texto: t("treino.criarExercicio"), alvo: form, aberto: false })), form));
  return partes;
}

function formNovo(ctx, salvar) {
  const { h, t } = ctx;
  const nome = campo(h, { rotulo: t("treino.nomeExercicio"), nome: "ex-nome", attrs: { required: true, maxlength: 60 } });
  const grupo = selecionar(h, { rotulo: t("treino.grupo"), nome: "ex-grupo", valor: "peito", opcoes: GRUPOS.map((g) => ({ valor: g, texto: t(`treino.grupo.${g}`) })) });
  const equip = selecionar(h, { rotulo: t("treino.equipamento"), nome: "ex-equip", valor: "halteres", opcoes: EQUIPAMENTOS.map((g) => ({ valor: g, texto: t(`treino.equip.${g}`) })) });
  const padrao = selecionar(h, { rotulo: t("treino.padrao"), nome: "ex-padrao", valor: "isolar", opcoes: PADROES.map((g) => ({ valor: g, texto: t(`treino.padrao.${g}`) })) });
  return h("form", { id: "form-ex", class: "form-crud", onsubmit: (e) => { e.preventDefault(); const n = nome.input.value.trim(); if (!n) return; salvar((x) => adicionar(x, "exercicios", { nome: n, grupo: grupo.input.value, equipamento: equip.input.value, padrao: padrao.input.value, primarios: [grupo.input.value], secundarios: [] }, { novoId: ctx.novoId, agora: ctx.agora })); } },
    h("h3", null, t("treino.criarExercicio")), nome, grupo, equip, padrao, nota(h, t("treino.exProprioNota")), h("div", { class: "botoes" }, h("button", { type: "submit" }, t("treino.salvar"))));
}
