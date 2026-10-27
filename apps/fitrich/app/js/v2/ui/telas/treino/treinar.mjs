// Aba "Treinar": começar uma sessão e, com ela aberta, registrar série a série (carga × repetições × RIR) com
// cronômetro de descanso, "última vez foi X" e a sugestão da próxima carga pela dupla progressão. Pensada para
// uma mão só: alvos grandes, campo de número com − e +, o botão de registrar logo abaixo dos campos.
import { exercicioPorId, incrementoPadrao, nomeDe, porTempo, todosExercicios, GRUPOS } from "../../../treino/catalogo.mjs";
import { aquecimentoPara, apagarSessao, concluirSessao, descansoSugerido, desfazerUltimaSerie, iniciarSessao, proximaRotina, registrarSerie, removerSerie, resumoDaSessao, sessaoEmAndamento, ultimaVez } from "../../../treino/sessao.mjs";
import { FAIXA_VOLUME, RIR_ALVO, historicoDoExercicio, seriesDeTrabalho, sugerirDeload, sugerirProxima } from "../../../treino/progressao.mjs";
import { aviso, confirmar, estado, nota, secao, vazio } from "../_comum.mjs";
import { escolha, mmssTexto, nomeEx, numTexto, passo } from "./comum.mjs";

const PRESCRICAO_LIVRE = { series: 3, repsMin: 8, repsMax: 12 };

// "60 kg × 10, 10, 9" (mesma carga seguida junta); "45 s" nos exercícios medidos em segundos; sem kg, só repetições.
export function textoSeries(series, { idioma, tempo = false, kgRotulo = "kg", segRotulo = "s" }) {
  const n = (v) => numTexto(v, idioma);
  const grupos = [];
  for (const s of series) { const g = grupos[grupos.length - 1]; if (g && g.kg === s.kg) g.reps.push(s.reps); else grupos.push({ kg: s.kg, reps: [s.reps] }); }
  return grupos.map((g) => (tempo ? `${g.reps.map((r) => `${r} ${segRotulo}`).join(", ")}${g.kg > 0 ? ` · ${n(g.kg)} ${kgRotulo}` : ""}` : g.kg > 0 ? `${n(g.kg)} ${kgRotulo} × ${g.reps.join(", ")}` : g.reps.join(", "))).join(" · ");
}

export function aba(ctx, ui, render, raiz) {
  const { h, t, fmt } = ctx;
  const d = ctx.estado(), hoje = ctx.hoje(), sessao = sessaoEmAndamento(d);
  const salvar = (fn) => ctx.mudar(fn).then(() => { ui.msg = null; }).catch((e) => { ui.msg = t("treino.erro", { codigo: (e?.erros ?? []).map((x) => x.codigo).join(", ") || String(e?.message ?? e) }); render(); });
  const partes = [];
  if (ui.msg) partes.push(aviso(h, ui.msg));
  if (sessao) partes.push(...aoVivo({ ctx, ui, render, raiz, d, sessao, salvar, hoje }));
  else partes.push(...inicio({ ctx, ui, render, raiz, d, salvar, hoje }));
  return partes;
}

