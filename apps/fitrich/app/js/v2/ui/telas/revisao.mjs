// Tela Revisão da semana: fecha a semana em uma página (dinheiro, corpo, para olhar, 3 vitórias, 1 ajuste, 1 intenção)
// e, se a pessoa quiser, mostra o equilíbrio em quatro eixos com a conta à vista. Tudo editável e guardado no aparelho
// (perfil.revisoes), exportável em texto. Os números e as regras vêm de js/v2/insights (puro e testado em Node); aqui só
// há apresentação. Sem sequência, sem palavra de culpa, sem nota única.
import { definir } from "../../esquema.mjs";
import { parametrosDoInsight } from "../../insights/apresentar.mjs";
import { equilibrio } from "../../insights/equilibrio.mjs";
import { avaliarTodos, dispensadosDe, dispensar, ordenar, paraOlhar, restaurar } from "../../insights/motor.mjs";
import { dadosDaSemana, revisaoDe, salvarRevisao, semanaDaRevisao, textoDaRevisao, vitoriasSugeridas } from "../../insights/revisao.mjs";
import { semanaDe } from "../../insights/base.mjs";
import { somarDias } from "../../../datas.mjs";
import { linhaDeInsight } from "../insights-ui.mjs";
import { aviso, baixar, nota, secao, stat, tabelaIrma } from "./_comum.mjs";

// ---------- apresentação pura (testada em Node) ----------
// Posição de um valor na régua do eixo, de 0 a 100 (a faixa de equilíbrio ocupa o terço do meio). Fora da faixa, o
// valor se aproxima das pontas sem sair da régua: a régua é gráfico, a tabela ao lado tem o número exato.
export function posicaoNaRegua(valor, { lo, hi }) {
  if (valor < lo) return Math.max(2, Math.round((valor / lo) * 33));
  if (valor > hi) return Math.min(98, 67 + Math.round(Math.min(1, (valor - hi) / hi) * 31));
  return 33 + Math.round(((valor - lo) / (hi - lo || 1)) * 34);
}

