// Tela Dívidas: cadastro, Price e tabela de amortização, CET, avalanche × bola de neve lado a lado (a pessoa
// escolhe; bola de neve custa mais mas motiva), "quitar ou investir" (nunca zerando a reserva) e amortização
// extra. Toda regra vem de dividas.mjs; a tela só pergunta, agrupa e mostra em texto sem culpa.
import { adicionar, editar, remover, saldoDaConta } from "../../esquema.mjs";
import { cet, compararMetodos, quitarOuInvestir, simularQuitacao, tabelaPrice } from "../../dividas.mjs";
import { progressoMeta } from "../../metas.mjs";
import { alternador, aviso, campo, centavosDeTexto, confirmar, estado, nota, numeroDeTexto, secao, stat, tabelaIrma, textoDeCentavos } from "./_comum.mjs";

// ---------- lógica de apresentação pura (testada em Node) ----------

// Orçamento padrão para quitar: a soma dos mínimos (cada um limitado ao saldo). A pessoa ajusta para cima.
export const somaMinimos = (dividas) => dividas.reduce((s, d) => s + Math.min(d.parcelaMinimaCentavos ?? 0, d.saldoCentavos), 0);

// Tabela Price da dívida quando se sabe quantas parcelas faltam; null sem esse dado (não se inventa prazo).
export const tabelaDaDivida = (d) => (d.parcelasRestantes >= 1 && d.saldoCentavos > 0 ? tabelaPrice(d.saldoCentavos, d.taxaMensalBp, d.parcelasRestantes) : null);

// Efeito de pagar `extra` a mais por mês no método escolhido: meses e juros a menos. null se a base não converge.
export function efeitoExtra(dividas, orcamentoCentavos, extraCentavos, metodo) {
  const base = simularQuitacao(dividas, orcamentoCentavos, metodo);
  if (base.codigo !== "ok" || extraCentavos <= 0) return null;
  const com = simularQuitacao(dividas, orcamentoCentavos + extraCentavos, metodo);
  if (com.codigo !== "ok") return null;
  return { mesesAMenos: base.meses - com.meses, jurosAMenos: base.jurosCentavos - com.jurosCentavos, meses: com.meses, jurosCentavos: com.jurosCentavos };
}

// A reserva está completa? Olha a meta tipo "reserva" (saldo da conta vinculada ou `atual`). Sem meta → desconhecido.
export function reservaCompletaDe(d, hoje) {
  const m = d.metas.find((x) => x.tipo === "reserva");
  if (!m) return null;
  const atual = m.contaId ? saldoDaConta(d, m.contaId, hoje) ?? 0 : Math.round(m.atual ?? 0);
  return progressoMeta(m, { atualCentavos: atual, hoje }).codigo === "atingida";
}