// ---------------- sem sessão aberta ----------------
function inicio({ ctx, ui, raiz, d, salvar, hoje }) {
  const { h, t, fmt } = ctx;
  const comecar = (rotina) => salvar((x) => iniciarSessao(x, { rotina, hoje, agora: ctx.agora, novoId: ctx.novoId })).then(() => { ui.foco = null; ui.extras = []; });
  const prox = proximaRotina(d), partes = [];
  if (!d.rotinas.length) {
    partes.push(secao(h, t("treino.treinoDeHoje"), "treino-hoje", vazio(h, t("treino.semRotinas")),
      h("div", { class: "botoes" }, h("button", { type: "button", class: "grande", onclick: () => { ui.aba = "rotinas"; ui.rerender(); } }, t("treino.escolherPrograma")), h("button", { type: "button", class: "peq", onclick: () => comecar(null) }, t("treino.treinoLivre")))));
  } else {
    partes.push(h("section", { class: "cartao treino-hoje" }, h("h2", null, t("treino.treinoDeHoje")),
      h("p", { class: "treino-hoje-nome" }, prox.nome), h("p", { class: "nota" }, t("treino.rotinaResumo", { n: prox.itens.length, s: prox.itens.reduce((a, i) => a + i.series, 0) })),
      h("ul", { class: "treino-previa" }, prox.itens.slice(0, 6).map((i) => h("li", null, h("span", null, nomeEx(ctx, exercicioPorId(i.exercicioId, d.exercicios))), h("small", null, t("treino.prescricao", { s: i.series, a: i.repsMin, b: i.repsMax }))))),
      h("div", { class: "botoes" }, h("button", { type: "button", class: "grande", onclick: () => comecar(prox) }, t("treino.comecar", { nome: prox.nome }))),
      d.rotinas.length > 1 ? h("details", { class: "tab" }, h("summary", null, t("treino.outraRotina")), h("div", { class: "botoes" }, [...d.rotinas].sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99)).filter((r) => r.id !== prox.id).map((r) => h("button", { type: "button", class: "peq", onclick: () => comecar(r) }, r.nome)), h("button", { type: "button", class: "peq", onclick: () => comecar(null) }, t("treino.treinoLivre")))) : h("div", { class: "botoes" }, h("button", { type: "button", class: "peq", onclick: () => comecar(null) }, t("treino.treinoLivre")))));
  }
  const dl = sugerirDeload(d.sessoes, d.exercicios, hoje);
  if (dl.sugerir) partes.push(h("section", { class: "cartao treino-deload" }, h("h2", null, t("treino.deloadTitulo")), estado(h, { codigo: "info", texto: t("treino.deloadConvite", { n: dl.semanas, semanas: dl.semanas }) }),
    h("p", { class: "nota" }, t("treino.deloadComo", { pct: dl.reducaoPct, dias: dl.dias })), h("p", { class: "nota" }, t(dl.motivos.includes("platos") ? "treino.deloadMotivoPlatos" : "treino.deloadMotivoTempo", { n: dl.platos }))));
  const concl = d.sessoes.filter((x) => x.estado === "concluida").slice(-6).reverse();
  if (concl.length) partes.push(secao(h, t("treino.sessoesRecentes"), "treino-recentes", h("ul", { class: "lista treino-sessoes" }, concl.map((s) => {
    const r = resumoDaSessao(s, d.exercicios);
    return h("li", null, h("details", { class: "tab" }, h("summary", null, h("span", { class: "item" }, `${fmt.data(s.data)} · ${s.rotinaNome || t("treino.treinoLivre")}`, h("small", null, t("treino.resumoSessao", { s: r.series, v: fmt.numero(Math.round(r.tonelagem)), m: s.minutos ?? 0 })))),
      h("ul", { class: "treino-detalhe" }, [...new Set(s.series.map((x) => x.exercicioId))].map((id) => { const ex = exercicioPorId(id, d.exercicios); return h("li", null, h("b", null, nomeEx(ctx, ex)), h("span", null, textoSeries(s.series.filter((x) => x.exercicioId === id && !x.aquecimento), { idioma: ctx.idioma(), tempo: porTempo(ex), kgRotulo: t("treino.kg"), segRotulo: t("treino.seg") }))); })),
      h("button", { type: "button", class: "peq", "aria-label": t("treino.apagarSessaoDe", { data: fmt.data(s.data) }), onclick: async () => { if (await confirmar(h, raiz, { titulo: t("treino.apagarSessaoDe", { data: fmt.data(s.data) }), texto: t("treino.apagarSessaoTexto"), ok: t("treino.apagar"), cancelar: t("treino.cancelar") })) salvar((x) => apagarSessao(x, s.id, { agora: ctx.agora })); } }, t("treino.apagar"))));
  }))));
  return partes;
}