export const tela = {
  id: "revisao", titulo: "revisao.titulo", icone: "checkin", grupo: "mais", ordem: 85,
  css: ["/css/_telas.css", "/css/insights.css", "/css/revisao.css"], i18n: "/js/v2/ui/telas/revisao.i18n.mjs",
  montar(ctx) {
    const { h, hs, t, fmt } = ctx;
    const raiz = h("div", { class: "tela-revisao" });
    const ui = { inicio: null, rascunho: null, rascunhoDe: null, msg: null, salvoEm: null, equilibrio: false };
    const nomeCategoria = (id) => { const c = ctx.estado().categorias.find((x) => x.id === id); return c && c.id.startsWith("cat-") ? t(`cat.${c.id}`) : c?.nome ?? t("cat.sem-categoria"); };
    const render = () => { const foco = document.activeElement?.id; ctx.limpar(raiz); raiz.append(...conteudo()); if (foco) raiz.querySelector(`#${CSS.escape(foco)}`)?.focus(); };
    const mudar = (fn) => ctx.mudar(fn).catch((e) => { ui.msg = t("revisao.erro", { codigo: (e?.erros ?? []).map((x) => x.codigo).join(", ") || String(e?.message ?? e) }); render(); });

    function conteudo() {
      const d = ctx.estado(), hoje = ctx.hoje();
      const alvo = semanaDaRevisao(hoje);
      ui.inicio ??= alvo.inicio;
      // Rascunho vive enquanto a semana mostrada não muda: trocar de semana recarrega o que está guardado dela.
      if (ui.rascunhoDe !== ui.inicio) { ui.rascunho = revisaoDe(d, ui.inicio); ui.rascunhoDe = ui.inicio; ui.salvoEm = null; }
      const w = dadosDaSemana(d, ui.inicio, hoje);
      const partes = [];
      if (ui.msg) partes.push(aviso(h, ui.msg));
      partes.push(h("p", { class: "nota" }, t("revisao.sub")), navegacao(hoje), dinheiro(w), corpo(w), olhar(d, hoje), escrita(d, w, hoje), equilibrioSecao(d, hoje));
      return partes;
    }

    function navegacao(hoje) {
      const atual = semanaDe(hoje).inicio, fim = somarDias(ui.inicio, 6);
      const ir = (n) => () => { ui.inicio = somarDias(ui.inicio, 7 * n); render(); };
      return h("nav", { class: "semana-nav", "aria-label": t("revisao.titulo") },
        h("button", { type: "button", class: "peq", id: "rev-ant", onclick: ir(-1) }, t("revisao.semanaAnterior")),
        h("strong", { class: "semana-rotulo", "aria-live": "polite" }, t("revisao.semanaDe", { inicio: fmt.data(ui.inicio), fim: fmt.data(fim) })),
        h("button", { type: "button", class: "peq", id: "rev-seg", disabled: ui.inicio >= atual, onclick: ir(1) }, t("revisao.semanaSeguinte")));
    }

    function dinheiro(w) {
      const m = w.dinheiro, partes = [];
      if (w.emAndamento) partes.push(nota(h, t("revisao.emAndamento")));
      if (!m.lancamentos) partes.push(h("p", { class: "vazio" }, t("revisao.semLancamentos")));
      else {
        partes.push(h("div", { class: "grade" }, stat(h, { rotulo: t("revisao.entrou"), valor: fmt.moeda(m.entrouCentavos) }), stat(h, { rotulo: t("revisao.saiu"), valor: fmt.moeda(m.saiuCentavos) }), stat(h, { rotulo: t("revisao.poupou"), valor: fmt.moeda(m.poupouCentavos) })));
        if (m.variacaoSaiuBp != null) partes.push(nota(h, t("revisao.saiuVsAnterior", { pct: fmt.percentualBp(Math.abs(m.variacaoSaiuBp), 0), sentido: t(m.variacaoSaiuBp < 0 ? "revisao.sentidoMenos" : "revisao.sentidoMais"), anterior: fmt.moeda(m.saiuAnteriorCentavos) })));
        if (m.maiorGasto) partes.push(nota(h, m.maiorGasto.descricao ? t("revisao.maiorGasto", { valor: fmt.moeda(m.maiorGasto.centavos), descricao: m.maiorGasto.descricao }) : t("revisao.maiorGastoSemNome", { valor: fmt.moeda(m.maiorGasto.centavos) })));
        const subiu = m.topCategorias.filter((c) => c.deltaCentavos > 0);
        if (subiu.length) partes.push(h("h3", null, t("revisao.mudouMais")), h("ul", { class: "lista" }, subiu.map((c) => h("li", null, h("span", null, t("revisao.categoriaDelta", { categoria: nomeCategoria(c.categoriaId), valor: fmt.moeda(c.centavos), delta: fmt.moeda(c.deltaCentavos, "BRL", { sinal: true }) }))))));
      }
      return secao(h, t("revisao.dinheiro"), "sec-rev-dinheiro", partes);
    }

    function corpo(w) {
      const c = w.corpo, partes = [], tem = c.treinos || c.pesagens || c.noites || c.refeicoes;
      if (!tem) return secao(h, t("revisao.corpo"), "sec-rev-corpo", h("p", { class: "vazio" }, t("revisao.semCorpo")));
      const stats = [stat(h, { rotulo: t("revisao.treinos"), valor: t("revisao.treinosDaSemana", { n: c.treinos }), sub: [t("revisao.minutosN", { n: c.minutos }), c.metaTreinos ? t("revisao.metaTreino", { meta: c.metaTreinos }) : null].filter(Boolean).join(" · ") })];
      if (c.pesoFimKg != null) stats.push(stat(h, { rotulo: t("revisao.peso"), valor: `${fmt.numero(c.pesoFimKg, 1)} kg`, sub: c.deltaKg != null ? t("revisao.pesoDelta", { delta: fmt.numero(c.deltaKg, 1) }) : null }));
      if (c.sonoMedioHoras != null) stats.push(stat(h, { rotulo: t("revisao.sono"), valor: `${fmt.numero(c.sonoMedioHoras, 1)} h`, sub: t("revisao.sonoMedio", { horas: fmt.numero(c.sonoMedioHoras, 1), noites: c.noites }) }));
      partes.push(h("div", { class: "grade" }, ...stats));
      if (c.refeicoes) partes.push(nota(h, t("revisao.refeicoes", { n: c.refeicoes })));
      partes.push(nota(h, t("revisao.diasComRegistro", { dias: w.diasComRegistro })));
      return secao(h, t("revisao.corpo"), "sec-rev-corpo", partes);
    }

    function olhar(d, hoje) {
      const { itens } = paraOlhar(d, hoje), todos = ordenar(avaliarTodos(d, hoje).insights).filter((i) => !dispensadosDe(d).includes(i.chave) && !itens.some((x) => x.chave === i.chave));
      const aoDispensar = (i) => mudar((x) => definir(x, "perfil", { insightsDispensados: dispensar(dispensadosDe(x), i.chave) }, { agora: ctx.agora }));
      const ctxUi = { h, t, fmt, nomeCategoria };
      const nDisp = dispensadosDe(d).length;
      const partes = [itens.length ? h("ul", { class: "insights" }, itens.map((i) => linhaDeInsight(ctxUi, i, { aoDispensar }))) : h("p", { class: "vazio" }, t("revisao.olhar.vazio"))];
      if (todos.length) partes.push(h("details", { class: "tab" }, h("summary", null, t("revisao.olhar.todos")), nota(h, t("revisao.olhar.todosAjuda")), h("ul", { class: "insights" }, todos.map((i) => linhaDeInsight(ctxUi, i, { aoDispensar })))));
      if (nDisp) partes.push(h("div", { class: "botoes" }, h("button", { type: "button", class: "peq", id: "rev-restaurar", onclick: () => mudar((x) => definir(x, "perfil", { insightsDispensados: [] }, { agora: ctx.agora })) }, `${t("revisao.olhar.restaurar")} (${t("revisao.olhar.dispensados", { n: nDisp })})`)));
      return secao(h, t("revisao.olhar.titulo"), "sec-rev-olhar", partes);
    }

    // ---- escrita: 3 vitórias, 1 ajuste, 1 intenção ----
    function area(rotulo, id, valor, aoDigitar, { ajuda = null, placeholder = null } = {}) {
      const ta = h("textarea", { id, rows: 2, maxlength: 280, placeholder, oninput: (e) => aoDigitar(e.target.value) }, valor);
      ta.value = valor;
      return h("div", { class: "campo" }, h("label", { class: "campo-rot", for: id }, rotulo), ta, ajuda ? h("small", { class: "campo-ajuda" }, ajuda) : null);
    }
    function escrita(d, w, hoje) {
      const r = ui.rascunho;
      const sugestoes = vitoriasSugeridas(w), textoVit = (s) => t(`revisao.vit.${s.chave}`, parametrosDoInsight(s, fmt));
      const adotar = (s) => { const i = r.vitorias.findIndex((x) => !x.trim()); r.vitorias[i < 0 ? 2 : i] = textoVit(s); render(); };
      const top = paraOlhar(d, hoje).itens[0];
      const sugAjuste = top ? t(`${top.texto}.p`, parametrosDoInsight(top, fmt, nomeCategoria, (x) => t(`revisao.tipo.${x}`))) : null;
      const partes = [h("h3", null, t("revisao.tresVitorias")), nota(h, t("revisao.vitoriasAjuda"))];
      r.vitorias.forEach((v, i) => partes.push(area(t("revisao.vitoria", { n: i + 1 }), `rev-vit-${i}`, v, (x) => { r.vitorias[i] = x; })));
      partes.push(h("p", { class: "nota" }, t("revisao.sugestoes")), h("div", { class: "botoes sugestoes" }, sugestoes.map((s) => h("button", { type: "button", class: "peq", onclick: () => adotar(s) }, textoVit(s)))));
      partes.push(h("h3", null, t("revisao.ajuste")), area(t("revisao.ajuste"), "rev-ajuste", r.ajuste, (x) => { r.ajuste = x; }, { ajuda: t("revisao.ajusteAjuda") }));
      if (sugAjuste) partes.push(h("div", { class: "botoes" }, h("button", { type: "button", class: "peq", onclick: () => { r.ajuste = sugAjuste.slice(0, 280); render(); } }, t("revisao.usarSugestao"))), nota(h, t("revisao.ajusteSugerido", { texto: sugAjuste })));
      partes.push(h("h3", null, t("revisao.intencao")), area(t("revisao.intencao"), "rev-intencao", r.intencao, (x) => { r.intencao = x; }, { ajuda: t("revisao.intencaoAjuda"), placeholder: t("revisao.intencaoExemplo") }), nota(h, t("revisao.limite", { n: 280 })));
      const texto = () => textoDaRevisao({ dados: w, revisao: r, t, fmt });
      partes.push(h("div", { class: "botoes" },
        h("button", { type: "button", id: "rev-salvar", onclick: () => { ui.salvoEm = ctx.agora(); mudar((x) => salvarRevisao(x, ui.inicio, r, { agora: ctx.agora })); } }, t("revisao.salvar")),
        h("button", { type: "button", class: "peq", onclick: () => baixar(document, t("revisao.exportNome", { inicio: ui.inicio }), texto(), "text/markdown;charset=utf-8") }, t("revisao.exportar")),
        h("button", { type: "button", class: "peq", onclick: async () => { try { await navigator.clipboard.writeText(texto()); ui.msg = t("revisao.copiado"); } catch { ui.msg = t("revisao.copiarFalhou"); } render(); } }, t("revisao.copiar"))));
      if (ui.salvoEm || r.atualizadoEm) partes.push(h("p", { class: "aviso", role: "status", "aria-live": "polite" }, t("revisao.salvo", { hora: new Date(ui.salvoEm ?? r.atualizadoEm).toLocaleTimeString(ctx.fmt.locale, { hour: "2-digit", minute: "2-digit" }) })));
      return secao(h, t("revisao.escrever"), "sec-rev-escrita", partes);
    }

    // ---- equilíbrio (opcional) ----
    function equilibrioSecao(d, hoje) {
      const botao = h("button", { type: "button", class: "peq", id: "rev-eq", "aria-expanded": String(ui.equilibrio), onclick: () => { ui.equilibrio = !ui.equilibrio; render(); } }, t(ui.equilibrio ? "revisao.equilibrioDesliga" : "revisao.equilibrioLiga"));
      const partes = [nota(h, t("revisao.equilibrioSub")), h("div", { class: "botoes" }, botao)];
      if (!ui.equilibrio) { partes.splice(0, 1, nota(h, t("revisao.equilibrioOpcional"))); return secao(h, t("revisao.equilibrio"), "sec-rev-eq", partes); }
      const e = equilibrio(d, hoje);
      partes.push(h("p", { class: "nota", role: "status" }, t("revisao.eq.resumo", { n: e.emEquilibrio, total: e.comDado })));
      for (const x of e.eixos) partes.push(eixo(x));
      partes.push(nota(h, t("revisao.eq.aviso")));
      return secao(h, t("revisao.equilibrio"), "sec-rev-eq", partes);
    }
    function eixo(x) {
      const chaveConta = x.id === "descanso" ? `descanso_${x.variante ?? "folga"}` : x.id;
      const icone = { equilibrio: "✓", falta: "↓", excesso: "↑", sem_dado: "–" }[x.faixa];
      const cab = h("h3", null, t(`revisao.eq.${x.id}`));
      if (x.faixa === "sem_dado") return h("div", { class: "eixo eixo-sem-dado" }, cab, h("span", { class: "estado" }, h("i", { class: "estado-ic", "aria-hidden": "true" }, icone), h("span", null, t("revisao.faixa.sem_dado"))), nota(h, t(`revisao.eq.semDado.${x.id}`)));
      const dinheiroEixo = x.id === "dinheiro", lim = x.limites;
      const mostra = (v) => (dinheiroEixo ? fmt.numero(v / 100, 0) : fmt.numero(v, Number.isInteger(v) ? 0 : 1));
      const valorTxt = t(`revisao.eq.valor.${chaveConta}`, { valor: dinheiroEixo ? fmt.percentualBp(x.valor, 0) : mostra(x.valor) });
      const faixaTxt = t(`revisao.eq.faixaLim.${chaveConta}`, { lo: mostra(lim.lo), hi: mostra(lim.hi) });
      const pos = posicaoNaRegua(x.valor, lim);
      const regua = hs("svg", { class: "regua", viewBox: "0 0 100 12", role: "img", "aria-label": t("revisao.eq.regua", { eixo: t(`revisao.eq.${x.id}`), valor: valorTxt, lo: mostra(lim.lo), hi: mostra(lim.hi) }), preserveAspectRatio: "none" },
        hs("rect", { class: "regua-fundo", x: 0, y: 4, width: 100, height: 4, rx: 2 }), hs("rect", { class: "regua-faixa", x: 33, y: 2, width: 34, height: 8, rx: 2 }), hs("rect", { class: "regua-marca", x: pos - 1, y: 0, width: 2, height: 12 }));
      const linhas = x.conta.map((c) => [c.ym ? fmt.mes(c.ym) : c.inicio ? fmt.data(c.inicio) : fmt.data(c.data), c.bp != null ? fmt.percentualBp(c.bp, 0) : c.minutos != null ? `${c.minutos} min` : c.dias != null ? String(c.dias) : c.registros != null ? String(c.registros) : `${fmt.numero(c.horas, 1)} h`]);
      return h("div", { class: ["eixo", `eixo-${x.faixa}`] }, cab,
        h("p", { class: "eixo-valor" }, valorTxt),
        h("span", { class: "estado" }, h("i", { class: "estado-ic", "aria-hidden": "true" }, icone), h("span", null, t(`revisao.faixa.${x.faixa}`))),
        regua, h("p", { class: "nota" }, t("revisao.eq.faixaDe", { faixa: faixaTxt })),
        nota(h, t(`revisao.eq.${x.faixa}.${x.id}`)),
        h("details", { class: "tab" }, h("summary", null, t("revisao.eq.tabela")), nota(h, t(`revisao.eq.conta.${chaveConta}`)), h("div", { class: "rolar" }, h("table", null, h("thead", null, h("tr", null, h("th", { scope: "col" }, t("revisao.eq.colPeriodo")), h("th", { scope: "col" }, t("revisao.eq.colValor")))), h("tbody", null, linhas.map((l) => h("tr", null, l.map((c) => h("td", null, c))))))))); 
    }

    render();
    return { elemento: raiz, atualizar: render };
  },
};