// ---------- tela ----------
export const tela = {
  id: "dividas", titulo: "dividas.titulo", icone: "debt", grupo: "mais", ordem: 60,
  css: ["/css/_telas.css", "/css/dividas.css"], i18n: "/js/v2/ui/telas/dividas.i18n.mjs",
  montar(ctx) {
    const { h, t, fmt } = ctx;
    const raiz = h("div", { class: "tela-dividas" });
    const ui = { editando: null, nova: false, msg: null, orcamento: null, extra: 0, metodo: "avalanche", cet: { liberado: "", tarifas: "", iof: "", parcela: "", n: "" } };
    const render = () => { ctx.limpar(raiz); raiz.append(...conteudo()); };
    const salvar = (fn) => ctx.mudar(fn).then(() => { ui.msg = null; }).catch((e) => { ui.msg = t("dividas.erro", { codigo: (e?.erros ?? []).map((x) => x.codigo).join(", ") || String(e?.message ?? e) }); render(); });
    const pct = (bp, c = 2) => fmt.percentualBp(bp, c);

    function conteudo() {
      const d = ctx.estado(), hoje = ctx.hoje();
      const partes = [];
      if (ui.msg) partes.push(aviso(h, ui.msg));
      partes.push(resumo(d), listaDividas(d));
      if (d.dividas.length) partes.push(comparacao(d, hoje));
      partes.push(secaoCet());
      return partes;
    }

    function resumo(d) {
      const total = d.dividas.reduce((s, x) => s + x.saldoCentavos, 0), minimos = somaMinimos(d.dividas);
      if (!d.dividas.length) return ctx.estadoVazio({ icone: "dividas", titulo: t("vazio.dividas.titulo"), texto: t("vazio.dividas.texto") });
      const maior = [...d.dividas].sort((a, b) => b.taxaMensalBp - a.taxaMensalBp)[0];
      return h("section", { class: "heroi" }, h("span", { class: "rot" }, t("dividas.totalDevido")), h("div", { class: "gran" }, fmt.moeda(total)),
        h("p", { class: "leg" }, t("dividas.resumo", { n: d.dividas.length, minimos: fmt.moeda(minimos) })),
        h("div", { class: "grade" }, stat(h, { rotulo: t("dividas.maiorJuro"), valor: `${pct(maior.taxaMensalBp)} ${t("dividas.aoMes")}`, sub: maior.nome }), stat(h, { rotulo: t("dividas.minimosMes"), valor: fmt.moeda(minimos) })));
    }

    function listaDividas(d) {
      const form = formDivida(d, ui.editando ? d.dividas.find((x) => x.id === ui.editando) : null);
      const abrir = alternador(h, { texto: t("dividas.nova"), alvo: form, aberto: ui.nova || ui.editando != null });
      if (!d.dividas.length) abrir.classList.remove("peq");
      const cards = d.dividas.map((x) => cartaoDivida(x));
      return secao(h, t("dividas.suas"), "sec-lista", cards.length ? h("div", { class: "cards" }, cards) : null, h("div", { class: "botoes" }, abrir), form);
    }

    function cartaoDivida(x) {
      const tab = tabelaDaDivida(x);
      const partes = [h("header", { class: "div-cab" }, h("div", null, h("h3", null, x.nome), h("small", null, t("dividas.taxaParcela", { taxa: pct(x.taxaMensalBp), parcela: fmt.moeda(x.parcelaMinimaCentavos) }) + (x.parcelasRestantes ? ` · ${t("dividas.parcelasRestantes", { n: x.parcelasRestantes })}` : "") + (x.diaVencimento ? ` · ${t("dividas.venceDia", { dia: x.diaVencimento })}` : ""))), h("b", { class: "div-valor" }, fmt.moeda(x.saldoCentavos)),
        h("div", { class: "acoes" }, h("button", { type: "button", class: "peq", "aria-label": t("dividas.editarX", { nome: x.nome }), onclick: () => { ui.editando = x.id; render(); raiz.querySelector("#form-divida input")?.focus(); } }, t("dividas.editar")),
          h("button", { type: "button", class: "peq", "aria-label": t("dividas.apagarX", { nome: x.nome }), onclick: async () => { if (await confirmar(h, raiz, { titulo: t("dividas.apagarDivida"), texto: x.nome, ok: t("dividas.apagar"), cancelar: t("dividas.cancelar") })) salvar((y) => remover(y, "dividas", x.id, { agora: ctx.agora })); } }, t("dividas.apagar"))))];
      if (tab) {
        partes.push(h("div", { class: "grade" }, stat(h, { rotulo: t("dividas.parcelaPrice"), valor: fmt.moeda(tab.parcelaCentavos), sub: t("dividas.priceSub", { n: x.parcelasRestantes }) }), stat(h, { rotulo: t("dividas.jurosAteFim"), valor: fmt.moeda(tab.totalJurosCentavos), sub: t("dividas.totalPago", { total: fmt.moeda(tab.totalPagoCentavos) }) })),
          tabelaIrma(h, { resumo: t("dividas.verAmortizacao"), cabecalho: ["#", t("dividas.parcela"), t("dividas.juros"), t("dividas.amortizacao"), t("dividas.saldoCol")], linhas: tab.parcelas.map((p) => [String(p.n), fmt.moeda(p.parcelaCentavos), fmt.moeda(p.jurosCentavos), fmt.moeda(p.amortizacaoCentavos), fmt.moeda(p.saldoCentavos)]) }));
      } else partes.push(nota(h, t("dividas.semParcelas")));
      return h("article", { class: "divida" }, partes);
    }

    function formDivida(d, x) {
      const nome = campo(h, { rotulo: t("dividas.nome"), nome: "dnome", valor: x?.nome ?? "", attrs: { required: true, maxlength: 60 } });
      const saldo = campo(h, { rotulo: t("dividas.saldo"), nome: "dsaldo", valor: x ? textoDeCentavos(x.saldoCentavos, ctx.idioma()) : "", attrs: { inputmode: "decimal", required: true } });
      const taxa = campo(h, { rotulo: t("dividas.taxaMensal"), nome: "dtaxa", valor: x ? String(x.taxaMensalBp / 100) : "", attrs: { inputmode: "decimal", required: true }, ajuda: t("dividas.taxaAjuda") });
      const minimo = campo(h, { rotulo: t("dividas.parcelaMinima"), nome: "dmin", valor: x ? textoDeCentavos(x.parcelaMinimaCentavos, ctx.idioma()) : "", attrs: { inputmode: "decimal", required: true } });
      const n = campo(h, { rotulo: t("dividas.parcelasRestantesCampo"), nome: "dn", valor: x?.parcelasRestantes ?? "", attrs: { inputmode: "numeric" }, ajuda: t("dividas.parcelasAjuda") });
      const dia = campo(h, { rotulo: t("dividas.diaVencimento"), nome: "ddia", valor: x?.diaVencimento ?? "", attrs: { inputmode: "numeric", min: 1, max: 31 } });
      return h("form", { id: "form-divida", class: "form-crud", onsubmit: (e) => {
        e.preventDefault();
        const s = centavosDeTexto(saldo.input.value), m = centavosDeTexto(minimo.input.value), tx = numeroDeTexto(taxa.input.value);
        if (s == null || m == null || tx == null) { ui.msg = t("dividas.valorInvalido"); return render(); }
        const item = { nome: nome.input.value.trim(), saldoCentavos: s, taxaMensalBp: Math.round(tx * 100), parcelaMinimaCentavos: m, parcelasRestantes: n.input.value.trim() ? Number(n.input.value) : null, diaVencimento: dia.input.value.trim() ? Number(dia.input.value) : null };
        salvar((y) => (x ? editar(y, "dividas", x.id, item, { agora: ctx.agora }) : adicionar(y, "dividas", item, { novoId: ctx.novoId, agora: ctx.agora })));
        ui.editando = null; ui.nova = false;
      } }, h("h3", null, x ? t("dividas.editarDivida") : t("dividas.nova")), nome, saldo, taxa, minimo, n, dia,
        h("div", { class: "botoes" }, h("button", { type: "submit" }, t("dividas.salvar")), h("button", { type: "button", class: "peq", onclick: () => { ui.editando = null; ui.nova = false; render(); } }, t("dividas.cancelar"))));
    }

    // Avalanche × bola de neve lado a lado, com o orçamento mensal que a pessoa escolhe e a amortização extra.
    function comparacao(d, hoje) {
      const minimos = somaMinimos(d.dividas);
      const orc = ui.orcamento ?? minimos;
      const r = compararMetodos(d.dividas, orc);
      const orcCampo = campo(h, { rotulo: t("dividas.orcamentoMensal"), nome: "orc", valor: textoDeCentavos(orc, ctx.idioma()), attrs: { inputmode: "decimal" }, ajuda: t("dividas.orcamentoAjuda", { minimos: fmt.moeda(minimos) }) });
      const extraCampo = campo(h, { rotulo: t("dividas.extraMensal"), nome: "extra", valor: ui.extra ? textoDeCentavos(ui.extra, ctx.idioma()) : "", attrs: { inputmode: "decimal" }, ajuda: t("dividas.extraAjuda") });
      const form = h("form", { class: "form-sim", onsubmit: (e) => { e.preventDefault(); const v = centavosDeTexto(orcCampo.input.value), ex = extraCampo.input.value.trim() ? centavosDeTexto(extraCampo.input.value) : 0; if (v == null || ex == null) { ui.msg = t("dividas.valorInvalido"); return render(); } ui.orcamento = v; ui.extra = ex; render(); } }, orcCampo, extraCampo, h("div", { class: "botoes" }, h("button", { type: "submit", class: "peq" }, t("dividas.recalcular"))));
      const partes = [form];
      if (r.codigo === "orcamento_insuficiente") partes.push(estado(h, { codigo: "atencao", texto: t("dividas.orcamentoInsuficiente", { faltam: fmt.moeda(r.avalanche.faltamCentavos ?? r.bolaDeNeve.faltamCentavos ?? 0) }) }));
      else if (r.codigo === "ja_quitada") partes.push(estado(h, { codigo: "ok", texto: t("dividas.jaQuitada") }));
      else if (r.codigo === "nao_converge") partes.push(estado(h, { codigo: "atencao", texto: t("dividas.naoConverge") }));
      else {
        const col = (metodo, sim) => h("button", { type: "button", class: "metodo", "aria-pressed": String(ui.metodo === metodo), onclick: () => { ui.metodo = metodo; render(); } },
          h("span", { class: "metodo-nome" }, t(`dividas.${metodo}`)), h("b", null, t("dividas.meses", { n: sim.meses })), h("span", null, t("dividas.jurosTotais", { valor: fmt.moeda(sim.jurosCentavos) })), h("small", null, t(`dividas.${metodo}Como`)));
        partes.push(h("div", { class: "metodos" }, col("avalanche", r.avalanche), col("bolaDeNeve", r.bolaDeNeve)));
        partes.push(nota(h, r.codigo === "empate" ? t("dividas.empate") : t("dividas.diferenca", { juros: fmt.moeda(r.economiaJurosCentavos), meses: r.mesesDiferenca })));
        partes.push(h("p", { class: "escolha" }, estado(h, { codigo: "info", texto: t("dividas.escolhido", { metodo: t(`dividas.${ui.metodo}`) }) })));
        const ordem = r[ui.metodo].cronograma[0];
        if (ordem) { const primeira = Object.entries(ordem.pagamentos).sort((a, b) => b[1] - a[1])[0]; const alvo = d.dividas.find((x) => x.id === primeira?.[0]); if (alvo) partes.push(nota(h, t("dividas.primeiroAlvo", { nome: alvo.nome }))); }
        const ef = efeitoExtra(d.dividas, orc, ui.extra, ui.metodo);
        if (ef) partes.push(h("div", { class: "grade" }, stat(h, { rotulo: t("dividas.comExtra", { extra: fmt.moeda(ui.extra) }), valor: t("dividas.meses", { n: ef.meses }), sub: t("dividas.mesesAMenos", { n: ef.mesesAMenos }) }), stat(h, { rotulo: t("dividas.jurosComExtra"), valor: fmt.moeda(ef.jurosCentavos), sub: t("dividas.jurosAMenos", { valor: fmt.moeda(ef.jurosAMenos) }) })));
        partes.push(tabelaIrma(h, { resumo: t("dividas.verCronograma"), cabecalho: [t("dividas.mes"), t("dividas.pago"), ...d.dividas.map((x) => x.nome)], linhas: r[ui.metodo].cronograma.slice(0, 120).map((c) => [String(c.mes), fmt.moeda(c.pagoCentavos), ...d.dividas.map((x) => fmt.moeda(c.saldos[x.id] ?? 0))]) }));
      }
      // Quitar ou investir: pela dívida de maior juro, com a reserva como trava.
      const maior = [...d.dividas].sort((a, b) => b.taxaMensalBp - a.taxaMensalBp)[0];
      const reserva = reservaCompletaDe(d, hoje);
      const q = quitarOuInvestir(maior.taxaMensalBp, ctx.indices, { reservaCompleta: reserva !== false });
      partes.push(h("h3", null, t("dividas.quitarOuInvestir")), h("div", { class: "grade" }, stat(h, { rotulo: t("dividas.juroDivida", { nome: maior.nome }), valor: `${pct(q.taxaDividaMensalBp)} ${t("dividas.aoMes")}` }), stat(h, { rotulo: t("dividas.rendimentoLiquido"), valor: `${pct(q.rendimentoLiquidoMensalBp)} ${t("dividas.aoMes")}`, sub: t("dividas.rendimentoSub") })),
        estado(h, { codigo: q.recomendacao === "quitar" ? "info" : q.recomendacao === "investir" ? "ok" : "info", texto: t(`dividas.rec.${q.recomendacao}`) }),
        h("ul", { class: "avisos" }, q.avisos.map((a) => h("li", null, t(`dividas.aviso.${a}`))), reserva == null ? h("li", null, t("dividas.aviso.sem_meta_reserva")) : null));
      return secao(h, t("dividas.plano"), "sec-plano", partes);
    }

    // CET: a taxa que iguala o que se recebe ao que se paga (Res. CMN 3.517/2007), calculada em dividas.mjs.
    function secaoCet() {
      const c = ui.cet;
      const f = (k, rotulo, extra = {}) => campo(h, { rotulo, nome: `cet-${k}`, valor: c[k], attrs: { inputmode: k === "n" ? "numeric" : "decimal", ...extra }, });
      const campos = [f("liberado", t("dividas.cetLiberado"), { required: true }), f("tarifas", t("dividas.cetTarifas")), f("iof", t("dividas.cetIof")), f("parcela", t("dividas.cetParcela"), { required: true }), f("n", t("dividas.cetN"), { required: true })];
      let resultado = null;
      if (c.liberado && c.parcela && c.n) {
        try { const r = cet({ valorLiberadoCentavos: centavosDeTexto(c.liberado), tarifasCentavos: centavosDeTexto(c.tarifas || "0"), iofCentavos: centavosDeTexto(c.iof || "0"), parcelaCentavos: centavosDeTexto(c.parcela), n: Number(c.n) }); resultado = r.codigo === "ok" ? h("div", { class: "grade" }, stat(h, { rotulo: t("dividas.cetMensal"), valor: `${pct(r.mensalBp)} ${t("dividas.aoMes")}` }), stat(h, { rotulo: t("dividas.cetAnual"), valor: `${pct(r.anualBp)} ${t("dividas.aoAno")}` })) : estado(h, { codigo: "info", texto: t(`dividas.cet.${r.codigo}`) }); }
        catch (e) { resultado = estado(h, { codigo: "atencao", texto: t("dividas.cetInvalido") }); }
      }
      const form = h("form", { class: "form-crud", onsubmit: (e) => { e.preventDefault(); for (const k of Object.keys(c)) c[k] = form.elements[`cet-${k}`].value; render(); raiz.querySelector(".sec-cet button")?.focus(); } }, campos, h("div", { class: "botoes" }, h("button", { type: "submit" }, t("dividas.cetCalcular"))));
      return secao(h, t("dividas.cet"), "sec-cet", nota(h, t("dividas.cetComo")), form, resultado);
    }

    render();
    return { elemento: raiz, atualizar: render };
  },
};
