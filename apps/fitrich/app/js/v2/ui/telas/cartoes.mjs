// Tela Cartões: um bloco por cartão ("fecha dia X · vence dia Y"), fatura atual (total, % do limite, dias para
// fechar/vencer, status), próxima fatura (parcelas já comprometidas), limite usado/disponível, linha do tempo de
// 3 ciclos, calendário do mês com vencimentos (ícone + número, a cor só reforça), parcelas futuras, pagar fatura
// (vira transferência, não gasto), estornar compra (parcelas futuras ficam "canceladas", nunca apagadas),
// cadastrar/editar cartão. Rotativo só como "média de mercado BCB, não a sua taxa"; nunca pagamento mínimo.
// Toda regra vem de `cartao.mjs`/`parcelas.mjs`/`esquema.mjs`; aqui só se agrupa e se mostra.
import { mesDe, somarMeses, ultimoDiaDoMes } from "../../../datas.mjs";
import { adicionar, editar } from "../../esquema.mjs";
import { custoAproximadoRotativo, estornarCompra, faturaDaCompra, faturaDoLancamento, fechamentoDaFatura, limiteDisponivel, limiteUsado, pagarFatura, resumoDaFatura, vencimentoDaFatura } from "../../cartao.mjs";
import { parcelasFuturasPorFatura } from "../../parcelas.mjs";
import { SNAPSHOT_INDICES } from "../../indices.mjs";
import { bullet, linhaDoTempoCiclos } from "../graficos-financas.mjs";
import { campo, centavosParaCampo, dialogoFormulario, lerCentavos, nomeCategoria, opcoes, textoDoErro } from "./financas-comum.mjs";

const P = "cartoes";

// ---------- lógica de apresentação (pura, testada em Node) ----------
// Três ciclos em volta da fatura aberta: a anterior (paga ou a pagar), a aberta e a próxima.
export function ciclosDoCartao(cartao, lancamentos, hoje) {
  const aberta = faturaDaCompra(cartao, hoje);
  return [["anterior", -1], ["aberta", 0], ["proxima", 1]].map(([classe, k]) => { const ym = somarMeses(aberta, k); return { classe, ym, resumo: resumoDaFatura(cartao, lancamentos, ym, hoje) }; });
}

// Faturas já fechadas com saldo a pagar, da mais antiga para a mais nova (é o que a pessoa precisa quitar).
export function faturasAPagar(cartao, lancamentos, hoje) {
  const aberta = faturaDaCompra(cartao, hoje), yms = new Set();
  for (const l of lancamentos) if (l.cartaoId === cartao.id && l.status !== "cancelado") yms.add(faturaDoLancamento(cartao, l));
  return [...yms].filter((ym) => ym < aberta).sort().map((ym) => resumoDaFatura(cartao, lancamentos, ym, hoje)).filter((r) => r.restanteCentavos > 0);
}

// Compras e estornos de uma fatura, por data (o resumo do motor devolve só a contagem).
export const itensDaFatura = (cartao, lancamentos, ym) => lancamentos
  .filter((l) => l.cartaoId === cartao.id && l.status !== "cancelado" && (l.tipo === "despesa" || l.tipo === "estorno") && faturaDoLancamento(cartao, l) === ym)
  .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.id < b.id ? -1 : 1));

// Eventos do calendário de um mês: vencimento (fatura deste mês ou do anterior pode vencer aqui) e fechamento.
export function eventosDoMes(cartoes, lancamentos, ym, hoje) {
  const eventos = [];
  for (const cartao of cartoes) {
    for (const ymFatura of [somarMeses(ym, -1), ym]) {
      const venc = vencimentoDaFatura(cartao, ymFatura);
      if (mesDe(venc) !== ym) continue;
      const r = resumoDaFatura(cartao, lancamentos, ymFatura, hoje);
      eventos.push({ data: venc, dia: Number(venc.slice(8, 10)), tipo: "vence", cartaoId: cartao.id, ym: ymFatura, centavos: r.status === "paga" ? r.totalCentavos : r.restanteCentavos, status: r.status });
    }
    const fech = fechamentoDaFatura(cartao, ym);
    eventos.push({ data: fech, dia: Number(fech.slice(8, 10)), tipo: "fecha", cartaoId: cartao.id, ym, centavos: null, status: null });
  }
  return eventos.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.tipo < b.tipo ? -1 : 1));
}

