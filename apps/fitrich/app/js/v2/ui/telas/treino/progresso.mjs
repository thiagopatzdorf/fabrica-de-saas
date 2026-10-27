// Aba "Progresso": volume da semana por grupo muscular contra a faixa de evidência (10–20 séries), platôs e
// deload sugeridos SEM culpa, evolução do 1RM estimado por exercício e recordes pessoais. Cada gráfico tem a
// tabela ao lado. Todo número vem dos módulos puros de js/v2/treino/ (testados com valor de referência).
import { GRUPOS, exercicioPorId, porTempo } from "../../../treino/catalogo.mjs";
import { FAIXA_VOLUME, detectarPlato, faixaDeVolume, historicoDoExercicio, metricaDaSessao, platosDaPessoa, sugerirDeload, sugerirProxima, volumeSemanal } from "../../../treino/progressao.mjs";
import { recordesDaPessoa, recordesDoExercicio } from "../../../treino/recordes.mjs";
import { somarDias, dia } from "../../../../datas.mjs";
import { graficoLinha } from "../../graficos-patrimonio.mjs";
import { estado, larguraGrafico, nota, secao, tabelaIrma, vazio } from "../_comum.mjs";
import { nomeEx, numTexto } from "./comum.mjs";

const ICONE_FAIXA = { sem_registro: "info", abaixo: "info", na_faixa: "ok", acima: "atencao" };

