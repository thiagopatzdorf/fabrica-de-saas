// Tela Nutrição: registro rápido de refeição (recentes, favoritos, "repetir ontem", porção ou gramas), macros do
// dia contra a meta, metas pelo meio-termo (Mifflin-St Jeor, limites seguros, proteína em g/kg), adaptação pela
// tendência real de peso a cada 2 semanas, visão semanal ("X das últimas 8 semanas") e o cruzamento OPCIONAL com
// Finanças. Regra de cálculo vem de nutricao/*.mjs; aqui só se agrupa e se apresenta. Tom: sem culpa, sem
// sequência, sem comentar o corpo. É acompanhamento pessoal, não aconselhamento médico.
import { adicionar, definir, remover, resumoMes } from "../../esquema.mjs";
import { criarBase, gramasDaPorcao, nutrientes } from "../../nutricao/alimentos.mjs";
import * as diario from "../../nutricao/diario.mjs";
import { ATIVIDADES, RITMO, idadeEm, metaNutricional } from "../../nutricao/energia.mjs";
import { sugerirAjuste, tendenciaPeso } from "../../nutricao/tendencia.mjs";
import { somarDias, mesDe } from "../../../datas.mjs";
import { graficoColunas } from "../graficos-patrimonio.mjs";
import { alternador, aviso, barra, campo, estado, larguraGrafico, nota, numeroDeTexto, secao, selecionar, semanasGrade, stat, tabelaIrma, vazio } from "./_comum.mjs";

const ABAS = ["hoje", "semana", "metas", "dinheiro"];
const MEDIDAS = ["g", "colher_sopa", "colher_cha", "colher_servir", "concha", "escumadeira", "unidade", "fatia", "copo", "xicara", "xicara_cafe", "pote", "lata", "file", "bife", "folha", "punhado", "porcao", "prato"];
const AGUA_PASSOS = [200, 300, 500];

// ---------- lógica de apresentação pura (testada em Node) ----------
export const pesoDe = (d) => { const s = tendenciaPeso(d.pesos ?? []); return s.length ? { kg: s[s.length - 1].tendencia, serie: s } : { kg: null, serie: s }; };

// Dados que faltam para a meta (códigos, a tela traduz). Lista vazia = dá para calcular.
export function faltasParaMeta(d, hoje) {
  const nut = d.perfil.nutricao ?? {}, f = [];
  if (!d.pesos?.length) f.push("peso");
  if (!d.perfil.alturaCm) f.push("altura");
  if (!idadeEm(d.perfil.nascimento, hoje)) f.push("nascimento");
  if (!nut.atividade) f.push("atividade");
  return f;
}

export function calcularMeta(d, hoje) {
  if (faltasParaMeta(d, hoje).length) return null;
  const nut = d.perfil.nutricao ?? {}, { kg } = pesoDe(d);
  const m = metaNutricional({ sexo: d.perfil.sexo, kg, cm: d.perfil.alturaCm, idade: idadeEm(d.perfil.nascimento, hoje), atividade: nut.atividade, objetivo: nut.objetivo ?? "manter", ritmoPct: nut.ritmoPct ?? null, ajusteKcal: nut.ajusteKcal ?? 0, treinaForca: !!nut.treinaForca, proteinaGKg: nut.proteinaGKg ?? null });
  return m.ok ? { ...m, kg, alvo: { kcal: m.alvoKcal, p: m.proteina.alvoG, c: m.carbo.g, g: m.gordura.g, fibra: m.fibraG, aguaMl: nut.aguaMl ?? m.aguaMl } } : { ...m, kg };
}

// Gramas de uma escolha (medida + quantidade) para um alimento.
export const gramasDaEscolha = (alimento, medida, qtd) => (medida === "g" ? qtd : gramasDaPorcao(alimento, medida, qtd));

// Escolha inicial em 1 toque: a última quantidade usada, senão 1 da primeira medida caseira, senão 100 g.
export function escolhaInicial(alimento, ultimo) {
  if (ultimo) return { medida: "g", qtd: ultimo.gramas };
  return alimento.porcoes.length ? { medida: alimento.porcoes[0].chave, qtd: 1 } : { medida: "g", qtd: 100 };
}

// "Estado" de um macro contra a meta: nunca só cor (a tela põe ícone + texto). Faixa de ±10% = no meio-termo.
export function situacao(valor, meta) {
  if (!meta) return "sem_meta";
  if (valor < meta * 0.9) return "abaixo";
  return valor <= meta * 1.1 ? "dentro" : "acima";
}

