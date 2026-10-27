// Tela Finanças: período único no topo; entradas · saídas · sobrou; orçamento × real em bullets (ícone + texto,
// nunca só cor); para onde foi; tendência por categoria; entradas × saídas em 6 meses; projeção de fluxo com o
// menor saldo e a data; lista de lançamentos com busca, filtros, editar, apagar com Desfazer e classificar em
// dois toques. Toda regra financeira vem dos módulos v2 (`esquema`, `orcamento`, `fluxo`, `recorrencia`); aqui
// só se agrupa para mostrar. Fala com o app só por `ctx`; texto só por `t()`; nenhum atributo `style`.
import { diasEntre, mesDe, somarDias, somarMeses, ultimoDiaDoMes } from "../../../datas.mjs";
import { SEM_CATEGORIA, definir, editar, filtrarLancamentos, remover, resumoMes } from "../../esquema.mjs";
import { estadoLimites, gastoPorCategoria } from "../../orcamento.mjs";
import { projetarFluxo } from "../../fluxo.mjs";
import { confirmarOcorrencia } from "../../recorrencia.mjs";
import { bullet, graficoBarrasH, graficoColunas, graficoLinhaSaldo, sparkline } from "../graficos-financas.mjs";
import { campo, centavosParaCampo, dialogoFormulario, figura, lerCentavos, nomeCategoria, opcoes, textoDoErro } from "./financas-comum.mjs";

const P = "financas";
export const MODOS = ["mes", "30d", "90d", "12m"];
export const DIAS_FLUXO = [30, 60, 90];
const DESFAZER_MS = 5000;

// ---------- lógica de apresentação (pura, testada em Node) ----------
// Intervalo [de, ate] do período escolhido e o mês de referência (orçamento e tendência são mensais).
export function intervaloDoPeriodo({ modo, ym }, hoje) {
  if (modo === "mes") return { de: `${ym}-01`, ate: ultimoDiaDoMes(ym), ymRef: ym };
  const n = modo === "30d" ? 30 : modo === "90d" ? 90 : null;
  if (n) return { de: somarDias(hoje, -(n - 1)), ate: hoje, ymRef: mesDe(hoje) };
  return { de: `${somarMeses(mesDe(hoje), -11)}-01`, ate: hoje, ymRef: mesDe(hoje) };
}

// Mesmas regras de `resumoMes` (transferência fora, só efetivado, estorno abate na categoria da compra),
// num intervalo de dias em vez de um mês. É agregação de tela: a regra fica no esquema.
export function resumoIntervalo(d, de, ate, { moeda = d.perfil?.moedaPadrao ?? "BRL" } = {}) {
  let receitas = 0, despesas = 0;
  const cat = {};
  const compra = (id) => d.lancamentos.find((l) => l.id === id);
  for (const l of d.lancamentos) {
    if (l.data < de || l.data > ate || l.moeda !== moeda || l.tipo === "transferencia" || l.status !== "efetivado") continue;
    if (l.tipo === "receita") receitas += l.centavos;
    else if (l.tipo === "despesa") { despesas += l.centavos; const k = l.categoriaId ?? SEM_CATEGORIA; cat[k] = (cat[k] ?? 0) + l.centavos; }
    else { despesas -= l.centavos; const k = l.categoriaId ?? compra(l.refId)?.categoriaId; if (k) cat[k] = (cat[k] ?? 0) - l.centavos; }
  }
  const saldo = receitas - despesas;
  return {
    receitas, despesas, saldo, taxaPoupancaBp: receitas > 0 ? Math.round((saldo / receitas) * 10000) : null,
    porCategoria: Object.entries(cat).filter(([, v]) => v > 0).map(([categoriaId, centavos]) => ({ categoriaId, centavos })).sort((a, b) => b.centavos - a.centavos),
  };
}

// Meses para o seletor: do mais antigo com lançamento até o mais recente (ou hoje), do mais novo ao mais velho.
export function mesesDisponiveis(lancamentos, hoje, maximo = 36) {
  let menor = mesDe(hoje), maior = mesDe(hoje);
  for (const l of lancamentos) { const m = mesDe(l.data); if (m < menor) menor = m; if (m > maior) maior = m; }
  const lista = [];
  for (let m = maior; m >= menor && lista.length < maximo; m = somarMeses(m, -1)) lista.push(m);
  return lista;
}

export const mesesAte = (ymRef, n) => Array.from({ length: n }, (_, i) => somarMeses(ymRef, i - (n - 1)));

