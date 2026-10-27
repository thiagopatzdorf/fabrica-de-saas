// Aba "Rotinas": programas prontos (ABC, ABCD, corpo inteiro, superior/inferior, empurrar/puxar/pernas,
// calistenia em casa), as rotinas da pessoa com edição (trocar, mover, tirar exercício, séries e faixa de
// repetições) e o que o conjunto entrega de séries por grupo muscular por semana.
import { GRUPOS, exercicioPorId, porTempo, todosExercicios } from "../../../treino/catalogo.mjs";
import { PROGRAMAS, adicionarItem, montarPrograma, moverItem, mudarPrescricao, novoItem, removerItem, trocarExercicio, volumeDaRotina } from "../../../treino/programas.mjs";
import { FAIXA_VOLUME, faixaDeVolume } from "../../../treino/progressao.mjs";
import { adicionar, editar, remover } from "../../../esquema.mjs";
import { aviso, confirmar, estado, nota, secao, tabelaIrma, vazio } from "../_comum.mjs";
import { nomeEx } from "./comum.mjs";

export function aba(ctx, ui, render, raiz) {
  const { h, t } = ctx;
  const d = ctx.estado();
  const salvar = (fn) => ctx.mudar(fn).then(() => { ui.msg = null; }).catch((e) => { ui.msg = t("treino.erro", { codigo: (e?.erros ?? []).map((x) => x.codigo).join(", ") || String(e?.message ?? e) }); render(); });
  const partes = [];
  if (ui.msg) partes.push(aviso(h, ui.msg));
  // ---- minhas rotinas ----
  const minhas = [...d.rotinas].sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99) || (a.nome < b.nome ? -1 : 1));
  const corpo = [];
  if (!minhas.length) corpo.push(vazio(h, t("treino.semRotinas")));
  else {
    corpo.push(...minhas.map((r) => cartaoRotina({ ctx, ui, render, raiz, d, r, salvar })));
    corpo.push(volumeConjunto(ctx, d, minhas));
  }
  const nome = h("input", { type: "text", id: "treino-nova-rotina", maxlength: 60, "aria-label": t("treino.nomeRotina"), placeholder: t("treino.nomeRotinaEx") });
  corpo.push(h("form", { class: "treino-nova", onsubmit: (e) => { e.preventDefault(); const n = nome.value.trim(); if (!n) return; salvar((x) => adicionar(x, "rotinas", { nome: n, programa: "", ordem: x.rotinas.length + 1, itens: [] }, { novoId: ctx.novoId, agora: ctx.agora })); } },
    h("label", { class: "campo", for: "treino-nova-rotina" }, h("span", { class: "campo-rot" }, t("treino.novaRotina")), nome), h("button", { type: "submit", class: "peq" }, t("treino.criar"))));
  partes.push(secao(h, t("treino.minhasRotinas"), "treino-minhas", ...corpo));
  // ---- programas prontos ----
  partes.push(secao(h, t("treino.programasProntos"), "treino-programas", nota(h, t("treino.programasNota")), h("div", { class: "cards" }, PROGRAMAS.map((p) => {
    const rot = montarPrograma(p.id, ctx.idioma(), { novoId: () => "x" }), vol = volumeDaRotina(rot, d.exercicios);
    const topo = Object.entries(vol).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g, v]) => `${t(`treino.grupo.${g}`)} ${Math.round(v * 10) / 10}`).join(" · ");
    return h("article", { class: "treino-prog" }, h("h3", null, p.nome[ctx.idioma()]), h("p", null, p.descricao[ctx.idioma()]),
      h("p", { class: "nota" }, t("treino.programaResumo", { dias: p.dias, n: p.rotinas.length })), h("p", { class: "nota" }, t("treino.programaVolume", { lista: topo })),
      h("button", { type: "button", class: "peq", onclick: () => salvar((x) => { let r = x; const base = r.rotinas.length; montarPrograma(p.id, ctx.idioma(), { novoId: ctx.novoId }).forEach((ro, i) => { r = adicionar(r, "rotinas", { ...ro, ordem: base + i + 1 }, { novoId: ctx.novoId, agora: ctx.agora }); }); return r; }) }, t("treino.usarPrograma")));
  }))));
  return partes;
}