// ---------- tela ----------
export const tela = {
  id: "nutricao", titulo: "tela.nutricao", icone: "nutricao", grupo: "mais", ordem: 75,
  css: ["/css/_telas.css", "/css/nutricao.css"], i18n: "/js/v2/ui/telas/nutricao.i18n.mjs",
  montar(ctx) {
    const { h, hs, t, fmt } = ctx;
    const raiz = h("div", { class: "tela-nutricao" });
    const ui = { aba: "hoje", q: "", sel: null, msg: null, desfazer: null, formMetas: false, formProprio: false };
    let base = null;
    import("../../nutricao/base-alimentos.mjs").then((m) => { base = criarBase(m); render(); }).catch(() => { ui.msg = t("nutricao.baseErro"); render(); });
    const render = () => { ctx.limpar(raiz); raiz.append(...conteudo()); };
    const agoraLocal = () => new Date(ctx.agora());
    const salvar = (fn, { desfazivel = true } = {}) => {
      const antes = ctx.estado();
      ui.desfazer = desfazivel ? antes : null;
      return ctx.mudar(fn).then(() => { ui.msg = null; }).catch((e) => { ui.desfazer = null; ui.msg = t("nutricao.erro", { codigo: (e?.erros ?? []).map((x) => x.codigo).join(", ") || String(e?.message ?? e) }); render(); });
    };
    const kcal = (v) => `${fmt.numero(Math.round(v))} kcal`;
    const gr = (v, c = 0) => `${fmt.numero(v, c)} g`;
    const nomeMedida = (chave) => (chave === "g" ? t("nutricao.medida.g") : t(`nutricao.medida.${chave}`));
    const nomeRefeicao = (r) => t(`nutricao.refeicao.${r}`);
    const adicionarRegistros = (regs) => salvar((d) => regs.reduce((acc, r) => adicionar(acc, "refeicoes", r, { novoId: ctx.novoId, agora: ctx.agora }), d));

    function conteudo() {
      const partes = [];
      if (ui.msg) partes.push(aviso(h, ui.msg));
      if (ui.desfazer) partes.push(h("p", { class: "desfazer", role: "status" }, t("nutricao.registrado"), " ", h("button", { type: "button", class: "peq", onclick: () => { const antes = ui.desfazer; ui.desfazer = null; ctx.mudar(() => antes); } }, t("nutricao.desfazer"))));
      partes.push(h("div", { class: "segmentos", role: "group", "aria-label": t("nutricao.visoes") }, ABAS.map((a) => h("button", { type: "button", class: "peq", "aria-pressed": String(ui.aba === a), onclick: () => { ui.aba = a; ui.desfazer = null; render(); } }, t(`nutricao.aba.${a}`)))));
      const d = ctx.estado(), hoje = ctx.hoje(), meta = calcularMeta(d, hoje);
      partes.push(...(ui.aba === "hoje" ? abaHoje(d, hoje, meta) : ui.aba === "semana" ? abaSemana(d, hoje, meta) : ui.aba === "metas" ? abaMetas(d, hoje, meta) : abaDinheiro(d, hoje)));
      partes.push(nota(h, t("nutricao.aviso")));
      return partes;
    }

    // ================= HOJE =================
    function abaHoje(d, hoje, meta) {
      const refs = d.refeicoes ?? [], soma = diario.somaDoDia(refs, hoje);
      return [resumoDia(soma, meta, d), registrar(d, hoje, meta), aguaCartao(soma, meta, hoje), listaDoDia(refs, hoje)];
    }

    function linhaMacro(rotulo, valor, alvo, unidade) {
      const s = situacao(valor, alvo), pct = alvo ? valor / alvo : 0;
      const texto = !alvo ? "" : valor > alvo ? t("nutricao.acima", { n: fmt.numero(Math.round(valor - alvo)), u: unidade }) : t("nutricao.faltam", { n: fmt.numero(Math.round(alvo - valor)), u: unidade });
      return h("li", { class: "macro" }, h("div", { class: "macro-topo" }, h("span", null, rotulo), h("b", null, `${fmt.numero(Math.round(valor))}${alvo ? ` / ${fmt.numero(Math.round(alvo))}` : ""} ${unidade}`)),
        barra(h, { fracao: Math.min(1, pct), rotulo: `${rotulo}: ${fmt.numero(Math.round(valor))}${alvo ? ` / ${fmt.numero(Math.round(alvo))}` : ""} ${unidade}` }),
        alvo ? estado(h, { codigo: s === "dentro" ? "ok" : s === "abaixo" ? "info" : "atencao", texto: `${t(`nutricao.sit.${s}`)} · ${texto}` }) : null);
    }

    function resumoDia(soma, meta, d) {
      const alvo = meta?.ok ? meta.alvo : null;
      const topo = h("div", { class: "heroi" }, h("span", { class: "rot" }, t("nutricao.hoje")),
        h("b", { class: "gran" }, alvo ? fmt.numero(Math.abs(alvo.kcal - soma.kcal)) : fmt.numero(soma.kcal)),
        h("p", { class: "leg" }, alvo ? (soma.kcal <= alvo.kcal ? t("nutricao.restam") : t("nutricao.acimaMeta")) : t("nutricao.somaDia")),
        alvo ? null : h("div", { class: "botoes" }, h("button", { type: "button", onclick: () => { ui.aba = "metas"; ui.formMetas = true; render(); } }, t("nutricao.definirMetas"))));
      const lista = h("ul", { class: "macros" }, linhaMacro(t("nutricao.proteina"), soma.p, alvo?.p, "g"), linhaMacro(t("nutricao.carbo"), soma.c, alvo?.c, "g"), linhaMacro(t("nutricao.gordura"), soma.g, alvo?.g, "g"), linhaMacro(t("nutricao.fibra"), soma.fibra, alvo?.fibra, "g"));
      return secao(h, t("nutricao.macrosDoDia"), "sec-dia", topo, lista, alvo ? nota(h, t("nutricao.faixaNota")) : null);
    }

    // ---- registrar: recentes, favoritos, repetir ontem, busca, quantidade ----
    function registrar(d, hoje, meta) {
      const refs = d.refeicoes ?? [], nut = d.perfil.nutricao ?? {};
      const ontem = somarDias(hoje, -1), temOntem = refs.some((r) => r.data === ontem && r.refeicao !== diario.AGUA);
      const saida = h("div", { class: "resultados" });
      const entrada = h("input", { type: "search", id: "nut-busca", autocomplete: "off", spellcheck: "false", placeholder: t("nutricao.buscaExemplo"), value: ui.q, oninput: () => { ui.q = entrada.value; desenharResultados(); } });
      const painel = h("div", { class: "quantidade", hidden: !ui.sel });
      const chips = [];
      const alimentoDoRegistro = (r) => { const a = /^\d+$/.test(r.alimentoId) && base ? base.obter(Number(r.alimentoId)) : null; return a ?? diario.alimentoDoRegistro(r); };
      const escolher = (alimento, ultimo = null) => { ui.sel = { alimento, ...escolhaInicial(alimento, ultimo), refeicao: diario.refeicaoPorHora(agoraLocal().getHours()) }; render(); raiz.querySelector("#nut-qtd")?.focus(); };
      if (temOntem) chips.push(h("button", { type: "button", class: "peq chip-acao", onclick: () => adicionarRegistros(diario.repetirDia(refs, ontem, hoje, { novoId: ctx.novoId, agora: ctx.agora })) }, t("nutricao.repetirOntem")));
      const favs = diario.favoritos(refs, hoje, nut.favoritos ?? [], 6), recs = diario.recentes(refs, 6).filter((r) => !favs.some((f) => f.alimentoId === r.alimentoId));
      const chipDe = (r, estrela) => h("button", { type: "button", class: "peq chip", onclick: () => escolher(alimentoDoRegistro(r), r) }, estrela ? h("span", { "aria-hidden": "true" }, "★ ") : null, r.nome);
      function desenharResultados() {
        ctx.limpar(saida);
        if (!base) return void saida.append(nota(h, t("nutricao.carregandoBase")));
        const achados = base.buscar(ui.q, ui.q.trim() ? 10 : 8);
        saida.append(h("p", { class: "rot-peq" }, ui.q.trim() ? t("nutricao.resultados", { n: achados.length }) : t("nutricao.populares")));
        if (!achados.length) return void saida.append(vazio(h, t("nutricao.semResultado")));
        saida.append(h("ul", { class: "lista achados" }, achados.map((a) => h("li", null, h("button", { type: "button", class: "peq achado", onclick: () => escolher(a, refs.find((r) => r.alimentoId === String(a.id)) ?? null) }, h("span", { class: "item" }, h("span", null, a.nome), h("small", null, t("nutricao.por100", { kcal: a.kcal, p: fmt.numero(a.p, 1) }))))))));
      }
      if (ui.sel) painel.append(...painelQuantidade(d, hoje));
      const proprio = formProprio(hoje);
      const corpo = [h("label", { class: "campo" }, h("span", { class: "campo-rot" }, t("nutricao.buscar")), entrada),
        chips.length || favs.length || recs.length ? h("div", { class: "chips-linha", role: "group", "aria-label": t("nutricao.atalhos") }, chips, favs.map((r) => chipDe(r, true)), recs.map((r) => chipDe(r, false))) : null,
        painel, saida, h("div", { class: "botoes" }, alternador(h, { texto: t("nutricao.semBusca"), alvo: proprio, aberto: ui.formProprio })), proprio];
      desenharResultados();
      return secao(h, t("nutricao.registrar"), "sec-registrar", corpo);
    }

    function painelQuantidade(d, hoje) {
      const s = ui.sel, a = s.alimento, favoritos = (d.perfil.nutricao ?? {}).favoritos ?? [];
      const ehFav = favoritos.includes(String(a.id));
      const previa = h("p", { class: "previa", role: "status", "aria-live": "polite" });
      const medidas = [{ valor: "g", texto: t("nutricao.medida.g") }, ...a.porcoes.map((p) => ({ valor: p.chave, texto: `${t(`nutricao.medida.${p.chave}`)} (${fmt.numero(p.g)} g)` }))];
      const sel = selecionar(h, { rotulo: t("nutricao.medida"), nome: "nmedida", valor: s.medida, opcoes: medidas });
      // `attrs.id` vence o id gerado, e o `for` do rótulo lê o id do input, então o foco por #nut-qtd e o rótulo concordam.
      const qtd = campo(h, { rotulo: t("nutricao.quantidade"), nome: "nqtd", valor: String(s.qtd).replace(".", ctx.idioma() === "en" ? "." : ","), attrs: { inputmode: "decimal", id: "nut-qtd" } });
      const ref = selecionar(h, { rotulo: t("nutricao.refeicaoDe"), nome: "nref", valor: s.refeicao, opcoes: diario.REFEICOES.map((r) => ({ valor: r, texto: nomeRefeicao(r) })) });
      const atual = () => { const q = numeroDeTexto(qtd.input.value), g = q > 0 ? gramasDaEscolha(a, sel.input.value, q) : null; return g && g >= 0.1 && g <= 20000 ? g : null; };
      const atualizar = () => { s.medida = sel.input.value; const g = atual(); previa.textContent = g ? (() => { const n = nutrientes(a, g); return t("nutricao.previa", { g: fmt.numero(g, g % 1 ? 1 : 0), kcal: n.kcal, p: fmt.numero(n.p, 1), c: fmt.numero(n.c, 1), gord: fmt.numero(n.g, 1) }); })() : t("nutricao.quantidadeInvalida"); };
      sel.input.addEventListener("change", () => { if (sel.input.value !== "g" && s.medida === "g") qtd.input.value = fmt.numero(1, 0); atualizar(); });
      qtd.input.addEventListener("input", atualizar);
      atualizar();
      const adicionarBtn = h("button", { type: "button", class: "salvar-nut", onclick: () => { const g = atual(); if (!g) return atualizar(); const reg = diario.novoRegistro({ alimento: a, gramas: g, data: hoje, refeicao: ref.input.value, id: ctx.novoId(), agora: ctx.agora }); ui.sel = null; ui.q = ""; adicionarRegistros([reg]); } }, t("nutricao.adicionar"));
      return [h("h3", null, a.nome), a.origem === 1 ? nota(h, t("nutricao.origemRef")) : null, h("div", { class: "grade-form" }, qtd, sel, ref), previa,
        h("div", { class: "botoes" }, adicionarBtn,
          h("button", { type: "button", class: "peq", "aria-pressed": String(ehFav), onclick: () => salvar((x) => definir(x, "perfil", { nutricao: { ...(x.perfil.nutricao ?? {}), favoritos: ehFav ? favoritos.filter((f) => f !== String(a.id)) : [...favoritos, String(a.id)].slice(-60) } }, { agora: ctx.agora }), { desfazivel: false }) }, ehFav ? t("nutricao.desfavoritar") : t("nutricao.favoritar")),
          h("button", { type: "button", class: "peq", onclick: () => { ui.sel = null; render(); } }, t("nutricao.cancelar")))];
    }

    // Alimento próprio: nome + calorias (e macros se souber). Cria um registro sem tabela por trás.
    function formProprio(hoje) {
      const nome = campo(h, { rotulo: t("nutricao.nome"), nome: "pnome", attrs: { maxlength: "120", required: true } });
      const k = campo(h, { rotulo: t("nutricao.caloriasTotais"), nome: "pkcal", attrs: { inputmode: "numeric", required: true } });
      const p = campo(h, { rotulo: `${t("nutricao.proteina")} (g)`, nome: "pp", attrs: { inputmode: "decimal" } }), c = campo(h, { rotulo: `${t("nutricao.carbo")} (g)`, nome: "pc", attrs: { inputmode: "decimal" } }), g = campo(h, { rotulo: `${t("nutricao.gordura")} (g)`, nome: "pg", attrs: { inputmode: "decimal" } });
      const ref = selecionar(h, { rotulo: t("nutricao.refeicaoDe"), nome: "pref", valor: diario.refeicaoPorHora(agoraLocal().getHours()), opcoes: diario.REFEICOES.map((r) => ({ valor: r, texto: nomeRefeicao(r) })) });
      return h("form", { id: "form-proprio", class: "form-crud", onsubmit: (e) => {
        e.preventDefault();
        const kc = numeroDeTexto(k.input.value), n = (x) => (x.input.value.trim() ? numeroDeTexto(x.input.value) : 0);
        if (!nome.input.value.trim() || kc == null || kc < 0 || kc > 20000 || [p, c, g].some((x) => n(x) == null || n(x) < 0)) { ui.msg = t("nutricao.valorInvalido"); return render(); }
        const slug = nome.input.value.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 60);
        ui.formProprio = false;
        adicionarRegistros([{ id: ctx.novoId(), data: hoje, refeicao: ref.input.value, alimentoId: `u-${slug}`, nome: nome.input.value.trim(), gramas: 100, kcal: Math.round(kc), p: n(p), c: n(c), g: n(g), fibra: 0, atualizadoEm: ctx.agora() }]);
      } }, nome, k, p, c, g, ref, h("div", { class: "botoes" }, h("button", { type: "submit" }, t("nutricao.adicionar"))));
    }

    function aguaCartao(soma, meta, hoje) {
      const alvo = meta?.ok ? meta.alvo.aguaMl : null;
      const botoes = AGUA_PASSOS.map((ml) => h("button", { type: "button", class: "peq", onclick: () => adicionarRegistros([diario.novoRegistroAgua({ ml, data: hoje, id: ctx.novoId(), agora: ctx.agora })]) }, `+ ${fmt.numero(ml)} ml`));
      return secao(h, t("nutricao.agua"), "sec-agua", h("p", { class: "leg" }, alvo ? t("nutricao.aguaTexto", { n: fmt.numero(soma.aguaMl), alvo: fmt.numero(alvo) }) : t("nutricao.aguaSoma", { n: fmt.numero(soma.aguaMl) })), alvo ? barra(h, { fracao: Math.min(1, soma.aguaMl / alvo), rotulo: t("nutricao.agua") }) : null, h("div", { class: "botoes" }, botoes), nota(h, t("nutricao.aguaNota")));
    }

    function listaDoDia(refs, hoje) {
      const hojeRegs = refs.filter((r) => r.data === hoje);
      if (!hojeRegs.length) return secao(h, t("nutricao.doDia"), "sec-lista", vazio(h, t("nutricao.diaVazio")));
      const blocos = [...diario.REFEICOES, diario.AGUA].map((tipo) => {
        const itens = hojeRegs.filter((r) => r.refeicao === tipo);
        if (!itens.length) return null;
        const total = itens.reduce((s, r) => s + r.kcal, 0);
        return h("div", { class: "bloco" }, h("h3", null, nomeRefeicao(tipo), tipo === diario.AGUA ? null : h("small", null, ` · ${kcal(total)}`)),
          h("ul", { class: "lista" }, itens.map((r) => h("li", null,
            h("span", { class: "item" }, h("span", null, tipo === diario.AGUA ? t("nutricao.agua") : r.nome), h("small", null, tipo === diario.AGUA ? `${fmt.numero(r.gramas)} ml` : `${fmt.numero(r.gramas, r.gramas % 1 ? 1 : 0)} g · P ${fmt.numero(r.p, 1)} · C ${fmt.numero(r.c, 1)} · G ${fmt.numero(r.g, 1)}`)),
            h("span", { class: "valor" }, tipo === diario.AGUA ? "" : kcal(r.kcal)),
            h("span", { class: "acoes" }, h("button", { type: "button", class: "peq", "aria-label": t("nutricao.remover", { nome: tipo === diario.AGUA ? t("nutricao.agua") : r.nome }), onclick: () => salvar((x) => remover(x, "refeicoes", r.id)) }, t("nutricao.removerCurto")))))));
      });
      return secao(h, t("nutricao.doDia"), "sec-lista", blocos);
    }

    // ================= SEMANA =================
    function abaSemana(d, hoje, meta) {
      const refs = d.refeicoes ?? [], alvoK = meta?.ok ? meta.alvo.kcal : 0, sems = diario.semanas(refs, hoje, alvoK, 8), atual = sems[sems.length - 1];
      const partes = [];
      const grupos = atual.dias.map((x) => ({ rotulo: fmt.diaDaSemana(x.data), valor: x.kcal, tip: `${fmt.dataCurta(x.data)}: ${kcal(x.kcal)}` }));
      const svg = graficoColunas({ hs, largura: larguraGrafico(), grupos, meta: alvoK || null, rotuloMeta: alvoK ? t("nutricao.meta") : "", titulo: t("nutricao.graficoSemana"), desc: t("nutricao.graficoSemanaDesc") });
      const completas = sems.filter((s) => s.completa), naFaixa = completas.filter((s) => s.naFaixa).length;
      partes.push(secao(h, t("nutricao.estaSemana"), "sec-semana",
        h("div", { class: "grade" }, stat(h, { rotulo: t("nutricao.mediaKcal"), valor: atual.diasRegistrados ? kcal(atual.mediaKcal) : "—", sub: t("nutricao.diasRegistrados", { n: atual.diasRegistrados }) }),
          stat(h, { rotulo: t("nutricao.proteina"), valor: atual.diasRegistrados ? gr(atual.mediaP) : "—", sub: t("nutricao.mediaDia") }), stat(h, { rotulo: t("nutricao.carbo"), valor: atual.diasRegistrados ? gr(atual.mediaC) : "—", sub: t("nutricao.mediaDia") }), stat(h, { rotulo: t("nutricao.gordura"), valor: atual.diasRegistrados ? gr(atual.mediaG) : "—", sub: t("nutricao.mediaDia") })),
        h("div", { class: "graf" }, svg),
        tabelaIrma(h, { resumo: t("nutricao.verTabela"), cabecalho: [t("nutricao.dia"), t("nutricao.kcal"), t("nutricao.proteina"), t("nutricao.carbo"), t("nutricao.gordura")], linhas: atual.dias.map((x) => [fmt.data(x.data), String(x.kcal), fmt.numero(x.p, 1), fmt.numero(x.c, 1), fmt.numero(x.g, 1)]) })));
      partes.push(secao(h, t("nutricao.consistencia"), "sec-consistencia",
        alvoK ? h("p", { class: "gran-peq" }, t("nutricao.naFaixa", { x: naFaixa, n: completas.length })) : vazio(h, t("nutricao.semMetaConsistencia")),
        alvoK ? semanasGrade(h, { semanas: sems.map((s) => ({ inicio: s.inicio, naMeta: s.naFaixa })), rotulo: t("nutricao.naFaixa", { x: naFaixa, n: completas.length }) }) : null,
        nota(h, t("nutricao.faixaDef")),
        tabelaIrma(h, { resumo: t("nutricao.verTabela"), cabecalho: [t("nutricao.semanaDe"), t("nutricao.diasCol"), t("nutricao.kcal"), t("nutricao.proteina"), t("nutricao.situacao")], linhas: sems.map((s) => [fmt.data(s.inicio), String(s.diasRegistrados), s.diasRegistrados ? String(s.mediaKcal) : "—", s.diasRegistrados ? fmt.numero(s.mediaP, 1) : "—", s.naFaixa ? t("nutricao.sit.naFaixa") : t("nutricao.sit.fora")]) })));
      return partes;
    }

    // ================= METAS =================
    function abaMetas(d, hoje, meta) {
      const faltas = faltasParaMeta(d, hoje), nut = d.perfil.nutricao ?? {};
      const partes = [];
      if (meta?.ok) partes.push(resultadoMeta(meta, d));
      else if (meta && !meta.ok) partes.push(aviso(h, t(`nutricao.erroMeta.${meta.codigo.split(".")[1]}`)));
      else partes.push(aviso(h, t("nutricao.faltam_dados", { lista: faltas.map((f) => t(`nutricao.falta.${f}`)).join(", ") })));
      const form = formMetas(d);
      partes.push(secao(h, t("nutricao.seusDados"), "sec-dados", h("div", { class: "botoes" }, alternador(h, { texto: t("nutricao.editarDados"), alvo: form, aberto: ui.formMetas || faltas.length > 0 })), form));
      if (meta?.ok) partes.push(tendenciaCartao(d, hoje, meta, nut));
      partes.push(h("details", { class: "formula" }, h("summary", null, t("nutricao.comoCalcula")), h("div", { class: "formula-corpo" }, ["tmb", "get", "ritmo", "piso", "proteina", "gordura", "fibra", "agua", "tendencia"].map((k) => h("p", null, h("b", null, `${t(`nutricao.f.${k}.t`)}. `), t(`nutricao.f.${k}.d`))), nota(h, t("nutricao.fontes")))));
      return partes;
    }

    function resultadoMeta(m, d) {
      const nut = d.perfil.nutricao ?? {};
      const avisos = m.avisos.map((a) => estado(h, { codigo: "info", texto: t(`nutricao.limite.${a}`) }));
      return secao(h, t("nutricao.suaMeta"), "sec-meta",
        h("div", { class: "heroi" }, h("span", { class: "rot" }, t("nutricao.alvoDia")), h("b", { class: "gran" }, fmt.numero(m.alvoKcal)), h("p", { class: "leg" }, t(`nutricao.obj.${nut.objetivo ?? "manter"}`) + (m.kgPorSemana ? ` · ${t("nutricao.ritmoKg", { n: fmt.numero(Math.abs(m.kgPorSemana), 2) })}` : ""))),
        h("div", { class: "grade" }, stat(h, { rotulo: t("nutricao.tmb"), valor: kcal(m.tmb), sub: m.tmbEstimado ? t("nutricao.tmbEstimada") : t("nutricao.tmbSub") }), stat(h, { rotulo: t("nutricao.get"), valor: kcal(m.get), sub: t(`nutricao.ativ.${nut.atividade}`) }),
          stat(h, { rotulo: t("nutricao.proteina"), valor: `${fmt.numero(m.proteina.minG)}–${fmt.numero(m.proteina.maxG)} g`, sub: t("nutricao.proteinaSub", { alvo: fmt.numero(m.proteina.alvoG), a: fmt.numero(m.proteina.gKgMin, 1), b: fmt.numero(m.proteina.gKgMax, 1) }) }),
          stat(h, { rotulo: t("nutricao.carbo"), valor: gr(m.carbo.g), sub: `${fmt.numero(m.carbo.pct, 0)}%` }), stat(h, { rotulo: t("nutricao.gordura"), valor: gr(m.gordura.g), sub: `${fmt.numero(m.gordura.pct, 0)}%` }),
          stat(h, { rotulo: t("nutricao.fibra"), valor: gr(m.fibraG), sub: t("nutricao.fibraSub") }), stat(h, { rotulo: t("nutricao.agua"), valor: `${fmt.numero(nut.aguaMl ?? m.aguaMl)} ml`, sub: t("nutricao.aguaSub") })),
        avisos.length ? h("div", { class: "alertas" }, avisos) : null);
    }

    function formMetas(d) {
      const p = d.perfil, nut = p.nutricao ?? {};
      const sexo = selecionar(h, { rotulo: t("nutricao.sexo"), nome: "msexo", valor: p.sexo, opcoes: [{ valor: "", texto: t("nutricao.sexoNao") }, { valor: "m", texto: t("nutricao.sexoM") }, { valor: "f", texto: t("nutricao.sexoF") }] });
      const alt = campo(h, { rotulo: t("nutricao.altura"), nome: "malt", valor: p.alturaCm ?? "", attrs: { inputmode: "decimal" } });
      const nasc = campo(h, { rotulo: t("nutricao.nascimento"), nome: "mnasc", tipo: "date", valor: p.nascimento ?? "" });
      const ativ = selecionar(h, { rotulo: t("nutricao.atividade"), nome: "mativ", valor: nut.atividade ?? "leve", opcoes: Object.keys(ATIVIDADES).map((k) => ({ valor: k, texto: t(`nutricao.ativLonga.${k}`) })) });
      const obj = selecionar(h, { rotulo: t("nutricao.objetivo"), nome: "mobj", valor: nut.objetivo ?? "manter", opcoes: ["manter", "perder", "ganhar"].map((k) => ({ valor: k, texto: t(`nutricao.obj.${k}`) })) });
      const ritmo = selecionar(h, { rotulo: t("nutricao.ritmo"), nome: "mritmo", valor: String(nut.ritmoPct ?? ""), opcoes: [{ valor: "", texto: t("nutricao.ritmoPadrao") }, ...[0.25, 0.5, 0.75, 1].map((v) => ({ valor: String(v), texto: `${fmt.numero(v, 2)}% ${t("nutricao.porSemana")}` }))] });
      const forca = h("label", { class: "campo-check" }, h("input", { type: "checkbox", name: "mforca", checked: !!nut.treinaForca }), h("span", null, t("nutricao.treinaForca")));
      return h("form", { id: "form-metas", class: "form-crud", onsubmit: (e) => {
        e.preventDefault();
        const a = alt.input.value.trim() ? numeroDeTexto(alt.input.value) : null;
        if (alt.input.value.trim() && (a == null || a < 80 || a > 250)) { ui.msg = t("nutricao.alturaInvalida"); return render(); }
        ui.formMetas = false;
        const novo = { ...nut, atividade: ativ.input.value, objetivo: obj.input.value, treinaForca: forca.querySelector("input").checked };
        if (ritmo.input.value) novo.ritmoPct = Number(ritmo.input.value); else delete novo.ritmoPct;
        salvar((x) => definir(x, "perfil", { sexo: sexo.input.value, alturaCm: a, nascimento: nasc.input.value || null, nutricao: novo }, { agora: ctx.agora }), { desfazivel: false });
      } }, sexo, alt, nasc, ativ, obj, ritmo, forca, nota(h, t("nutricao.pesoDoShape")), h("div", { class: "botoes" }, h("button", { type: "submit" }, t("nutricao.salvar")), h("button", { type: "button", class: "peq", onclick: () => ctx.navegar("shape") }, t("nutricao.registrarPeso"))));
    }

    function tendenciaCartao(d, hoje, meta, nut) {
      const { serie } = pesoDe(d), refs = d.refeicoes ?? [];
      const r = sugerirAjuste({ serie, hoje, alvoKcal: meta.alvoKcal, get: meta.get, objetivo: nut.objetivo ?? "manter", sexo: d.perfil.sexo, kgPorSemanaAlvo: meta.kgPorSemana, diasRegistrados: diario.diasRegistrados(refs, hoje, 14), ultimoAjusteEm: nut.ultimoAjusteEm ?? null });
      const ultimo = serie[serie.length - 1];
      const corpo = [ultimo ? h("div", { class: "grade" }, stat(h, { rotulo: t("nutricao.tendenciaPeso"), valor: `${fmt.numero(ultimo.tendencia, 1)} kg`, sub: t("nutricao.tendenciaSub") }), r.taxa ? stat(h, { rotulo: t("nutricao.taxaObservada"), valor: `${r.taxa.kgPorSemana > 0 ? "+" : ""}${fmt.numero(r.taxa.kgPorSemana, 2)} kg/${t("nutricao.sem")}`, sub: t("nutricao.taxaSub", { alvo: `${meta.kgPorSemana > 0 ? "+" : ""}${fmt.numero(meta.kgPorSemana, 2)}` }) }) : null) : vazio(h, t("nutricao.semPesagens"))];
      corpo.push(estado(h, { codigo: r.tipo === "ajustar" ? "info" : "ok", texto: t(`nutricao.aj.${r.tipo}`, { dia: r.proximaEm ? fmt.data(r.proximaEm) : "", n: r.deltaKcal ? fmt.numero(Math.abs(r.deltaKcal)) : "", dias: r.diasRegistrados ?? 0 }) }));
      if (r.tipo === "ajustar") {
        const aplicar = () => salvar((x) => definir(x, "perfil", { nutricao: { ...(x.perfil.nutricao ?? {}), ajusteKcal: Math.max(-600, Math.min(600, (x.perfil.nutricao?.ajusteKcal ?? 0) + r.deltaKcal)), ultimoAjusteEm: hoje } }, { agora: ctx.agora }), { desfazivel: true });
        const manter = () => salvar((x) => definir(x, "perfil", { nutricao: { ...(x.perfil.nutricao ?? {}), ultimoAjusteEm: hoje } }, { agora: ctx.agora }), { desfazivel: true });
        corpo.push(nota(h, t("nutricao.aj.explica", { de: fmt.numero(meta.alvoKcal), para: fmt.numero(r.novoAlvo) })), h("div", { class: "botoes" }, h("button", { type: "button", onclick: aplicar }, t("nutricao.aj.aplicar")), h("button", { type: "button", class: "peq", onclick: manter }, t("nutricao.aj.manter"))));
      }
      return secao(h, t("nutricao.adaptacao"), "sec-adapt", corpo, nota(h, t("nutricao.adaptNota")));
    }

    // ================= DINHEIRO =================
    function abaDinheiro(d, hoje) {
      const ligado = !!d.perfil.cruzamentoDelivery, ym = mesDe(hoje);
      const caixa = h("label", { class: "campo-check" }, h("input", { type: "checkbox", checked: ligado, onchange: (e) => salvar((x) => definir(x, "perfil", { cruzamentoDelivery: e.target.checked }, { agora: ctx.agora }), { desfazivel: false }) }), h("span", null, t("nutricao.dinheiroLigar")));
      const corpo = [nota(h, t("nutricao.dinheiroComo")), caixa];
      if (ligado) {
        const c = diario.cruzamentoFinancas({ resumo: resumoMes(d, ym), refeicoes: d.refeicoes ?? [], ym, hoje });
        corpo.push(h("div", { class: "grade" }, stat(h, { rotulo: t("nutricao.mercado"), valor: fmt.moeda(c.mercadoCentavos), sub: fmt.mesLongo(ym) }), stat(h, { rotulo: t("nutricao.delivery"), valor: fmt.moeda(c.deliveryCentavos), sub: fmt.mesLongo(ym) }), stat(h, { rotulo: t("nutricao.diasComRegistro"), valor: `${c.diasComRegistro} / ${c.diasNoMes}`, sub: t("nutricao.diasDoMes") })),
          tabelaIrma(h, { resumo: t("nutricao.verTabela"), aberta: true, cabecalho: [t("nutricao.item"), t("nutricao.valor")], linhas: [[t("nutricao.mercado"), fmt.moeda(c.mercadoCentavos)], [t("nutricao.delivery"), fmt.moeda(c.deliveryCentavos)], [t("nutricao.diasComRegistro"), `${c.diasComRegistro} / ${c.diasNoMes}`]] }),
          nota(h, t("nutricao.dinheiroSo")));
      }
      return [secao(h, t("nutricao.dinheiro"), "sec-dinheiro", corpo)];
    }

    render();
    return { elemento: raiz, atualizar: render };
  },
};