// Entradas × saídas por mês (resumoMes do esquema), do mais antigo ao de referência.
export const serieMensal = (d, ymRef, n = 6) => mesesAte(ymRef, n).map((ym) => { const r = resumoMes(d, ym); return { ym, receitas: r.receitas, despesas: r.despesas, saldo: r.saldo }; });

// Categorias com mais gasto no período (até `maximo`), cada uma com o gasto mês a mês (small multiples).
export function tendenciaPorCategoria(lancamentos, ymRef, { meses = 6, maximo = 6 } = {}) {
  const yms = mesesAte(ymRef, meses), porMes = yms.map((ym) => gastoPorCategoria(lancamentos, ym));
  const total = {};
  for (const g of porMes) for (const [k, v] of Object.entries(g)) if (k !== "null" && k !== "undefined") total[k] = (total[k] ?? 0) + v;
  return Object.entries(total).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, maximo)
    .map(([categoriaId, soma]) => ({ categoriaId, soma, valores: porMes.map((g) => Math.max(0, g[categoriaId] ?? 0)) }));
}

// Mais recente primeiro; empate de data por id para a ordem não pular entre renderizações.
export const ordenarRecentes = (lista) => [...lista].sort((a, b) => (a.data > b.data ? -1 : a.data < b.data ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

export const tagsDe = (lancamentos) => [...new Set(lancamentos.flatMap((l) => l.tags ?? []))].sort();

// Lista da tela: busca e filtros do esquema, dentro do intervalo, menos os que estão esperando o "Desfazer".
export function lancamentosDaLista(d, { busca, filtros, de, ate, ocultos = new Set() }) {
  const lista = filtrarLancamentos(d, { texto: busca || undefined, de, ate, ...Object.fromEntries(Object.entries(filtros ?? {}).filter(([, v]) => v)) });
  return ordenarRecentes(lista.filter((l) => !ocultos.has(l.id)));
}

// Sinal e classe do valor: entrada e estorno somam (azul), saída subtrai (laranja), transferência é neutra.
export const sinalDoLancamento = (l) => (l.tipo === "transferencia" ? 0 : l.tipo === "despesa" ? -1 : 1);

// ---------- a tela ----------
export const tela = {
  id: "financas", titulo: "financas.titulo", icone: "chart", grupo: "principal", ordem: 20,
  css: ["/css/financas-comum.css", "/css/financas.css"], i18n: "/js/v2/ui/telas/financas.i18n.mjs",
  montar(ctx) {
    const { h, t, fmt, limpar } = ctx;
    const ui = { modo: "mes", ym: mesDe(ctx.hoje()), busca: "", filtros: {}, dias: 30, abertos: new Set() };
    const pendentes = new Map(); // id → { timer, lancamento }: apagar de verdade só depois do prazo do Desfazer
    const raiz = h("section", { class: "tela-financas" });
    const aviso = h("p", { class: "fin-aviso", role: "status" }); // único aria-live da tela
    let largura = 360, observador = null;

    const R = (c, o) => fmt.moeda(c, "BRL", o);
    const mesCurto = (ym) => fmt.mes(ym).split(/\s/)[0]; // "out de 26" → "out" no eixo (6 colunas em 300 px não cabem o ano); o ano fica na tabela
    const nomeCat = (id) => nomeCategoria(ctx.estado().categorias, id, t, P);
    const nomeOnde = (d, l) => {
      if (l.cartaoId) return d.cartoes.find((c) => c.id === l.cartaoId)?.nome ?? "";
      return d.contas.find((c) => c.id === l.contaId)?.nome ?? "";
    };
    const falhou = (e) => { aviso.textContent = textoDoErro(e, t, P); };
    const mudar = (fn) => Promise.resolve().then(() => ctx.mudar(fn)).catch(falhou);
    const detalhes = (chave, resumo, ...conteudo) => {
      const el = h("details", { class: "fin-tabela", open: ui.abertos.has(chave) }, h("summary", null, resumo), ...conteudo);
      el.addEventListener("toggle", () => { if (el.open) ui.abertos.add(chave); else ui.abertos.delete(chave); });
      return el;
    };

    // --- período ---
    function periodo(d) {
      const sel = h("select", { class: "fin-select", id: "fin-mes", onChange: (e) => { ui.modo = "mes"; ui.ym = e.target.value; render(); } },
        opcoes(h, mesesDisponiveis(d.lancamentos, ctx.hoje()).map((ym) => [ym, fmt.mesLongo(ym)]), ui.modo === "mes" ? ui.ym : "__"));
      if (ui.modo !== "mes") sel.prepend(h("option", { value: "__", selected: true }, t(`${P}.periodo.mes`)));
      const botoes = h("div", { class: "fin-seg", role: "group", "aria-label": t(`${P}.periodo.grupo`) },
        MODOS.slice(1).map((m) => h("button", { type: "button", class: "fin-seg-btn", "aria-pressed": String(ui.modo === m), "data-foco": `modo-${m}`, onClick: () => { ui.modo = m; render(); } }, t(`${P}.periodo.${m}`))));
      return h("div", { class: "fin-periodo" }, h("label", { class: "fin-campo fin-campo-mes", for: "fin-mes" }, h("span", null, t(`${P}.periodo.rotulo`)), sel), botoes);
    }

    // --- KPI ---
    function kpi(r) {
      const tile = (rotulo, valor, sub, classe) => h("div", { class: ["fin-tile", classe] }, h("span", { class: "fin-tile-rotulo" }, rotulo), h("b", { class: "fin-tile-valor" }, valor), sub ? h("small", null, sub) : null);
      return h("div", { class: "fin-kpi" },
        tile(t(`${P}.kpi.entradas`), R(r.receitas), null, "fin-tile-entrada"),
        tile(t(`${P}.kpi.saidas`), R(r.despesas), null, "fin-tile-saida"),
        tile(t(`${P}.kpi.sobrou`), R(r.saldo, { sinal: true }), r.taxaPoupancaBp == null ? t(`${P}.kpi.sem_receita`) : t(`${P}.kpi.taxa_poupanca`, { pct: fmt.percentualBp(r.taxaPoupancaBp, 0) }), r.saldo < 0 ? "fin-tile-neg" : "fin-tile-pos"));
    }

    // --- orçamento × real ---
    const ICONE_ORC = { ok: "✓", atencao: "◐", passou: "→", sem_limite: "–" };
    const dlgLimites = dialogoFormulario(h, {
      titulo: t(`${P}.orc.dialogo.titulo`), rotuloSalvar: t(`${P}.orc.salvar`), rotuloCancelar: t(`${P}.orc.cancelar`), classe: "fin-dlg-limites",
      corpo: () => {
        const d = ctx.estado();
        return h("div", { class: "fin-form-grade" }, h("p", { class: "fin-ajuda" }, t(`${P}.orc.dialogo.ajuda`)),
          d.categorias.filter((c) => c.tipo === "despesa").map((c) => campo(h, nomeCat(c.id),
            h("input", { name: `lim:${c.id}`, inputmode: "decimal", placeholder: t(`${P}.orc.sem_limite`), value: d.orcamento.limites[c.id] ? centavosParaCampo(d.orcamento.limites[c.id], ctx.idioma()) : "" }))));
      },
      aoEnviar: async (form) => {
        const limites = {};
        for (const [k, v] of new FormData(form)) {
          if (!k.startsWith("lim:") || !String(v).trim()) continue;
          const c = lerCentavos(v);
          if (c == null) throw t(`${P}.orc.limite_invalido`, { categoria: nomeCat(k.slice(4)) });
          limites[k.slice(4)] = c;
        }
        await ctx.mudar((d) => definir(d, "orcamento", { limites }));
      },
    });
    function orcamento(d, ymRef) {
      const linhas = estadoLimites({ lancamentos: d.lancamentos, ym: ymRef, limites: d.orcamento.limites ?? {} });
      const cab = h("div", { class: "fin-sec-cab" }, h("h3", null, t(`${P}.orc.titulo`, { mes: fmt.mesLongo(ymRef) })),
        h("button", { type: "button", class: "fin-btn fin-btn-sec", "data-foco": "orc-editar", onClick: () => dlgLimites.abrir() }, t(`${P}.orc.editar`)));
      if (!linhas.length) return h("section", { class: "fin-sec" }, cab, ctx.estadoVazio({ icone: "metas", titulo: t("vazio.financas_orcamento.titulo"), texto: t("vazio.financas_orcamento.texto") }));
      return h("section", { class: "fin-sec" }, cab, h("ul", { class: "fin-orc" }, linhas.map((o) => {
        const nome = nomeCat(o.categoriaId), estado = t(`${P}.orc.${o.estado}`);
        return h("li", { class: ["fin-orc-item", `is-${o.estado}`] },
          h("div", { class: "fin-orc-topo" }, h("b", null, nome), h("span", { class: "fin-orc-estado" }, h("span", { class: "fin-ic", "aria-hidden": "true" }, ICONE_ORC[o.estado]), " ", estado)),
          bullet({ gasto: o.gastoCentavos, limite: o.limiteCentavos, titulo: `${nome}: ${estado}`, desc: t(`${P}.orc.bullet_desc`, { gasto: R(o.gastoCentavos), limite: R(o.limiteCentavos) }) }),
          h("small", { class: "fin-orc-sub" }, t(`${P}.orc.de`, { gasto: R(o.gastoCentavos), limite: R(o.limiteCentavos), pct: o.pct == null ? "–" : `${fmt.numero(o.pct)}%` })));
      })));
    }

    // --- para onde foi ---
    function destino(r) {
      const sec = h("section", { class: "fin-sec" }, h("h3", null, t(`${P}.destino.titulo`)));
      if (!r.porCategoria.length) return sec.appendChild(h("p", { class: "fin-vazio" }, t(`${P}.destino.vazio`))) && sec;
      const itens = r.porCategoria.map((c) => ({ rotulo: nomeCat(c.categoriaId), valor: c.centavos, tip: t(`${P}.destino.pct`, { cat: nomeCat(c.categoriaId), valor: R(c.centavos), pct: fmt.numero((c.centavos / Math.max(1, r.despesas)) * 100) }) }));
      sec.append(figura(h, {
        grafico: graficoBarrasH({ itens, fmt: (v) => R(v), largura, titulo: t(`${P}.destino.titulo`), desc: t(`${P}.destino.desc`, { n: itens.length }) }),
        leitura: itens[0]?.tip, rotuloTabela: t(`${P}.tabela.ver`),
        tabela: { cabecalho: [t(`${P}.tabela.categoria`), t(`${P}.tabela.valor`)], linhas: itens.map((i) => [i.rotulo, R(i.valor)]) },
      }));
      return sec;
    }

    // --- tendência por categoria ---
    function tendencia(d, ymRef) {
      const linhas = tendenciaPorCategoria(d.lancamentos, ymRef), yms = mesesAte(ymRef, 6);
      const sec = h("section", { class: "fin-sec" }, h("h3", null, t(`${P}.tendencia.titulo`)));
      if (!linhas.length) return sec.appendChild(h("p", { class: "fin-vazio" }, t(`${P}.tendencia.vazio`))) && sec;
      sec.append(h("ul", { class: "fin-multiplos" }, linhas.map((l) => {
        const nome = nomeCat(l.categoriaId), ultimo = l.valores[l.valores.length - 1];
        return h("li", null, h("span", { class: "fin-multiplo-nome" }, nome),
          sparkline({ valores: l.valores, largura: 200, titulo: nome, desc: t(`${P}.tendencia.desc`, { cat: nome, de: fmt.mes(yms[0]), ate: fmt.mes(ymRef) }), rotuloFim: R(ultimo) }));
      })), detalhes("tendencia", t(`${P}.tabela.ver`), h("div", { class: "fin-rolar" }, h("table", null,
        h("thead", null, h("tr", null, h("th", { scope: "col" }, t(`${P}.tabela.categoria`)), yms.map((ym) => h("th", { scope: "col" }, fmt.mes(ym))))),
        h("tbody", null, linhas.map((l) => h("tr", null, h("th", { scope: "row" }, nomeCat(l.categoriaId)), l.valores.map((v) => h("td", null, R(v))))))))));
      return sec;
    }

    // --- entradas × saídas em 6 meses ---
    function seisMeses(d, ymRef) {
      const serie = serieMensal(d, ymRef), tip = (m) => t(`${P}.meses.tip`, { mes: fmt.mes(m.ym), e: R(m.receitas), s: R(m.despesas), saldo: R(m.saldo, { sinal: true }) });
      // Sem nenhum valor, o eixo viraria "0 0 0 0 0": melhor dizer que não há dado.
      if (!serie.some((m) => m.receitas || m.despesas)) return h("section", { class: "fin-sec" }, h("h3", null, t(`${P}.meses.titulo`)), h("p", { class: "fin-vazio" }, t(`${P}.meses.vazio`)));
      return h("section", { class: "fin-sec" }, h("h3", null, t(`${P}.meses.titulo`)),
        h("div", { class: "fin-legenda" }, h("span", null, h("i", { class: "fin-q s1", "aria-hidden": "true" }), t(`${P}.legenda.entradas`)), h("span", null, h("i", { class: "fin-q s2", "aria-hidden": "true" }), t(`${P}.legenda.saidas`))),
        figura(h, {
          grafico: graficoColunas({ largura, series: [{ classe: "s1" }, { classe: "s2" }], fmtY: (v) => fmt.numero(v / 100), titulo: t(`${P}.meses.titulo`), desc: t(`${P}.meses.desc`),
            grupos: serie.map((m) => ({ rotulo: mesCurto(m.ym), valores: [m.receitas, m.despesas], tip: tip(m) })) }),
          leitura: tip(serie[serie.length - 1]), rotuloTabela: t(`${P}.tabela.ver`),
          tabela: { cabecalho: [t(`${P}.tabela.mes`), t(`${P}.tabela.entradas`), t(`${P}.tabela.saidas`), t(`${P}.tabela.sobrou`)], linhas: serie.map((m) => [fmt.mes(m.ym), R(m.receitas), R(m.despesas), R(m.saldo, { sinal: true })]) },
        }));
    }

    // --- projeção de fluxo ---
    function fluxo(d) {
      const sec = h("section", { class: "fin-sec" }, h("div", { class: "fin-sec-cab" }, h("h3", null, t(`${P}.fluxo.titulo`)),
        h("div", { class: "fin-seg", role: "group", "aria-label": t(`${P}.fluxo.grupo`) }, DIAS_FLUXO.map((n) => h("button", { type: "button", class: "fin-seg-btn", "aria-pressed": String(ui.dias === n), "data-foco": `dias-${n}`, onClick: () => { ui.dias = n; render(); } }, t(`${P}.fluxo.dias`, { n }))))));
      if (!d.contas.some((c) => !c.arquivada)) return sec.appendChild(h("p", { class: "fin-vazio" }, t(`${P}.fluxo.sem_contas`))) && sec;
      const p = projetarFluxo({ contas: d.contas, lancamentos: d.lancamentos, recorrencias: d.recorrencias, cartoes: d.cartoes, hoje: ctx.hoje(), dias: ui.dias });
      const pontos = p.serie.map((s) => ({ y: s.saldoCentavos, tip: t(`${P}.fluxo.tip`, { data: fmt.dataCurta(s.data), saldo: R(s.saldoCentavos, { sinal: true }) }) }));
      const iMenor = p.serie.findIndex((s) => s.data === p.dataDoMenorSaldo);
      const marcasX = [0, Math.floor(p.serie.length / 2), p.serie.length - 1].map((i) => ({ i, texto: fmt.dataCurta(p.serie[i].data) }));
      const frase = p.primeiroDiaNegativo ? t(`${P}.fluxo.negativo`, { data: fmt.data(p.primeiroDiaNegativo) }) : t(`${P}.fluxo.ok`, { n: ui.dias });
      sec.append(h("p", { class: "fin-fluxo-resumo" }, h("span", { class: "fin-ic", "aria-hidden": "true" }, p.primeiroDiaNegativo ? "◐" : "✓"), " ", t(`${P}.fluxo.menor`, { valor: R(p.menorSaldoCentavos, { sinal: true }), data: fmt.data(p.dataDoMenorSaldo) }), " ", frase),
        figura(h, {
          grafico: graficoLinhaSaldo({ pontos, indiceMenor: iMenor, xRotulos: marcasX, fmtY: (v) => fmt.numero(v / 100), largura, titulo: t(`${P}.fluxo.titulo`), desc: t(`${P}.fluxo.desc`, { n: ui.dias, hoje: R(p.saldoHojeCentavos), menor: R(p.menorSaldoCentavos), data: fmt.data(p.dataDoMenorSaldo) }), rotuloMenor: R(p.menorSaldoCentavos, { sinal: true }) }),
          leitura: t(`${P}.fluxo.hoje`, { valor: R(p.saldoHojeCentavos, { sinal: true }) }), rotuloTabela: t(`${P}.tabela.ver`),
          tabela: { cabecalho: [t(`${P}.tabela.data`), t(`${P}.tabela.entradas`), t(`${P}.tabela.saidas`), t(`${P}.tabela.saldo`)], linhas: p.serie.filter((s) => s.entradasCentavos || s.saidasCentavos || s.data === p.hoje || s.data === p.dataDoMenorSaldo).map((s) => [fmt.data(s.data), R(s.entradasCentavos), R(s.saidasCentavos), R(s.saldoCentavos, { sinal: true })]) },
        }));
      return sec;
    }

    // --- lista de lançamentos ---
    const dlgEditar = dialogoFormulario(h, {
      titulo: t(`${P}.editar.titulo`), rotuloSalvar: t(`${P}.editar.salvar`), rotuloCancelar: t(`${P}.editar.cancelar`),
      corpo: (form) => {
        const d = ctx.estado(), l = d.lancamentos.find((x) => x.id === form.dataset.id);
        if (!l) return h("p", null, t(`${P}.categoria_removida`));
        const simples = l.tipo === "receita" || l.tipo === "despesa";
        const onde = [...d.contas.filter((c) => !c.arquivada).map((c) => [`conta:${c.id}`, t(`${P}.editar.onde_conta`, { nome: c.nome })]), ...d.cartoes.map((c) => [`cartao:${c.id}`, t(`${P}.editar.onde_cartao`, { nome: c.nome })])];
        return h("div", { class: "fin-form-grade" },
          campo(h, t(`${P}.editar.data`), h("input", { name: "data", type: "date", required: true, value: l.data })),
          campo(h, t(`${P}.editar.valor`), h("input", { name: "valor", inputmode: "decimal", required: true, value: centavosParaCampo(l.centavos, ctx.idioma()) })),
          campo(h, t(`${P}.editar.descricao`), h("input", { name: "descricao", maxlength: 200, value: l.descricao ?? "" })),
          simples ? campo(h, t(`${P}.editar.categoria`), h("select", { name: "categoriaId" }, opcoes(h, d.categorias.filter((c) => c.tipo === l.tipo).map((c) => [c.id, nomeCat(c.id)]), l.categoriaId ?? ""))) : null,
          simples ? campo(h, t(`${P}.editar.onde`), h("select", { name: "onde" }, opcoes(h, onde, l.cartaoId ? `cartao:${l.cartaoId}` : `conta:${l.contaId}`))) : null,
          l.tipo === "transferencia" && !l.cartaoId ? campo(h, t(`${P}.editar.conta_destino`), h("select", { name: "contaDestinoId" }, opcoes(h, d.contas.map((c) => [c.id, c.nome]), l.contaDestinoId))) : null,
          campo(h, t(`${P}.editar.tags`), h("input", { name: "tags", value: (l.tags ?? []).join(", "), placeholder: t(`${P}.editar.tags_ajuda`) })),
          l.status !== "cancelado" ? campo(h, t(`${P}.editar.status`), h("select", { name: "status" }, opcoes(h, [["efetivado", t(`${P}.status.efetivado`)], ["previsto", t(`${P}.status.previsto`)]], l.status))) : null);
      },
      aoEnviar: async (form) => {
        const v = Object.fromEntries(new FormData(form)), centavos = lerCentavos(v.valor);
        if (centavos == null) throw t(`${P}.editar.valor_invalido`);
        const m = { data: v.data, centavos, descricao: String(v.descricao ?? "").trim(), tags: String(v.tags ?? "").split(",").map((s) => s.trim()).filter(Boolean) };
        if (v.categoriaId != null) m.categoriaId = v.categoriaId;
        if (v.onde) { const [tipo, id] = v.onde.split(":"); if (tipo === "conta") { m.contaId = id; m.cartaoId = null; } else { m.cartaoId = id; m.contaId = null; } }
        if (v.contaDestinoId) m.contaDestinoId = v.contaDestinoId;
        if (v.status) m.status = v.status;
        try { await ctx.mudar((d) => editar(d, "lancamentos", form.dataset.id, m)); } catch (e) { throw textoDoErro(e, t, P); }
      },
    });

    function apagar(l) {
      const id = l.id;
      const timer = setTimeout(() => { pendentes.delete(id); mudar((d) => remover(d, "lancamentos", id)); }, DESFAZER_MS);
      pendentes.set(id, { timer, lancamento: l });
      limpar(aviso).append(t(`${P}.lista.apagado`), " ", h("button", { type: "button", class: "fin-btn fin-btn-sec fin-btn-desfazer", "data-foco": "desfazer", onClick: () => { clearTimeout(timer); pendentes.delete(id); aviso.textContent = ""; render(); } }, t(`${P}.lista.desfazer`)));
      render();
      aviso.querySelector("button")?.focus();
    }
    const confirmar = (id) => mudar((d) => ({ ...d, lancamentos: confirmarOcorrencia(d.lancamentos, id, { agora: ctx.agora() }) }));
    const classificar = (id, categoriaId) => mudar((d) => editar(d, "lancamentos", id, { categoriaId }));

    function linha(d, l) {
      const sinal = sinalDoLancamento(l), semCat = l.tipo !== "transferencia" && l.tipo !== "estorno" && l.categoriaId == null;
      const etiquetas = [];
      if (l.status === "previsto") etiquetas.push(h("span", { class: "fin-etq is-previsto" }, t(`${P}.status.previsto`)));
      if (l.status === "cancelado") etiquetas.push(h("span", { class: "fin-etq is-cancelado" }, t(`${P}.status.cancelado`)));
      if (l.tipo === "transferencia") etiquetas.push(h("span", { class: "fin-etq" }, t(`${P}.tipo.transferencia`)));
      if (l.tipo === "estorno") etiquetas.push(h("span", { class: "fin-etq" }, t(`${P}.tipo.estorno`)));
      if (l.parcela) etiquetas.push(h("span", { class: "fin-etq" }, t(`${P}.lista.parcela`, { n: l.parcela.n, de: l.parcela.de })));
      if (l.origem === "importacao") etiquetas.push(h("span", { class: "fin-etq" }, t(`${P}.lista.importado`)));
      const meta = [];
      if (l.tipo === "transferencia") meta.push(l.cartaoId ? `${nomeOnde(d, { contaId: l.contaId })} → ${nomeOnde(d, l)}` : `${nomeOnde(d, l)} → ${d.contas.find((c) => c.id === l.contaDestinoId)?.nome ?? ""}`);
      else { if (!semCat) meta.push(nomeCat(l.categoriaId ?? d.lancamentos.find((x) => x.id === l.refId)?.categoriaId)); meta.push(nomeOnde(d, l)); }
      for (const tg of l.tags ?? []) meta.push(`#${tg}`);
      const classificador = semCat ? h("label", { class: "fin-classificar" }, h("span", null, t(`${P}.lista.classificar`)),
        h("select", { class: "fin-select", onChange: (e) => { if (e.target.value) classificar(l.id, e.target.value); } },
          h("option", { value: "" }, t(`${P}.sem_categoria`)), opcoes(h, d.categorias.filter((c) => c.tipo === l.tipo).map((c) => [c.id, nomeCat(c.id)]), ""))) : null;
      return h("li", { class: ["fin-lanc", `is-${l.tipo}`, semCat ? "is-sem-categoria" : null, l.status === "cancelado" ? "is-cancelado" : null], "data-id": l.id },
        h("div", { class: "fin-lanc-info" },
          h("span", { class: "fin-lanc-data" }, fmt.dataCurta(l.data)),
          h("span", { class: "fin-lanc-desc" }, l.descricao || (l.tipo === "transferencia" ? t(`${P}.tipo.transferencia`) : nomeCat(l.categoriaId))),
          h("span", { class: "fin-lanc-meta" }, meta.filter(Boolean).join(" · ")),
          etiquetas.length ? h("span", { class: "fin-lanc-etqs" }, etiquetas) : null, classificador),
        h("span", { class: ["fin-lanc-valor", sinal > 0 ? "is-entrada" : sinal < 0 ? "is-saida" : "is-neutro"] }, sinal === 0 ? R(l.centavos) : R(sinal * l.centavos, { sinal: true })),
        h("div", { class: "fin-lanc-acoes" },
          l.status === "previsto" ? h("button", { type: "button", class: "fin-btn fin-btn-peq", onClick: () => confirmar(l.id) }, t(`${P}.lista.confirmar`)) : null,
          h("button", { type: "button", class: "fin-btn fin-btn-sec fin-btn-peq", "aria-label": `${t(`${P}.lista.editar`)} · ${l.descricao || fmt.data(l.data)}`, onClick: () => { dlgEditar.dialogo.querySelector("form").dataset.id = l.id; dlgEditar.abrir(); } }, t(`${P}.lista.editar`)),
          h("button", { type: "button", class: "fin-btn fin-btn-sec fin-btn-peq", "aria-label": `${t(`${P}.lista.apagar`)} · ${l.descricao || fmt.data(l.data)}`, onClick: () => apagar(l) }, t(`${P}.lista.apagar`))));
    }

    let ulLista = null;
    function renderLista(d, intervalo) {
      const itens = lancamentosDaLista(d, { busca: ui.busca, filtros: ui.filtros, de: intervalo.de, ate: intervalo.ate, ocultos: new Set(pendentes.keys()) });
      const semCat = itens.filter((l) => (l.tipo === "despesa" || l.tipo === "receita") && l.categoriaId == null).length;
      const nova = h("div", { class: "fin-lista-corpo" },
        itens.length ? h("p", { class: "fin-lista-contagem" }, t(`${P}.lista.contagem`, { n: itens.length }), semCat ? h("span", { class: "fin-etq is-sem-categoria" }, h("span", { class: "fin-ic", "aria-hidden": "true" }, "?"), " ", t(`${P}.lista.sem_categoria_aviso`, { n: semCat })) : null) : null,
        itens.length ? h("ul", { class: "fin-lancs" }, itens.map((l) => linha(d, l))) : ctx.estadoVazio({ icone: "financas", titulo: t("vazio.financas_lista.titulo"), texto: t("vazio.financas_lista.texto"), acoes: [{ rotulo: t("vazio.financas_lista.acao"), icone: "lancar", ir: "lancar" }] }));
      if (ulLista) ulLista.replaceWith(nova);
      ulLista = nova;
      return nova;
    }
    function lista(d, intervalo) {
      const sel = (nome, rotulo, lista, chave) => campo(h, rotulo, h("select", { class: "fin-select", name: nome, onChange: (e) => { ui.filtros[chave] = e.target.value || null; renderLista(ctx.estado(), intervaloDoPeriodo(ui, ctx.hoje())); } },
        h("option", { value: "" }, t(`${P}.lista.todos`)), opcoes(h, lista, ui.filtros[chave] ?? "")));
      const busca = h("input", { type: "search", class: "fin-busca", id: "fin-busca", value: ui.busca, placeholder: t(`${P}.lista.busca_placeholder`), "data-foco": "busca", onInput: (e) => { ui.busca = e.target.value; renderLista(ctx.estado(), intervaloDoPeriodo(ui, ctx.hoje())); } });
      return h("section", { class: "fin-sec fin-lista" }, h("h3", null, t(`${P}.lista.titulo`)),
        h("label", { class: "fin-campo", for: "fin-busca" }, h("span", null, t(`${P}.lista.busca`)), busca),
        detalhes("filtros", t(`${P}.lista.filtros`), h("div", { class: "fin-filtros" },
          sel("categoriaId", t(`${P}.lista.filtro.categoria`), d.categorias.map((c) => [c.id, nomeCat(c.id)]), "categoriaId"),
          sel("contaId", t(`${P}.lista.filtro.conta`), d.contas.map((c) => [c.id, c.nome]), "contaId"),
          sel("cartaoId", t(`${P}.lista.filtro.cartao`), d.cartoes.map((c) => [c.id, c.nome]), "cartaoId"),
          sel("tipo", t(`${P}.lista.filtro.tipo`), ["receita", "despesa", "transferencia", "estorno"].map((x) => [x, t(`${P}.tipo.${x}`)]), "tipo"),
          sel("tag", t(`${P}.lista.filtro.tag`), tagsDe(d.lancamentos).map((x) => [x, `#${x}`]), "tag"))),
        renderLista(d, intervalo));
    }

    // --- render ---
    function render() {
      const d = ctx.estado(), intervalo = intervaloDoPeriodo(ui, ctx.hoje());
      const foco = document.activeElement?.closest?.(".tela-financas") ? document.activeElement.dataset.foco : null;
      const r = resumoIntervalo(d, intervalo.de, intervalo.ate);
      ulLista = null;
      limpar(raiz).append(h("h2", { class: "fin-titulo" }, t(`${P}.titulo`)), periodo(d), aviso, kpi(r), orcamento(d, intervalo.ymRef), destino(r), tendencia(d, intervalo.ymRef), seisMeses(d, intervalo.ymRef), fluxo(d), lista(d, intervalo), dlgLimites.dialogo, dlgEditar.dialogo);
      if (foco) raiz.querySelector(`[data-foco="${foco}"]`)?.focus();
    }
    function medir() {
      const nova = Math.max(300, Math.min(640, (raiz.clientWidth || 396) - 36));
      if (Math.abs(nova - largura) >= 24) { largura = nova; render(); }
    }
    if (typeof ResizeObserver === "function") { observador = new ResizeObserver(() => medir()); observador.observe(raiz); }
    render();
    return {
      elemento: raiz,
      atualizar() { render(); },
      destruir() {
        observador?.disconnect();
        // Apagar pendente não pode se perder ao trocar de tela: executa agora.
        for (const [id, p] of pendentes) { clearTimeout(p.timer); pendentes.delete(id); mudar((d) => remover(d, "lancamentos", id)); }
      },
    };
  },
};