// ---------------- sessão aberta ----------------
function aoVivo({ ctx, ui, render, raiz, d, sessao, salvar, hoje }) {
  const { h, t, fmt } = ctx;
  const rotina = d.rotinas.find((r) => r.id === sessao.rotinaId) ?? null, itens = rotina?.itens ?? [];
  const ids = [...new Set([...itens.map((i) => i.exercicioId), ...(ui.extras ?? []), ...sessao.series.map((s) => s.exercicioId)])];
  if (!ids.includes(ui.foco)) ui.foco = ids.find((id) => { const it = itens.find((i) => i.exercicioId === id); return !it || seriesDeTrabalho(sessao, id).length < it.series; }) ?? ids[0] ?? null;
  const partes = [];
  partes.push(h("section", { class: "cartao treino-vivo-cab" },
    h("h2", null, sessao.rotinaNome || t("treino.treinoLivre")), h("p", { class: "nota" }, t("treino.sessaoAberta")),
    relogio(ctx, ui, render)));
  if (ids.length) {
    partes.push(h("nav", { class: "treino-exs", "aria-label": t("treino.exerciciosDaSessao") }, ids.map((id) => {
      const ex = exercicioPorId(id, d.exercicios), it = itens.find((i) => i.exercicioId === id), feitas = seriesDeTrabalho(sessao, id).length;
      return h("button", { type: "button", class: "chip treino-ex-chip", "aria-pressed": String(id === ui.foco), onclick: () => { ui.foco = id; render(); } }, h("span", null, nomeEx(ctx, ex)), h("small", null, it ? t("treino.feitasDe", { x: feitas, n: it.series }) : t("treino.feitas", { n: feitas })));
    })));
    partes.push(cartaoExercicio({ ctx, ui, render, d, sessao, id: ui.foco, item: itens.find((i) => i.exercicioId === ui.foco) ?? null, salvar }));
  } else partes.push(vazio(h, t("treino.sessaoVazia")));
  partes.push(adicionarExercicio({ ctx, ui, render, d }));
  const r = resumoDaSessao(sessao, d.exercicios);
  partes.push(h("section", { class: "cartao treino-fim" }, h("p", { class: "nota" }, t("treino.resumoAoVivo", { s: r.series, e: r.exercicios })),
    h("div", { class: "botoes" },
      h("button", { type: "button", class: "grande", onclick: () => concluir({ ctx, ui, raiz, sessao, salvar }) }, t("treino.concluir")),
      h("button", { type: "button", class: "peq perigo", onclick: async () => { if (await confirmar(h, raiz, { titulo: t("treino.descartarTitulo"), texto: t("treino.descartarTexto"), ok: t("treino.descartar"), cancelar: t("treino.voltar") })) salvar((x) => apagarSessao(x, sessao.id, { agora: ctx.agora })); } }, t("treino.descartar")))));
  return partes;
}