export function aba(ctx, ui, render) {
  const { h, hs, t, fmt } = ctx;
  const d = ctx.estado(), hoje = ctx.hoje(), partes = [];
  // ---- volume da semana ----
  const ref = somarDias(hoje, 7 * (ui.semana ?? 0)), v = volumeSemanal(d.sessoes, d.exercicios, ref);
  const nav = h("div", { class: "treino-semana-nav" },
    h("button", { type: "button", class: "peq", "aria-label": t("treino.semanaAnterior"), onclick: () => { ui.semana = (ui.semana ?? 0) - 1; render(); } }, "←"),
    h("span", { class: "treino-semana-rot", "aria-live": "polite" }, t("treino.semanaDeAte", { de: fmt.dataCurta(v.inicio), ate: fmt.dataCurta(v.fim) })),
    h("button", { type: "button", class: "peq", "aria-label": t("treino.semanaSeguinte"), disabled: (ui.semana ?? 0) >= 0, onclick: () => { ui.semana = Math.min(0, (ui.semana ?? 0) + 1); render(); } }, "→"));
  const linhas = GRUPOS.map((g) => ({ g, v: v.grupos[g] ?? 0 })), escala = Math.max(FAIXA_VOLUME.max + 5, ...linhas.map((l) => l.v));
  partes.push(secao(h, t("treino.volumeSemana"), "treino-volume", nav,
    v.series ? h("div", { class: "rolar" }, h("table", { class: "treino-tabela-vol" }, h("thead", null, h("tr", null, [t("treino.grupo"), t("treino.seriesSemana"), t("treino.faixa")].map((c) => h("th", { scope: "col" }, c)))),
      h("tbody", null, linhas.map(({ g, v: x }) => h("tr", null, h("th", { scope: "row" }, h("span", null, t(`treino.grupo.${g}`)), h("progress", { class: ["barra-vol", x >= FAIXA_VOLUME.min && x <= FAIXA_VOLUME.max ? "na-faixa" : null], max: escala, value: x, "aria-label": `${t(`treino.grupo.${g}`)}: ${fmt.numero(x, 1)}` })), h("td", { class: "num" }, fmt.numero(x, 1)),
        h("td", null, estado(h, { codigo: ICONE_FAIXA[faixaDeVolume(x)], texto: t(`treino.faixa.${faixaDeVolume(x)}`) }))))))) : vazio(h, t("treino.semVolume")),
    nota(h, t("treino.volumeNota", { min: FAIXA_VOLUME.min, max: FAIXA_VOLUME.max })),
    h("details", { class: "tab" }, h("summary", null, t("treino.comoCalculado")), h("p", { class: "nota" }, t("treino.comoVolume")), h("p", { class: "nota" }, t("treino.fontesVolume")))));
  // ---- platô e deload ----
  const platos = platosDaPessoa(d.sessoes, d.exercicios, hoje), dl = sugerirDeload(d.sessoes, d.exercicios, hoje);
  const pc = [];
  pc.push(h("p", null, estado(h, { codigo: dl.sugerir ? "info" : "ok", texto: dl.sugerir ? t("treino.deloadConvite", { n: dl.semanas, semanas: dl.semanas }) : t("treino.deloadNaoPrecisa", { semanas: dl.semanas }) })));
  if (dl.sugerir) pc.push(nota(h, t("treino.deloadComo", { pct: dl.reducaoPct, dias: dl.dias })));
  if (platos.length) pc.push(h("ul", { class: "lista treino-platos" }, platos.map((p) => h("li", null, h("span", { class: "item" }, nomeEx(ctx, exercicioPorId(p.exercicioId, d.exercicios)), h("small", null, t(p.tipo === "e1rm" ? "treino.platoE1rm" : "treino.platoReps", { n: p.sessoes, recente: numTexto(p.melhorRecente, ctx.idioma()), antes: numTexto(p.melhorAntes, ctx.idioma()) })))))), nota(h, t("treino.platoIdeias")));
  else pc.push(nota(h, t("treino.semPlato")));
  partes.push(secao(h, t("treino.platoDeload"), "treino-plato", ...pc, h("details", { class: "tab" }, h("summary", null, t("treino.comoCalculado")), h("p", { class: "nota" }, t("treino.comoPlato")), h("p", { class: "nota" }, t("treino.fontesDeload")))));
  // ---- evolução por exercício ----
  // Mais feito primeiro como padrão do seletor; no resto, ordem alfabética.
  const vezes = {};
  for (const x of d.sessoes) if (x.estado === "concluida") for (const id of new Set(x.series.filter((s) => !s.aquecimento).map((s) => s.exercicioId))) vezes[id] = (vezes[id] ?? 0) + 1;
  const feitos = Object.keys(vezes).map((id) => exercicioPorId(id, d.exercicios)).filter(Boolean).sort((a, b) => vezes[b.id] - vezes[a.id] || nomeEx(ctx, a).localeCompare(nomeEx(ctx, b), ctx.idioma()));
  if (feitos.length) {
    if (!feitos.some((e) => e.id === ui.exProgresso)) ui.exProgresso = feitos[0].id;
    const sel = h("select", { id: "treino-ex-prog", "aria-label": t("treino.escolherExercicio"), onchange: () => { ui.exProgresso = sel.value; render(); sel.focus?.(); } }, feitos.map((e) => h("option", { value: e.id, selected: e.id === ui.exProgresso }, nomeEx(ctx, e))));
    partes.push(secao(h, t("treino.evolucao"), "treino-evolucao", h("label", { class: "campo", for: sel.id }, h("span", { class: "campo-rot" }, t("treino.escolherExercicio")), sel), ...evolucao(ctx, d, hoje, ui.exProgresso)));
  } else partes.push(secao(h, t("treino.evolucao"), "treino-evolucao", vazio(h, t("treino.semHistorico"))));
  // ---- recordes ----
  const recs = recordesDaPessoa(d.sessoes).slice(0, 12);
  partes.push(secao(h, t("treino.recordes"), "treino-recordes", recs.length ? tabelaIrma(h, { aberta: true, resumo: t("treino.recordesTabela", { n: recs.length }), cabecalho: [t("treino.exercicio"), t("treino.cargaMax"), t("treino.e1rm"), t("treino.data")],
    linhas: recs.map((r) => { const ex = exercicioPorId(r.exercicioId, d.exercicios), tempo = porTempo(ex); return [nomeEx(ctx, ex), r.carga ? `${numTexto(r.carga.valor, ctx.idioma())} ${t("treino.kg")} × ${r.carga.reps}` : r.reps ? `${r.reps.valor} ${tempo ? t("treino.seg") : t("treino.reps")}` : "—", r.e1rm ? `${numTexto(Math.round(r.e1rm.valor * 10) / 10, ctx.idioma())} ${t("treino.kg")}` : "—", fmt.data((r.e1rm ?? r.carga ?? r.reps).data)]; }) }) : vazio(h, t("treino.semRecordes")), nota(h, t("treino.recordesNota"))));
  return partes;
}