// Semanas do mês (segunda a domingo, como a semana do Fitrich), com null fora do mês.
export function gradeDoMes(ym) {
  const dias = Number(ultimoDiaDoMes(ym).slice(8, 10)), primeiro = (new Date(`${ym}-01T00:00:00Z`).getUTCDay() + 6) % 7;
  const celulas = [...Array(primeiro).fill(null), ...Array.from({ length: dias }, (_, i) => i + 1)];
  while (celulas.length % 7) celulas.push(null);
  const semanas = [];
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7));
  return semanas;
}

export const percentualDoLimite = (usado, limite) => (limite > 0 ? Math.round((usado / limite) * 100) : null);

// ---------- a tela ----------
export const tela = {
  id: "cartoes", titulo: "cartoes.titulo", icone: "card", grupo: "principal", ordem: 30,
  css: ["/css/financas-comum.css", "/css/cartoes.css"], i18n: "/js/v2/ui/telas/cartoes.i18n.mjs",
  montar(ctx) {
    const { h, t, fmt, limpar } = ctx;
    const ui = { ymCalendario: mesDe(ctx.hoje()), abertos: new Set() };
    const raiz = h("section", { class: "tela-cartoes" });
    const aviso = h("p", { class: "fin-aviso", role: "status" });
    const R = (c, o) => fmt.moeda(c, "BRL", o);
    const nomeCat = (id) => nomeCategoria(ctx.estado().categorias, id, t, P);
    const falhou = (e) => { aviso.textContent = textoDoErro(e, t, P); };
    const mudar = (fn) => Promise.resolve().then(() => ctx.mudar(fn)).catch(falhou);
    const rotativoBp = ctx.indices?.rotativoPfBp ?? SNAPSHOT_INDICES.rotativoPfBp;
    const ICONE = { futura: "○", aberta: "◔", fechada: "●", vencida: "!", paga: "✓" };
    const detalhes = (chave, resumo, ...conteudo) => {
      const el = h("details", { class: "fin-tabela", open: ui.abertos.has(chave) }, h("summary", null, resumo), ...conteudo);
      el.addEventListener("toggle", () => { if (el.open) ui.abertos.add(chave); else ui.abertos.delete(chave); });
      return el;
    };
    const chipStatus = (status) => h("span", { class: ["car-status", `is-${status}`] }, h("span", { class: "fin-ic", "aria-hidden": "true" }, ICONE[status]), " ", t(`${P}.status.${status}`));

    // --- diálogos ---
    const dlgCartao = dialogoFormulario(h, {
      titulo: t(`${P}.form.titulo`), rotuloSalvar: t(`${P}.form.salvar`), rotuloCancelar: t(`${P}.form.cancelar`),
      corpo: (form) => {
        const d = ctx.estado(), c = d.cartoes.find((x) => x.id === form.dataset.id) ?? { nome: "", diaFechamento: 1, diaVencimento: 10, fechaInclusivo: false, limiteCentavos: null, contaPagamentoId: d.contas[0]?.id };
        const dias = Array.from({ length: 31 }, (_, i) => [String(i + 1), String(i + 1)]);
        return h("div", { class: "fin-form-grade" },
          campo(h, t(`${P}.form.nome`), h("input", { name: "nome", required: true, maxlength: 60, value: c.nome })),
          campo(h, t(`${P}.form.fechamento`), h("select", { name: "diaFechamento" }, opcoes(h, dias, String(c.diaFechamento)))),
          campo(h, t(`${P}.form.vencimento`), h("select", { name: "diaVencimento" }, opcoes(h, dias, String(c.diaVencimento)))),
          campo(h, t(`${P}.form.limite`), h("input", { name: "limite", inputmode: "decimal", placeholder: t(`${P}.form.sem_limite`), value: c.limiteCentavos ? centavosParaCampo(c.limiteCentavos, ctx.idioma()) : "" })),
          campo(h, t(`${P}.form.conta`), h("select", { name: "contaPagamentoId", required: true }, opcoes(h, d.contas.filter((x) => !x.arquivada).map((x) => [x.id, x.nome]), c.contaPagamentoId))),
          h("label", { class: "fin-campo fin-campo-check" }, h("input", { type: "checkbox", name: "fechaInclusivo", checked: c.fechaInclusivo }), h("span", null, t(`${P}.form.fecha_inclusivo`))));
      },
      aoEnviar: async (form) => {
        const v = Object.fromEntries(new FormData(form));
        const limite = String(v.limite ?? "").trim() ? lerCentavos(v.limite) : null;
        if (String(v.limite ?? "").trim() && limite == null) throw t(`${P}.form.limite_invalido`);
        const item = { nome: String(v.nome).trim(), diaFechamento: Number(v.diaFechamento), diaVencimento: Number(v.diaVencimento), fechaInclusivo: v.fechaInclusivo === "on", limiteCentavos: limite, contaPagamentoId: v.contaPagamentoId };
        const id = form.dataset.id;
        try { await ctx.mudar((d) => (id ? editar(d, "cartoes", id, item) : adicionar(d, "cartoes", item, { novoId: ctx.novoId, agora: ctx.agora }))); } catch (e) { throw textoDoErro(e, t, P); }
      },
    });
    const abrirCartao = (id) => { dlgCartao.dialogo.querySelector("form").dataset.id = id ?? ""; dlgCartao.abrir(); };

    const dlgPagar = dialogoFormulario(h, {
      titulo: t(`${P}.pagar.titulo`), rotuloSalvar: t(`${P}.pagar.salvar`), rotuloCancelar: t(`${P}.form.cancelar`),
      corpo: (form) => {
        const d = ctx.estado(), c = d.cartoes.find((x) => x.id === form.dataset.cartao), r = resumoDaFatura(c, d.lancamentos, form.dataset.ym, ctx.hoje());
        return h("div", { class: "fin-form-grade" },
          h("p", { class: "fin-ajuda" }, t(`${P}.pagar.ajuda`, { mes: fmt.mesLongo(r.ym), total: R(r.totalCentavos), restante: R(r.restanteCentavos) })),
          campo(h, t(`${P}.pagar.valor`), h("input", { name: "valor", inputmode: "decimal", required: true, value: centavosParaCampo(r.restanteCentavos || r.totalCentavos, ctx.idioma()) })),
          campo(h, t(`${P}.pagar.data`), h("input", { name: "data", type: "date", required: true, value: ctx.hoje() })),
          campo(h, t(`${P}.pagar.conta`), h("select", { name: "contaId" }, opcoes(h, d.contas.filter((x) => !x.arquivada).map((x) => [x.id, x.nome]), c.contaPagamentoId))),
          h("p", { class: "fin-ajuda" }, t(`${P}.pagar.nota`)));
      },
      aoEnviar: async (form) => {
        const v = Object.fromEntries(new FormData(form)), centavos = lerCentavos(v.valor);
        if (centavos == null) throw t(`${P}.pagar.valor_invalido`);
        const { cartao: cartaoId, ym } = form.dataset;
        let excedente = 0;
        try {
          await ctx.mudar((d) => {
            const c = d.cartoes.find((x) => x.id === cartaoId);
            const p = pagarFatura({ cartao: c, lancamentos: d.lancamentos, ym, centavos, data: v.data, contaId: v.contaId, novoId: ctx.novoId });
            excedente = p.excedenteCentavos;
            const d2 = adicionar(d, "lancamentos", p.lancamento, { novoId: ctx.novoId, agora: ctx.agora });
            return { ...d2, faturas: [...d2.faturas.filter((f) => !(f.cartaoId === cartaoId && f.ym === ym)), p.fatura] };
          });
        } catch (e) { throw textoDoErro(e, t, P); }
        aviso.textContent = excedente > 0 ? t(`${P}.pagar.excedente`, { valor: R(excedente) }) : t(`${P}.pagar.feito`, { valor: R(centavos) });
      },
    });
    const abrirPagar = (cartaoId, ym) => { const f = dlgPagar.dialogo.querySelector("form"); f.dataset.cartao = cartaoId; f.dataset.ym = ym; dlgPagar.abrir(); };

    const dlgEstorno = dialogoFormulario(h, {
      titulo: t(`${P}.estorno.titulo`), rotuloSalvar: t(`${P}.estorno.salvar`), rotuloCancelar: t(`${P}.form.cancelar`),
      corpo: (form) => {
        const d = ctx.estado(), l = d.lancamentos.find((x) => x.id === form.dataset.compra);
        return h("div", { class: "fin-form-grade" },
          h("p", { class: "fin-ajuda" }, t(`${P}.estorno.ajuda`, { desc: l.descricao || nomeCat(l.categoriaId), valor: R(l.centavos) })),
          campo(h, t(`${P}.estorno.data`), h("input", { name: "data", type: "date", required: true, value: ctx.hoje() })),
          // Valor pré-preenchido com o DESTE lançamento: o esquema limita o estorno ao valor da compra apontada por
          // `refId`, e numa parcelada o motor devolveria a soma das parcelas cobradas (ver nota no PR).
          campo(h, t(`${P}.estorno.valor`), h("input", { name: "valor", inputmode: "decimal", required: true, value: centavosParaCampo(l.centavos, ctx.idioma()) })),
          l.parcela ? h("p", { class: "fin-ajuda" }, t(`${P}.estorno.parcelas`)) : null);
      },
      aoEnviar: async (form) => {
        const v = Object.fromEntries(new FormData(form)), centavos = lerCentavos(v.valor);
        if (centavos == null) throw t(`${P}.pagar.valor_invalido`);
        const compraId = form.dataset.compra;
        try {
          await ctx.mudar((d) => {
            const compra = d.lancamentos.find((x) => x.id === compraId), cartao = d.cartoes.find((c) => c.id === compra.cartaoId);
            const r = estornarCompra({ cartao, compra, lancamentos: d.lancamentos, data: v.data, novoId: ctx.novoId, centavos, agora: ctx.agora });
            return { ...d, lancamentos: r.lancamentos, meta: { ...d.meta, atualizadoEm: ctx.agora() } };
          });
        } catch (e) { if (e instanceof RangeError) throw t(`${P}.estorno.maior_que_cobrado`); throw textoDoErro(e, t, P); }
      },
    });
    const abrirEstorno = (compraId) => { dlgEstorno.dialogo.querySelector("form").dataset.compra = compraId; dlgEstorno.abrir(); };

    // --- bloco de um cartão ---
    function blocoCartao(d, c) {
      const hoje = ctx.hoje(), ciclos = ciclosDoCartao(c, d.lancamentos, hoje), aberta = ciclos[1].resumo, proxima = ciclos[2].resumo;
      const usado = limiteUsado(c, d.lancamentos, hoje), disponivel = c.limiteCentavos != null ? limiteDisponivel(c, d.lancamentos, hoje) : null;
      const pctAberta = c.limiteCentavos ? percentualDoLimite(aberta.totalCentavos, c.limiteCentavos) : null;
      const futuras = parcelasFuturasPorFatura(c, d.lancamentos, hoje), comprometido = futuras.filter((f) => f.ym > aberta.ym);
      const aPagar = faturasAPagar(c, d.lancamentos, hoje);
      const tile = (rotulo, valor, ...subs) => h("div", { class: "fin-tile" }, h("span", { class: "fin-tile-rotulo" }, rotulo), h("b", { class: "fin-tile-valor" }, valor), subs.filter(Boolean).map((s) => h("small", null, s)));
      const diasTexto = aberta.diasParaFechar >= 0 ? t(`${P}.fatura.fecha_em`, { n: aberta.diasParaFechar }) : t(`${P}.fatura.fechou`);
      return h("article", { class: "car-cartao", "aria-labelledby": `car-${c.id}` },
        h("div", { class: "fin-sec-cab" },
          h("div", null, h("h3", { id: `car-${c.id}` }, c.nome), h("p", { class: "car-regra" }, t(`${P}.regra`, { fecha: c.diaFechamento, vence: c.diaVencimento }), c.limiteCentavos != null ? ` · ${t(`${P}.limite.total`, { valor: R(c.limiteCentavos) })}` : "")),
          h("button", { type: "button", class: "fin-btn fin-btn-sec fin-btn-peq", "data-foco": `editar-${c.id}`, onClick: () => abrirCartao(c.id) }, t(`${P}.editar`))),
        aPagar.map((r) => h("div", { class: ["car-apagar", `is-${r.status}`] },
          chipStatus(r.status), h("p", null, t(`${P}.apagar.texto`, { mes: fmt.mesLongo(r.ym), valor: R(r.restanteCentavos), venc: fmt.data(r.vencimento) })),
          h("p", { class: "car-rotativo" }, t(`${P}.rotativo`, { valor: R(r.restanteCentavos), custo: R(custoAproximadoRotativo(r.restanteCentavos, rotativoBp, 30).custoCentavos), taxa: fmt.percentualBp(rotativoBp, 1) })),
          h("button", { type: "button", class: "fin-btn", "data-foco": `pagar-${c.id}-${r.ym}`, onClick: () => abrirPagar(c.id, r.ym) }, t(`${P}.pagar.botao`)))),
        h("div", { class: "fin-kpi car-kpi" },
          tile(t(`${P}.fatura.atual`, { mes: fmt.mes(aberta.ym) }), R(aberta.totalCentavos), chipStatus(aberta.status), pctAberta == null ? null : t(`${P}.fatura.pct_limite`, { pct: fmt.numero(pctAberta) }), `${diasTexto} · ${t(`${P}.fatura.vence_em`, { n: Math.max(0, aberta.diasParaVencer), data: fmt.dataCurta(aberta.vencimento) })}`),
          tile(t(`${P}.fatura.proxima`, { mes: fmt.mes(proxima.ym) }), R(proxima.totalCentavos), t(`${P}.fatura.comprometido`, { n: comprometido.reduce((s, f) => s + f.parcelas, 0), valor: R(comprometido.reduce((s, f) => s + f.centavos, 0)) })),
          c.limiteCentavos != null
            ? tile(t(`${P}.limite.rotulo`), R(disponivel), t(`${P}.limite.usado`, { usado: R(usado), limite: R(c.limiteCentavos) }), bullet({ gasto: usado, limite: c.limiteCentavos, titulo: t(`${P}.limite.rotulo`), desc: t(`${P}.limite.usado`, { usado: R(usado), limite: R(c.limiteCentavos) }) }))
            : tile(t(`${P}.limite.rotulo`), t(`${P}.form.sem_limite`), t(`${P}.limite.so_usado`, { usado: R(usado) }))),
        h("div", { class: "car-ciclos" }, h("h4", null, t(`${P}.ciclos.titulo`)),
          linhaDoTempoCiclos({ ciclos, titulo: t(`${P}.ciclos.titulo`), desc: ciclos.map((x) => `${fmt.mes(x.ym)}: ${t(`${P}.status.${x.resumo.status}`)} ${R(x.resumo.totalCentavos)}`).join("; ") }),
          h("ol", { class: "car-ciclos-lista" }, ciclos.map((x) => h("li", { class: `is-${x.classe}` }, h("b", null, fmt.mes(x.ym)), chipStatus(x.resumo.status), h("span", null, R(x.resumo.totalCentavos)))))),
        detalhes(`itens-${c.id}`, t(`${P}.itens.titulo`, { n: itensDaFatura(c, d.lancamentos, aberta.ym).length }), listaItens(d, c, aberta.ym)),
        detalhes(`futuras-${c.id}`, t(`${P}.futuras.titulo`, { n: futuras.reduce((s, f) => s + f.parcelas, 0) }), futuras.length
          ? h("ul", { class: "car-futuras" }, futuras.map((f) => h("li", null, h("b", null, fmt.mes(f.ym)), h("span", null, t(`${P}.futuras.item`, { n: f.parcelas, venc: fmt.data(f.vencimento) })), h("span", { class: "car-valor" }, R(f.centavos)))))
          : h("p", { class: "fin-vazio" }, t(`${P}.futuras.vazio`))));
    }
    function listaItens(d, c, ym) {
      const itens = itensDaFatura(c, d.lancamentos, ym);
      if (!itens.length) return h("p", { class: "fin-vazio" }, t(`${P}.itens.vazio`));
      return h("ul", { class: "car-itens" }, itens.map((l) => h("li", { class: `is-${l.tipo}` },
        h("span", { class: "car-item-data" }, fmt.dataCurta(l.data)),
        h("span", { class: "car-item-desc" }, l.descricao || nomeCat(l.categoriaId), l.parcela ? h("span", { class: "fin-etq" }, t(`${P}.itens.parcela`, { n: l.parcela.n, de: l.parcela.de })) : null, l.tipo === "estorno" ? h("span", { class: "fin-etq" }, t(`${P}.itens.estorno`)) : null),
        h("span", { class: ["car-valor", l.tipo === "estorno" ? "is-entrada" : "is-saida"] }, R(l.tipo === "estorno" ? l.centavos : -l.centavos, { sinal: true })),
        l.tipo === "despesa" ? h("button", { type: "button", class: "fin-btn fin-btn-sec fin-btn-peq", "aria-label": `${t(`${P}.estorno.botao`)} · ${l.descricao || fmt.data(l.data)}`, onClick: () => abrirEstorno(l.id) }, t(`${P}.estorno.botao`)) : null)));
    }

    // --- calendário ---
    function calendario(d) {
      const ym = ui.ymCalendario, eventos = eventosDoMes(d.cartoes, d.lancamentos, ym, ctx.hoje()), nome = (id) => d.cartoes.find((c) => c.id === id)?.nome ?? "";
      const porDia = new Map();
      for (const e of eventos) porDia.set(e.dia, [...(porDia.get(e.dia) ?? []), e]);
      const ICONE_EV = { vence: "▼", fecha: "◆" };
      const diaSemana = (i) => fmt.diaDaSemana(`2026-06-0${i + 1}`); // 2026-06-01 é segunda
      const hojeDia = mesDe(ctx.hoje()) === ym ? Number(ctx.hoje().slice(8, 10)) : null;
      const nav = (k, rotulo) => h("button", { type: "button", class: "fin-btn fin-btn-sec fin-btn-peq", "aria-label": rotulo, "data-foco": `cal-${k}`, onClick: () => { ui.ymCalendario = somarMeses(ui.ymCalendario, k); render(); } }, k < 0 ? "‹" : "›");
      return h("section", { class: "fin-sec car-calendario" },
        h("div", { class: "fin-sec-cab" }, h("h3", null, t(`${P}.calendario.titulo`, { mes: fmt.mesLongo(ym) })), h("div", { class: "car-nav" }, nav(-1, t(`${P}.calendario.anterior`)), nav(1, t(`${P}.calendario.proximo`)))),
        h("table", { class: "car-grade" }, h("caption", { class: "fin-sr" }, t(`${P}.calendario.legenda`)),
          h("thead", null, h("tr", null, Array.from({ length: 7 }, (_, i) => h("th", { scope: "col" }, diaSemana(i))))),
          h("tbody", null, gradeDoMes(ym).map((sem) => h("tr", null, sem.map((dia) => {
            if (dia == null) return h("td", { class: "is-fora" });
            const evs = porDia.get(dia) ?? [];
            return h("td", { class: ["car-dia", evs.length ? "tem-evento" : null, dia === hojeDia ? "is-hoje" : null] },
              h("span", { class: "car-dia-n" }, String(dia)),
              evs.map((e) => h("span", { class: ["car-ev", `is-${e.tipo}`], title: `${nome(e.cartaoId)} · ${t(`${P}.calendario.${e.tipo}`)}` }, h("span", { "aria-hidden": "true" }, ICONE_EV[e.tipo]), h("span", { class: "fin-sr" }, `${nome(e.cartaoId)} ${t(`${P}.calendario.${e.tipo}`)}`))));
          }))))),
        h("p", { class: "car-legenda" }, h("span", null, h("span", { "aria-hidden": "true" }, ICONE_EV.vence), " ", t(`${P}.calendario.vence`)), h("span", null, h("span", { "aria-hidden": "true" }, ICONE_EV.fecha), " ", t(`${P}.calendario.fecha`))),
        eventos.length ? h("ul", { class: "car-eventos" }, eventos.map((e) => h("li", null, h("b", null, fmt.dataCurta(e.data)), h("span", null, `${nome(e.cartaoId)} · ${t(`${P}.calendario.${e.tipo}`)}`, e.tipo === "vence" ? ` · ${fmt.mes(e.ym)}` : ""), e.tipo === "vence" ? h("span", { class: "car-valor" }, R(e.centavos), " ", chipStatus(e.status)) : null))) : h("p", { class: "fin-vazio" }, t(`${P}.calendario.vazio`)));
    }

    function render() {
      const d = ctx.estado();
      const foco = document.activeElement?.closest?.(".tela-cartoes") ? document.activeElement.dataset.foco : null;
      // `append` do DOM não achata lista nem pula null (viraria o texto "null[object HTMLElement]"): filtra antes.
      limpar(raiz).append(...[
        h("div", { class: "fin-sec-cab" }, h("h2", { class: "fin-titulo" }, t(`${P}.titulo`)),
          d.contas.length ? h("button", { type: "button", class: "fin-btn", "data-foco": "novo", onClick: () => abrirCartao(null) }, t(`${P}.novo`)) : null),
        aviso,
        d.contas.length ? null : ctx.estadoVazio({ icone: "cartoes", titulo: t("vazio.cartoes_sem_conta.titulo"), texto: t("vazio.cartoes_sem_conta.texto"), acoes: [{ rotulo: t("vazio.cartoes_sem_conta.acao"), ir: "patrimonio" }] }),
        d.cartoes.length ? d.cartoes.map((c) => blocoCartao(d, c)) : d.contas.length ? ctx.estadoVazio({ icone: "cartoes", titulo: t("vazio.cartoes_sem_cartao.titulo"), texto: t("vazio.cartoes_sem_cartao.texto"), acoes: [{ rotulo: t(`${P}.novo`), icone: "lancar", onclick: () => abrirCartao(null) }] }) : null,
        d.cartoes.length ? calendario(d) : null,
        dlgCartao.dialogo, dlgPagar.dialogo, dlgEstorno.dialogo,
      ].flat().filter(Boolean));
      if (foco) raiz.querySelector(`[data-foco="${foco}"]`)?.focus();
    }
    render();
    return { elemento: raiz, atualizar() { render(); } };
  },
};