function cartaoExercicio({ ctx, ui, render, d, sessao, id, item, salvar }) {
  const { h, t, fmt, idioma } = ctx;
  const ex = exercicioPorId(id, d.exercicios), tempo = porTempo(ex), presc = item ?? PRESCRICAO_LIVRE;
  const inc = item?.incremento ?? incrementoPadrao(ex), degrau = inc || 2.5;
  const hist = historicoDoExercicio(d.sessoes, id), ult = ultimaVez(d.sessoes, id), sug = sugerirProxima(hist, presc, ex);
  const hoje = seriesDeTrabalho(sessao, id), todas = sessao.series.map((s, i) => ({ ...s, i })).filter((s) => s.exercicioId === id);
  const ultimoDia = todas.length ? todas[todas.length - 1] : null;
  const kgInicial = ultimoDia ? ultimoDia.kg : sug.kg ?? (ult ? Math.max(...ult.series.map((s) => s.kg)) : 0);
  const repsInicial = ultimoDia ? ultimoDia.reps : sug.repsAlvo;
  const cab = h("div", { class: "treino-ex-cab" }, h("h3", null, nomeEx(ctx, ex)),
    h("p", { class: "nota" }, [...ex.primarios.map((g) => t(`treino.grupo.${g}`)), ...ex.secundarios.map((g) => `${t(`treino.grupo.${g}`)} (${t("treino.secundario")})`)].join(" · ")),
    h("p", { class: "nota" }, item ? t("treino.meta", { s: item.series, a: item.repsMin, b: item.repsMax, u: tempo ? t("treino.seg") : t("treino.reps"), rmin: RIR_ALVO.min, rmax: RIR_ALVO.max }) : t("treino.metaLivre")));
  const dicas = [];
  dicas.push(h("p", { class: "treino-ultima" }, ult ? t("treino.ultimaVez", { data: fmt.dataCurta(ult.data), series: textoSeries(ult.series, { idioma: idioma(), tempo, kgRotulo: t("treino.kg"), segRotulo: t("treino.seg") }) }) : t("treino.primeiraVez")));
  const sugTexto = sug.acao === "inicio" ? t("treino.sug.inicio", { reps: sug.repsAlvo }) : t(`treino.sug.${sug.acao}`, { kg: numTexto(sug.kg, idioma()), reps: sug.repsAlvo });
  dicas.push(h("p", { class: "treino-sugestao" }, estado(h, { codigo: sug.acao === "subir" ? "ok" : "info", texto: sugTexto })));
  if (!todas.length && sug.kg > 0 && !tempo) { const aq = aquecimentoPara(sug.kg, degrau); if (aq.length) dicas.push(h("p", { class: "nota" }, t("treino.aquecimento", { lista: aq.map((s) => `${numTexto(s.kg, idioma())} × ${s.reps}`).join(" · ") }))); }
  // Séries de hoje.
  const lista = todas.length ? h("ol", { class: "treino-series" }, todas.map((s, n) => h("li", null,
    h("span", { class: "treino-serie-txt" }, s.aquecimento ? h("em", { class: "tag" }, t("treino.aqueceu")) : null, tempo ? `${s.reps} ${t("treino.seg")}${s.kg > 0 ? ` · ${numTexto(s.kg, idioma())} ${t("treino.kg")}` : ""}` : `${s.kg > 0 ? `${numTexto(s.kg, idioma())} ${t("treino.kg")} × ` : ""}${s.reps}`, s.rir != null ? h("small", null, ` · RIR ${s.rir}`) : null),
    h("button", { type: "button", class: "peq", "aria-label": t("treino.removerSerie", { n: n + 1 }), onclick: () => salvar((x) => removerSerie(x, sessao.id, s.i, { agora: ctx.agora })) }, t("treino.remover")))))
    : h("p", { class: "nota" }, t("treino.semSeries"));
  // Formulário.
  const kg = passo(ctx, { rotulo: ex.equipamento === "peso_corporal" ? t("treino.cargaExtra") : t("treino.carga"), valor: kgInicial, passo: degrau, min: 0, max: 1000, decimal: true, classe: "passo-kg" });
  const reps = passo(ctx, { rotulo: tempo ? t("treino.segundos") : t("treino.reps"), valor: repsInicial, passo: tempo ? 5 : 1, min: 1, max: 300, classe: "passo-reps" });
  const rir = escolha(ctx, { rotulo: t("treino.rir"), valor: ultimoDia?.rir ?? 2, opcoes: [0, 1, 2, 3, 4].map((v) => ({ valor: v, texto: v === 4 ? "4+" : String(v), alternavel: true })) });
  const aq = h("input", { type: "checkbox", id: "treino-aq" });
  const registrar = () => {
    const k = kg.ler(), r = reps.ler();
    if (k == null || r == null || k < 0 || !Number.isInteger(r) || r < 1) { ui.msg = t("treino.valorInvalido"); return render(); }
    const serie = { exercicioId: id, kg: k, reps: r, rir: rir.ler(), aquecimento: aq.checked };
    let recordes = [];
    ui.descanso = { fimMs: Date.now() + (aq.checked ? 45 : item?.descansoS ?? descansoSugerido(ex, r)) * 1000, totalS: aq.checked ? 45 : item?.descansoS ?? descansoSugerido(ex, r), acabou: false };
    ui.recordes = null;
    ui.anuncio = t("treino.serieRegistrada", { n: todas.filter((s) => !s.aquecimento).length + (aq.checked ? 0 : 1) });
    salvar((x) => { const res = registrarSerie(x, sessao.id, serie, { agora: ctx.agora }); recordes = res.recordes; ui.recordes = recordes.length ? { id, tipos: recordes } : null; return res.dados; });
  };
  const rec = ui.recordes && ui.recordes.id === id ? h("p", { class: "treino-recorde", role: "status" }, estado(h, { codigo: "ok", texto: t("treino.novoRecorde", { tipos: ui.recordes.tipos.map((x) => t(`treino.rec.${x}`)).join(", ") }) })) : null;
  return h("section", { class: "cartao treino-ex" }, cab, ...dicas, lista, rec,
    h("div", { class: "treino-form" }, kg.elemento, reps.elemento, rir.elemento,
      h("label", { class: "campo-check", for: "treino-aq" }, aq, h("span", null, t("treino.eAquecimento"))),
      h("div", { class: "botoes" }, h("button", { type: "button", class: "grande", onclick: registrar }, t("treino.registrar")),
        todas.length ? h("button", { type: "button", class: "peq", onclick: () => salvar((x) => desfazerUltimaSerie(x, sessao.id, { agora: ctx.agora })) }, t("treino.desfazer")) : null)));
}

