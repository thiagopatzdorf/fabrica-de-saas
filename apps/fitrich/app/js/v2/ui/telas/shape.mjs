// Tela Shape: tudo que a tela Shape do v1 fazia (peso com média de 7 dias, meta e projeção; treinos por
// semana vs meta; medidas e gordura pela fórmula da Marinha com texto neutro, IMC só como referência) mais os
// cruzamentos shape × finanças (academia ociosa, saúde como % da receita ao lado da taxa de poupança, custo
// por treino). `deliveryVsPeso` só se a pessoa ligar, e devolve números: nenhum comentário sobre corpo ou comida.
import { CATEGORIA_FITNESS_ID, TIPOS_TREINO, adicionar, definir, remover } from "../../esquema.mjs";
import { taxaPoupancaBp } from "../../lancamentos-soma.mjs";
import { academiaOciosa, custoPorTreino, deliveryVsPeso, saudeComoPercentualDaReceita, semanasNaMeta } from "../../shape-financas.mjs";
import { faixaImc, gorduraMarinha, imc, mediaMovel, projecaoMeta, tendencia, treinosPorSemana } from "../../../shape.mjs";
import { dia, mesDe } from "../../../datas.mjs";
import { graficoColunas, graficoLinha } from "../graficos-patrimonio.mjs";
import { alternador, aviso, campo, confirmar, estado, larguraGrafico, nota, numeroDeTexto, secao, selecionar, semanasGrade, stat, tabelaIrma, ultimos, vazio } from "./_comum.mjs";

export const CATEGORIA_DELIVERY_ID = "cat-delivery";
export const MEDIDAS = ["cinturaCm", "pescocoCm", "quadrilCm", "peitoCm", "bracoCm", "coxaCm"];

// ---------- lógica de apresentação pura (testada em Node) ----------
export const metaDe = (d, tipo) => d.metas.find((m) => m.tipo === tipo) ?? null;
export const categoriasFitness = (d) => d.categorias.filter((c) => c.id === CATEGORIA_FITNESS_ID && c.tipo === "despesa").map((c) => c.id);

// Mensalidade da academia: recorrências mensais ativas de despesa nas categorias fitness (o que se paga todo mês).
export function mensalidadeAcademia(d, ym) {
  const ids = new Set(categoriasFitness(d));
  return d.recorrencias.filter((r) => r.ativa && r.tipo === "despesa" && r.freq === "mensal" && ids.has(r.categoriaId) && (!r.fim || r.fim >= ym + "-01") && mesDe(r.inicio) <= ym).reduce((s, r) => s + r.centavos, 0);
}

// Resumo do peso como o v1 mostrava: último, média de 7 dias, ritmo (≥ 3 pesagens em ≥ 7 dias) e projeção.
export function resumoPeso(pesos, metaKg, hoje) {
  const ate = pesos.filter((p) => p.data <= hoje);
  if (!ate.length) return null;
  const mm = mediaMovel(ate, 7), ult = ate[ate.length - 1], ritmo = tendencia(ate, hoje);
  const media = mm[mm.length - 1].kg;
  return { ult, media, ritmo, mm, projecao: metaKg != null && ritmo ? projecaoMeta(media, metaKg, ritmo.kgPorSemana) : null };
}

// Até 60 pesagens para o gráfico, com 3 rótulos de data (início, meio, fim).
export function pontosDoGrafico(pesos, mm) {
  const ult60 = ultimos(pesos, 60);
  const marcas = ult60.length ? [...new Set([ult60[0], ult60[Math.floor(ult60.length / 2)], ult60[ult60.length - 1]])] : [];
  return { ult60, media: mm.filter((p) => ult60.some((q) => q.data === p.data)), marcas };
}