// Um cartão por rotina: resumo e, aberto, o editor de itens.
function cartaoRotina({ ctx, ui, render, raiz, d, r, salvar }) {
  const { h, t } = ctx;
  const setItens = (itens) => salvar((x) => editar(x, "rotinas", r.id, { itens }, { agora: ctx.agora }));
  const aberto = ui.rotinaAberta === r.id;
  const series = r.itens.reduce((a, i) => a + i.series, 0);
  const cab = h("div", { class: "treino-rotina-cab" }, h("div", { class: "item" }, h("b", null, r.nome), h("small", null, `${r.programa ? `${r.programa} · ` : ""}${t("treino.rotinaResumo", { n: r.itens.length, s: series })}`)),
    h("button", { type: "button", class: "peq", "aria-expanded": String(aberto), onclick: () => { ui.rotinaAberta = aberto ? null : r.id; render(); } }, aberto ? t("treino.fechar") : t("treino.editar")));
  if (!aberto) return h("article", { class: "treino-rotina" }, cab);
  const nomeIn = h("input", { type: "text", value: r.nome, maxlength: 60, id: `rn-${r.id}`, "aria-label": t("treino.nomeRotina") });
  const itens = r.itens.map((it, i) => {
    const ex = exercicioPorId(it.exercicioId, d.exercicios), tempo = porTempo(ex);
    const num = (v, min, max, campo, rot) => { const inp = h("input", { type: "text", inputmode: "numeric", value: String(v), "aria-label": `${rot} · ${nomeEx(ctx, ex)}`, class: "mini", onchange: () => { const n = Number(inp.value); if (Number.isInteger(n) && n >= min && n <= max) setItens(mudarPrescricao(r.itens, i, { [campo]: n })); else { inp.value = String(v); } } }); return h("label", { class: "mini-campo" }, h("span", null, rot), inp); };
    return h("li", { class: "treino-item" }, h("div", { class: "treino-item-nome" }, h("b", null, `${i + 1}. ${nomeEx(ctx, ex)}`), h("small", null, `${t(`treino.grupo.${ex.grupo}`)} · ${t(`treino.equip.${ex.equipamento}`)}`)),
      h("div", { class: "treino-item-campos" }, num(it.series, 1, 20, "series", t("treino.series")), num(it.repsMin, 1, 300, "repsMin", tempo ? t("treino.segMin") : t("treino.repsMin")), num(it.repsMax, 1, 300, "repsMax", tempo ? t("treino.segMax") : t("treino.repsMax"))),
      h("div", { class: "treino-item-acoes" },
        h("button", { type: "button", class: "peq", "aria-label": t("treino.subir", { nome: nomeEx(ctx, ex) }), disabled: i === 0, onclick: () => setItens(moverItem(r.itens, i, -1)) }, "↑"),
        h("button", { type: "button", class: "peq", "aria-label": t("treino.descer", { nome: nomeEx(ctx, ex) }), disabled: i === r.itens.length - 1, onclick: () => setItens(moverItem(r.itens, i, 1)) }, "↓"),
        h("button", { type: "button", class: "peq", "aria-label": t("treino.tirar", { nome: nomeEx(ctx, ex) }), onclick: () => setItens(removerItem(r.itens, i)) }, t("treino.tirarCurto"))));
  });
  const sel = h("select", { id: `ra-${r.id}`, "aria-label": t("treino.adicionarExercicio") }, GRUPOS.map((g) => h("optgroup", { label: t(`treino.grupo.${g}`) }, todosExercicios(d.exercicios).filter((e) => e.grupo === g).map((e) => h("option", { value: e.id }, nomeEx(ctx, e))))));
  return h("article", { class: "treino-rotina aberta" }, cab,
    h("div", { class: "treino-editor" },
      h("label", { class: "campo", for: nomeIn.id }, h("span", { class: "campo-rot" }, t("treino.nomeRotina")), nomeIn),
      h("button", { type: "button", class: "peq", onclick: () => { const n = nomeIn.value.trim(); if (n && n !== r.nome) salvar((x) => editar(x, "rotinas", r.id, { nome: n }, { agora: ctx.agora })); } }, t("treino.renomear")),
      r.itens.length ? h("ol", { class: "treino-itens" }, itens) : vazio(h, t("treino.rotinaVazia")),
      h("div", { class: "treino-add-linha" }, sel, h("button", { type: "button", class: "peq", onclick: () => setItens(adicionarItem(r.itens, novoItem(sel.value, d.exercicios))) }, t("treino.adicionar"))),
      h("div", { class: "botoes" }, h("button", { type: "button", class: "peq perigo", onclick: async () => { if (await confirmar(h, raiz, { titulo: t("treino.apagarRotinaTitulo", { nome: r.nome }), texto: t("treino.apagarRotinaTexto"), ok: t("treino.apagar"), cancelar: t("treino.cancelar") })) { ui.rotinaAberta = null; salvar((x) => remover(x, "rotinas", r.id, { agora: ctx.agora })); } } }, t("treino.apagarRotina")))));
}

// O que o conjunto entrega por semana (cada rotina uma vez) contra a faixa de 10–20 séries por grupo.
function volumeConjunto(ctx, d, rotinas) {
  const { h, t, fmt } = ctx;
  const vol = volumeDaRotina(rotinas, d.exercicios);
  const linhas = GRUPOS.map((g) => [g, vol[g] ?? 0]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!linhas.length) return h("span");
  return h("div", { class: "treino-volplano" }, h("h3", null, t("treino.volumePlano")), nota(h, t("treino.volumePlanoNota", { min: FAIXA_VOLUME.min, max: FAIXA_VOLUME.max })),
    tabelaIrma(h, { aberta: false, resumo: t("treino.verTabela"), cabecalho: [t("treino.grupo"), t("treino.seriesSemana"), t("treino.faixa")], linhas: linhas.map(([g, v]) => [t(`treino.grupo.${g}`), fmt.numero(v, 1), t(`treino.faixa.${faixaDeVolume(v)}`)]) }));
}