function adicionarExercicio({ ctx, ui, render, d }) {
  const { h, t } = ctx;
  const sel = h("select", { id: "treino-add-ex", "aria-label": t("treino.adicionarExercicio") }, GRUPOS.map((g) => h("optgroup", { label: t(`treino.grupo.${g}`) }, todosExercicios(d.exercicios).filter((e) => e.grupo === g).map((e) => h("option", { value: e.id }, nomeEx(ctx, e))))));
  return h("details", { class: "cartao tab treino-add" }, h("summary", null, t("treino.adicionarExercicio")),
    h("div", { class: "treino-add-linha" }, sel, h("button", { type: "button", class: "peq", onclick: () => { ui.extras = [...new Set([...(ui.extras ?? []), sel.value])]; ui.foco = sel.value; render(); } }, t("treino.adicionar"))));
}

// Cronômetro de descanso: o fim é um instante absoluto (Date.now), então a aba em segundo plano não o atrasa.
function relogio(ctx, ui, render) {
  const { h, t } = ctx;
  const tela = h("span", { class: "relogio-tempo", role: "timer", "aria-live": "off" }, "0:00");
  const barra = h("progress", { class: "relogio-barra", max: 1000, value: 0, "aria-label": t("treino.descansoBarra") });
  const msg = h("p", { class: "oculto", role: "status", "aria-live": "polite" }, ui.anuncio ?? "");
  const pintar = () => {
    if (!ui.descanso) return;
    const resta = (ui.descanso.fimMs - Date.now()) / 1000;
    tela.textContent = mmssTexto(Math.max(0, resta));
    barra.value = Math.round((1 - Math.max(0, resta) / ui.descanso.totalS) * 1000);
    if (resta <= 0 && !ui.descanso.acabou) { ui.descanso.acabou = true; msg.textContent = t("treino.descansoFim"); tela.classList.add("relogio-fim"); try { navigator.vibrate?.([200, 100, 200]); } catch { /* sem vibração */ } }
  };
  clearInterval(ui.intervalo);
  const ajustar = (s) => { ui.descanso = { ...ui.descanso, fimMs: ui.descanso.fimMs + s * 1000, totalS: Math.max(ui.descanso.totalS + s, 15), acabou: false }; tela.classList.remove("relogio-fim"); pintar(); };
  const iniciar = (s) => { ui.descanso = { fimMs: Date.now() + s * 1000, totalS: s, acabou: false }; render(); };
  if (!ui.descanso) return h("div", { class: "relogio relogio-parado" }, h("span", { class: "relogio-rot" }, t("treino.descanso")), h("div", { class: "chips" }, [60, 90, 120, 180].map((s) => h("button", { type: "button", class: "chip", onclick: () => iniciar(s) }, mmssTexto(s)))), msg);
  pintar();
  if (!ui.descanso.acabou) ui.intervalo = setInterval(pintar, 250);
  return h("div", { class: "relogio" }, h("span", { class: "relogio-rot" }, t("treino.descanso")), tela, barra,
    h("div", { class: "botoes" }, h("button", { type: "button", class: "peq", onclick: () => ajustar(-15) }, t("treino.menos15")), h("button", { type: "button", class: "peq", onclick: () => ajustar(15) }, t("treino.mais15")),
      h("button", { type: "button", class: "peq", onclick: () => { clearInterval(ui.intervalo); ui.descanso = null; render(); } }, t("treino.pular"))), msg);
}

// Concluir: pergunta só o esforço (1–5), opcional, e grava a sessão e o treino simples.
function concluir({ ctx, ui, raiz, sessao, salvar }) {
  const { h, t } = ctx;
  let esf = 3;
  const opc = escolha(ctx, { rotulo: t("treino.esforcoTreino"), valor: 3, opcoes: [1, 2, 3, 4, 5].map((v) => ({ valor: v, texto: String(v), alternavel: true })), aoEscolher: (v) => { esf = v; } });
  const fim = (ok) => { dlg.close(); dlg.remove(); if (ok) { clearInterval(ui.intervalo); ui.descanso = null; ui.recordes = null; salvar((x) => concluirSessao(x, sessao.id, { agora: ctx.agora, esforco: esf })); } };
  const dlg = h("dialog", { class: "dialogo", onclose: () => { if (dlg.isConnected) dlg.remove(); } }, h("h2", null, t("treino.concluirTitulo")), h("p", null, t("treino.concluirTexto")), opc.elemento,
    h("div", { class: "botoes" }, h("button", { type: "button", class: "peq", onclick: () => fim(false) }, t("treino.voltar")), h("button", { type: "button", onclick: () => fim(true) }, t("treino.concluirOk"))));
  raiz.append(dlg);
  if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
}