export const cruzamentos = (d, hoje) => {
  const ym = mesDe(hoje), fit = categoriasFitness(d), mensalidade = mensalidadeAcademia(d, ym);
  return {
    academia: academiaOciosa({ mensalidadeCentavos: mensalidade, treinos: d.treinos, hoje, planoAtivo: mensalidade > 0 }),
    custo: custoPorTreino({ lancamentos: d.lancamentos, recorrencias: d.recorrencias, treinos: d.treinos, ym, categoriaIdsFitness: fit }),
    saude: saudeComoPercentualDaReceita({ lancamentos: d.lancamentos, ym, categoriaIdsSaude: fit }),
    poupancaBp: taxaPoupancaBp(d.lancamentos, ym),
  };
};

// ---------- tela ----------
export const tela = {
  id: "shape", titulo: "shape.titulo", icone: "pulse", grupo: "principal", ordem: 20,
  css: ["/css/_telas.css", "/css/shape.css"], i18n: "/js/v2/ui/telas/shape.i18n.mjs",
  montar(ctx) {
    const { h, hs, t, fmt } = ctx;
    const raiz = h("div", { class: "tela-shape" });
    const ui = { msg: null, delivery: false, formPeso: false, formTreino: false, formMedida: false, formPerfil: false };
    const render = () => { ctx.limpar(raiz); raiz.append(...conteudo()); };
    const salvar = (fn) => ctx.mudar(fn).then(() => { ui.msg = null; }).catch((e) => { ui.msg = t("shape.erro", { codigo: (e?.erros ?? []).map((x) => x.codigo).join(", ") || String(e?.message ?? e) }); render(); });
    const kg = (v, c = 1) => `${fmt.numero(v, c)} kg`;
    const apagar = (colecao, id, rotulo) => h("button", { type: "button", class: "peq", "aria-label": rotulo, onclick: async () => { if (await confirmar(h, raiz, { titulo: rotulo, texto: null, ok: t("shape.apagar"), cancelar: t("shape.cancelar") })) salvar((d) => remover(d, colecao, id, { agora: ctx.agora })); } }, t("shape.apagar"));

    function conteudo() {
      const d = ctx.estado(), hoje = ctx.hoje();
      const partes = [];
      if (ui.msg) partes.push(aviso(h, ui.msg));
      partes.push(peso(d, hoje), treinos(d, hoje), medidas(d, hoje), financas(d, hoje));
      return partes;
    }

    // ---- peso ----
    function peso(d, hoje) {
      const meta = metaDe(d, "peso"), r = resumoPeso(d.pesos, meta?.alvo ?? null, hoje);
      const form = formPeso(hoje);
      const partes = [];
      if (r) {
        const im = imc(r.ult.kg, d.perfil.alturaCm);
        partes.push(h("div", { class: "grade" },
          stat(h, { rotulo: t("shape.ultimoPeso"), valor: kg(r.ult.kg), sub: fmt.data(r.ult.data) }),
          stat(h, { rotulo: t("shape.media7"), valor: kg(r.media), sub: t("shape.media7Sub") }),
          stat(h, { rotulo: t("shape.ritmo"), valor: r.ritmo ? `${r.ritmo.kgPorSemana > 0 ? "+" : ""}${fmt.numero(r.ritmo.kgPorSemana, 2)} kg/${t("shape.sem")}` : "—", sub: r.ritmo ? t("shape.pesagens", { n: r.ritmo.pontos }) : t("shape.ritmoPrecisa") }),
          stat(h, { rotulo: t("shape.meta"), valor: meta ? kg(meta.alvo) : "—", sub: meta ? (r.projecao === 0 ? t("shape.metaAtingida") : r.projecao ? t("shape.projecao", { n: r.projecao }) : t("shape.semProjecao")) : t("shape.defineMeta") })));
        const { ult60, media, marcas } = pontosDoGrafico(d.pesos.filter((p) => p.data <= hoje), r.mm);
        const svg = graficoLinha({ hs, largura: larguraGrafico(), titulo: t("shape.graficoPeso"), desc: t("shape.graficoPesoDesc", { n: ult60.length }), pontos: ult60.map((p) => ({ x: dia(p.data), y: p.kg, tip: `${fmt.data(p.data)}: ${kg(p.kg)}` })), media: media.map((p) => ({ x: dia(p.data), y: p.kg })), meta: meta?.alvo ?? null, rotuloMeta: t("shape.meta"), fmtY: (v) => fmt.numero(v, 1), xRotulos: marcas.map((p) => ({ x: dia(p.data), texto: fmt.dataCurta(p.data) })) });
        partes.push(h("div", { class: "graf" }, svg), nota(h, `${t("shape.notaPeso")} ${im ? t("shape.imc", { imc: fmt.numero(im, 1), faixa: t(`shape.imcFaixa.${faixaImc(im).replace(/ /g, "_")}`) }) : t("shape.semAltura")}`),
          tabelaIrma(h, { resumo: t("shape.verTabela"), cabecalho: [t("shape.data"), t("shape.pesoKg"), t("shape.media7Kg")], linhas: ult60.map((p) => [fmt.data(p.data), fmt.numero(p.kg, 1), fmt.numero(r.mm.find((q) => q.data === p.data).kg, 1)]) }));
      } else partes.push(ctx.estadoVazio({ icone: "peso", titulo: t("vazio.shape_peso.titulo"), texto: t("vazio.shape_peso.texto") }));
      partes.push(h("div", { class: "botoes" }, alternador(h, { texto: t("shape.registrarPeso"), alvo: form, aberto: ui.formPeso || !r })), form);
      if (d.pesos.length) partes.push(h("details", { class: "tab" }, h("summary", null, t("shape.pesagensRegistradas", { n: d.pesos.length })), h("ul", { class: "lista" }, ultimos(d.pesos, 30).reverse().map((p) => h("li", null, h("span", null, `${fmt.data(p.data)} · ${kg(p.kg)}`), apagar("pesos", p.id, t("shape.apagarPesagem", { data: fmt.data(p.data) })))))));
      return secao(h, t("shape.peso"), "sec-peso", partes);
    }
    function formPeso(hoje) {
      const data = campo(h, { rotulo: t("shape.data"), nome: "pdata", tipo: "date", valor: hoje, attrs: { required: true } });
      const v = campo(h, { rotulo: t("shape.pesoKg"), nome: "pkg", valor: "", attrs: { inputmode: "decimal", required: true, placeholder: "80,5" } });
      return h("form", { id: "form-peso", class: "form-crud", onsubmit: (e) => { e.preventDefault(); const n = numeroDeTexto(v.input.value); if (n == null || n < 20 || n > 500) { ui.msg = t("shape.pesoForaDaFaixa"); return render(); } ui.formPeso = false; salvar((d) => adicionar(d, "pesos", { data: data.input.value, kg: n }, { novoId: ctx.novoId, agora: ctx.agora })); } },
        data, v, h("div", { class: "botoes" }, h("button", { type: "submit" }, t("shape.salvarPeso"))));
    }

    // ---- treinos ----
    function treinos(d, hoje) {
      const meta = metaDe(d, "treino"), alvo = meta?.alvo ?? null;
      const semanas = treinosPorSemana(d.treinos, hoje, 8);
      const svg = graficoColunas({ hs, largura: larguraGrafico(), titulo: t("shape.graficoTreinos"), desc: t("shape.graficoTreinosDesc"), grupos: semanas.map((s) => ({ rotulo: fmt.dataCurta(s.inicio), valor: s.total, tip: t("shape.semanaDe", { data: fmt.data(s.inicio), n: s.total }) })), meta: alvo, rotuloMeta: alvo ? t("shape.metaN", { n: alvo }) : "", fmtY: (v) => fmt.numero(v) });
      const partes = [];
      if (alvo) { const s = semanasNaMeta({ treinos: d.treinos, hoje, metaTreinosSemana: alvo, n: 8 }); const atual = s.semanas[s.semanas.length - 1]; partes.push(h("div", { class: "grade" }, stat(h, { rotulo: t("shape.estaSemana"), valor: `${atual.total}/${alvo}`, sub: atual.naMeta ? t("shape.semanaNaMeta") : t("shape.semanaEmAndamento") }), stat(h, { rotulo: t("shape.ultimas8"), valor: t("shape.xDeN", { x: s.naMeta, n: s.de }), sub: t("shape.naMeta") })), semanasGrade(h, { semanas: s.semanas, rotulo: t("shape.semanasNaMeta", { x: s.naMeta, n: s.de }) })); }
      else partes.push(nota(h, t("shape.defineMetaTreino")));
      const form = formTreino(hoje);
      partes.push(h("div", { class: "graf" }, svg), tabelaIrma(h, { resumo: t("shape.verTabela"), cabecalho: [t("shape.semanaDeCol"), t("shape.treinos")], linhas: semanas.map((s) => [fmt.data(s.inicio), String(s.total)]) }),
        h("div", { class: "botoes" }, alternador(h, { texto: t("shape.registrarTreino"), alvo: form, aberto: ui.formTreino })), form);
      if (d.treinos.length) partes.push(h("details", { class: "tab" }, h("summary", null, t("shape.treinosRegistrados", { n: d.treinos.length })), h("ul", { class: "lista" }, ultimos(d.treinos, 30).reverse().map((x) => h("li", null, h("span", null, `${fmt.data(x.data)} · ${t(`shape.tipoTreino.${x.tipo}`)} · ${t("shape.minutos", { n: x.minutos })}${x.esforco ? ` · ${t("shape.esforcoN", { n: x.esforco })}` : ""}`), apagar("treinos", x.id, t("shape.apagarTreino", { data: fmt.data(x.data) })))))));
      return secao(h, t("shape.treinos"), "sec-treinos", partes);
    }
    function formTreino(hoje) {
      const data = campo(h, { rotulo: t("shape.data"), nome: "tdata", tipo: "date", valor: hoje, attrs: { required: true } });
      const tipo = selecionar(h, { rotulo: t("shape.tipo"), nome: "ttipo", valor: TIPOS_TREINO[0], opcoes: TIPOS_TREINO.map((v) => ({ valor: v, texto: t(`shape.tipoTreino.${v}`) })) });
      const min = campo(h, { rotulo: t("shape.minutosCampo"), nome: "tmin", valor: "45", attrs: { inputmode: "numeric", required: true } });
      const esf = selecionar(h, { rotulo: t("shape.esforco"), nome: "tesf", valor: "3", opcoes: [1, 2, 3, 4, 5].map((n) => ({ valor: String(n), texto: t(`shape.esforcoNivel.${n}`) })) });
      return h("form", { id: "form-treino", class: "form-crud", onsubmit: (e) => { e.preventDefault(); const m = Number(min.input.value); if (!Number.isInteger(m) || m < 1) { ui.msg = t("shape.valorInvalido"); return render(); } ui.formTreino = false; salvar((d) => adicionar(d, "treinos", { data: data.input.value, tipo: tipo.input.value, minutos: m, esforco: Number(esf.input.value) }, { novoId: ctx.novoId, agora: ctx.agora })); } },
        data, tipo, min, esf, h("div", { class: "botoes" }, h("button", { type: "submit" }, t("shape.salvarTreino"))));
    }

    // ---- medidas ----
    function medidas(d, hoje) {
      const m = ultimos(d.medidas.filter((x) => x.data <= hoje), 1)[0] ?? null;
      const gord = m ? gorduraMarinha({ sexo: d.perfil.sexo, alturaCm: d.perfil.alturaCm, ...m }) : null;
      const faltaPerfil = !d.perfil.sexo || !d.perfil.alturaCm;
      const partes = [];
      if (m) partes.push(h("div", { class: "grade" }, stat(h, { rotulo: t("shape.gordura"), valor: gord != null ? fmt.percentualBp(Math.round(gord * 100)) : "—", sub: gord != null ? t("shape.gorduraSub") : faltaPerfil ? t("shape.gorduraPrecisaPerfil") : t("shape.gorduraPrecisaMedidas", { extra: d.perfil.sexo === "f" ? t("shape.eQuadril") : "" }) }), ...(m.cinturaCm ? [stat(h, { rotulo: t("shape.cintura"), valor: `${fmt.numero(m.cinturaCm, 1)} cm`, sub: fmt.data(m.data) })] : [])));
      else partes.push(vazio(h, t("shape.semMedidas")));
      if (gord != null) partes.push(nota(h, t("shape.gorduraNeutra")));
      const form = formMedida(hoje), perfil = formPerfil(d);
      partes.push(h("div", { class: "botoes" }, alternador(h, { texto: t("shape.novaMedicao"), alvo: form, aberto: ui.formMedida }), alternador(h, { texto: t("shape.perfilEstimativas"), alvo: perfil, aberto: ui.formPerfil || (faltaPerfil && Boolean(m)) })), form, perfil);
      if (d.medidas.length) partes.push(h("details", { class: "tab" }, h("summary", null, t("shape.medidasRegistradas", { n: d.medidas.length })), h("ul", { class: "lista" }, ultimos(d.medidas, 30).reverse().map((x) => h("li", null, h("span", null, `${fmt.data(x.data)} · ${MEDIDAS.filter((k) => x[k] != null).map((k) => `${t(`shape.medida.${k}`)} ${fmt.numero(x[k], 1)}`).join(" · ")}`), apagar("medidas", x.id, t("shape.apagarMedida", { data: fmt.data(x.data) })))))));
      return secao(h, t("shape.medidas"), "sec-medidas", partes);
    }
    function formMedida(hoje) {
      const data = campo(h, { rotulo: t("shape.data"), nome: "mdata", tipo: "date", valor: hoje, attrs: { required: true } });
      const cs = MEDIDAS.map((k) => campo(h, { rotulo: `${t(`shape.medida.${k}`)} (cm)`, nome: `m-${k}`, valor: "", attrs: { inputmode: "decimal" } }));
      return h("form", { id: "form-medida", class: "form-crud", onsubmit: (e) => { e.preventDefault(); const item = { data: data.input.value }; MEDIDAS.forEach((k, i) => { const n = numeroDeTexto(cs[i].input.value); if (n != null) item[k] = n; }); if (Object.keys(item).length < 2) { ui.msg = t("shape.umaMedida"); return render(); } ui.formMedida = false; salvar((d) => adicionar(d, "medidas", item, { novoId: ctx.novoId, agora: ctx.agora })); } },
        h("h3", null, t("shape.novaMedicao")), data, cs, h("div", { class: "botoes" }, h("button", { type: "submit" }, t("shape.salvarMedidas"))));
    }
    // Sexo e altura só servem às estimativas (gordura, IMC); vivem no perfil e podem ficar em branco.
    function formPerfil(d) {
      const sexo = selecionar(h, { rotulo: t("shape.sexo"), nome: "psexo", valor: d.perfil.sexo, opcoes: [{ valor: "", texto: t("shape.sexoNao") }, { valor: "m", texto: t("shape.sexoM") }, { valor: "f", texto: t("shape.sexoF") }] });
      const alt = campo(h, { rotulo: t("shape.altura"), nome: "palt", valor: d.perfil.alturaCm ?? "", attrs: { inputmode: "decimal" } });
      return h("form", { id: "form-perfil", class: "form-crud", onsubmit: (e) => { e.preventDefault(); const a = alt.input.value.trim() ? numeroDeTexto(alt.input.value) : null; if (alt.input.value.trim() && a == null) { ui.msg = t("shape.valorInvalido"); return render(); } ui.formPerfil = false; salvar((x) => definir(x, "perfil", { sexo: sexo.input.value, alturaCm: a }, { agora: ctx.agora })); } },
        h("h3", null, t("shape.perfilEstimativas")), sexo, alt, nota(h, t("shape.perfilNota")), h("div", { class: "botoes" }, h("button", { type: "submit" }, t("shape.salvar"))));
    }

    // ---- shape × finanças ----
    function financas(d, hoje) {
      const c = cruzamentos(d, hoje), ym = mesDe(hoje);
      const partes = [h("div", { class: "grade" },
        stat(h, { rotulo: t("shape.custoPorTreino"), valor: c.custo.custoPorTreinoCentavos != null ? fmt.moeda(c.custo.custoPorTreinoCentavos) : "—", sub: c.custo.custoPorTreinoCentavos != null ? t("shape.custoSub", { gasto: fmt.moeda(c.custo.gastoCentavos), n: c.custo.treinos }) : t("shape.custoPrecisa") }),
        stat(h, { rotulo: t("shape.saudePct"), valor: c.saude.bp != null ? fmt.percentualBp(c.saude.bp) : "—", sub: c.saude.bp != null ? t("shape.saudeSub", { gasto: fmt.moeda(c.saude.gastoCentavos) }) : t("shape.semReceita") }),
        stat(h, { rotulo: t("shape.poupancaPct"), valor: c.poupancaBp != null ? fmt.percentualBp(c.poupancaBp) : "—", sub: c.poupancaBp != null ? t("shape.poupancaSub", { mes: fmt.mes(ym) }) : t("shape.semReceita") }))];
      if (c.academia.alertas.length) partes.push(h("ul", { class: "alertas" }, c.academia.alertas.map((a) => h("li", null, estado(h, { codigo: "info", texto: t(`shape.alerta.${a}`, { dias: c.academia.diasSemTreino ?? 0, custo: c.academia.custoPorTreinoCentavos != null ? fmt.moeda(c.academia.custoPorTreinoCentavos) : "—" }) })))));
      else if (mensalidadeAcademia(d, ym) > 0) partes.push(estado(h, { codigo: "ok", texto: t("shape.academiaEmDia", { n: c.academia.treinosNoMes }) }));
      else partes.push(nota(h, t("shape.semMensalidade")));
      // Delivery × peso: opt-in, números só, sem causalidade.
      const botao = h("button", { type: "button", class: "peq", "aria-pressed": String(ui.delivery), onclick: () => { ui.delivery = !ui.delivery; render(); raiz.querySelector(".sec-fin [aria-pressed]")?.focus(); } }, ui.delivery ? t("shape.deliveryDesligar") : t("shape.deliveryLigar"));
      partes.push(h("h3", null, t("shape.delivery")), nota(h, t("shape.deliveryComo")), h("div", { class: "botoes" }, botao));
      if (ui.delivery) {
        const r = deliveryVsPeso({ lancamentos: d.lancamentos, pesos: d.pesos, categoriaIdsDelivery: [CATEGORIA_DELIVERY_ID], ymFinal: ym });
        partes.push(tabelaIrma(h, { aberta: true, resumo: t("shape.deliveryTabela", { n: r.serie.length }), cabecalho: [t("shape.mes"), t("shape.deliveryCol"), t("shape.pesoMedio"), t("shape.pesagensCol")], linhas: r.serie.map((m) => [fmt.mes(m.ym), fmt.moeda(m.deliveryCentavos), m.pesoMedioKg != null ? kg(m.pesoMedioKg, 2) : "—", String(m.pesagens)]) }),
          nota(h, r.correlacao == null ? t("shape.correlacaoSemDado", { n: r.mesesComDado }) : t("shape.correlacao", { r: fmt.numero(r.correlacao, 2), n: r.mesesComDado })));
      }
      return secao(h, t("shape.financas"), "sec-fin", partes);
    }

    render();
    return { elemento: raiz, atualizar: render };
  },
};