// Gráfico do melhor 1RM estimado (ou repetições) por sessão, tabela-irmã, recordes e próxima sugestão.
function evolucao(ctx, d, hoje, exId) {
  const { h, hs, t, fmt } = ctx;
  const ex = exercicioPorId(exId, d.exercicios), hist = historicoDoExercicio(d.sessoes, exId), pontos = hist.map((x) => ({ data: x.data, ...metricaDaSessao(x) }));
  const tipo = pontos[0]?.tipo ?? "e1rm", unidade = tipo === "e1rm" ? t("treino.kg") : porTempo(ex) ? t("treino.seg") : t("treino.reps");
  const ult = pontos.slice(-24), marcas = ult.length ? [...new Set([ult[0], ult[Math.floor(ult.length / 2)], ult[ult.length - 1]])] : [];
  const fmtV = (v) => numTexto(Math.round(v * 10) / 10, ctx.idioma());
  const svg = graficoLinha({ hs, largura: larguraGrafico(), titulo: t(tipo === "e1rm" ? "treino.graficoE1rm" : "treino.graficoReps", { nome: nomeEx(ctx, ex) }), desc: t("treino.graficoDesc", { n: ult.length }),
    pontos: ult.map((p) => ({ x: dia(p.data), y: p.valor, tip: `${fmt.data(p.data)}: ${fmtV(p.valor)} ${unidade}` })), media: ult.map((p) => ({ x: dia(p.data), y: p.valor })), fmtY: (v) => fmtV(v), xRotulos: marcas.map((p) => ({ x: dia(p.data), texto: fmt.dataCurta(p.data) })) });
  const plato = detectarPlato(hist), rec = recordesDoExercicio(d.sessoes, exId);
  const item = d.rotinas.flatMap((r) => r.itens).find((i) => i.exercicioId === exId) ?? { series: 3, repsMin: 8, repsMax: 12 };
  const sug = sugerirProxima(hist, item, ex);
  return [
    h("div", { class: "graf" }, svg),
    tabelaIrma(h, { resumo: t("treino.verTabela"), cabecalho: [t("treino.data"), tipo === "e1rm" ? t("treino.e1rm") : t("treino.reps")], linhas: ult.map((p) => [fmt.data(p.data), `${fmtV(p.valor)} ${unidade}`]) }),
    nota(h, t(tipo === "e1rm" ? "treino.e1rmNota" : "treino.repsNota")),
    h("div", { class: "grade" },
      h("div", { class: "st" }, h("span", { class: "st-rot" }, t("treino.cargaMax")), h("b", { class: "st-val" }, rec.carga ? `${numTexto(rec.carga.valor, ctx.idioma())} ${t("treino.kg")}` : "—"), h("small", { class: "st-sub" }, rec.carga ? `${rec.carga.reps} ${t("treino.reps")} · ${fmt.data(rec.carga.data)}` : "")),
      h("div", { class: "st" }, h("span", { class: "st-rot" }, t("treino.e1rm")), h("b", { class: "st-val" }, rec.e1rm ? `${fmtV(rec.e1rm.valor)} ${t("treino.kg")}` : "—"), h("small", { class: "st-sub" }, rec.e1rm ? fmt.data(rec.e1rm.data) : "")),
      h("div", { class: "st" }, h("span", { class: "st-rot" }, t("treino.proxima")), h("b", { class: "st-val" }, sug.kg != null && sug.kg > 0 ? `${numTexto(sug.kg, ctx.idioma())} ${t("treino.kg")}` : `${sug.repsAlvo} ${t("treino.reps")}`), h("small", { class: "st-sub" }, t(`treino.sug.${sug.acao}`, { kg: numTexto(sug.kg ?? 0, ctx.idioma()), reps: sug.repsAlvo })))),
    plato.plato ? nota(h, t("treino.platoDeste")) : null,
  ];
}
