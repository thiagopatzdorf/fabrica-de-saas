// Tela Hoje: "Dá para gastar R$ X até <fim do mês>" em uma resposta, no máximo UM alerta, três tiles
// (treinos da semana, peso com sparkline de 7 dias, próximo vencimento), convite do check-in e o placar
// recolhido com a fórmula à vista. Sem contador de semanas consecutivas, sem palavra de culpa: estados são "dentro",
// "perto do limite" e "passou". Texto 100% por t(); nenhuma regra financeira aqui (insumos-hoje.mjs
// monta os números com os motores v2).
import { somarDias } from "../../../datas.mjs";
import { treinosNaSemana } from "../../../shape.mjs";
import { semanasNaMeta } from "../../shape-financas.mjs";
import { alertaHoje, insumosGastarHoje, proximosVencimentos } from "../insumos-hoje.mjs";
import { icone } from "../icones.mjs";
import { lerObjetivo } from "../preferencias.mjs";
import { SLOTS_HOJE } from "../slots-hoje.mjs";

export const tela = {
  id: "hoje",
  titulo: "tela.hoje",
  icone: "hoje",
  grupo: "principal",
  ordem: 10,
  css: ["/css/hoje.css", "/css/insights.css"],
  i18n: "/js/v2/ui/telas/hoje.i18n.mjs",
  montar(ctx) {
    const { h, hs, limpar, t, fmt } = ctx;
    const el = h("div", { class: "tela hoje" });
    const nomeCat = (d, id) => { const c = d.categorias.find((x) => x.id === id); return c && c.id.startsWith("cat-") ? t(`cat.${c.id}`) : c?.nome ?? t("cat.sem-categoria"); };
    // Barra de progresso como SVG (atributo `width`, não `style`): a CSP sem 'unsafe-inline' não reclama e o
    // teste "nenhum style= no DOM" vale à letra. Decorativa: o texto ao lado carrega o número.
    const barra = (pct, classe) => hs("svg", { class: ["barra", classe], viewBox: "0 0 100 8", preserveAspectRatio: "none", "aria-hidden": "true" },
      hs("rect", { class: "fundo", x: 0, y: 0, width: 100, height: 8, rx: 4 }), hs("rect", { class: "cheio", x: 0, y: 0, width: Math.max(0, Math.min(100, pct ?? 0)), height: 8, rx: 4 }));

    function heroi(d, hoje) {
      const g = insumosGastarHoje(d, hoje);
      const vazioDeTudo = !d.lancamentos.length && !d.pesos.length && !d.treinos.length;
      if (vazioDeTudo) {
        // O primeiro passo segue o objetivo escolhido no onboarding: dinheiro, corpo ou os dois.
        const obj = lerObjetivo();
        const principais = obj === "corpo"
          ? [h("button", { type: "button", class: "botao", onclick: () => ctx.navegar("shape") }, icone("peso"), t("hoje.vazio_peso"))]
          : [h("button", { type: "button", class: "botao", onclick: () => ctx.navegar("lancar") }, icone("lancar"), t("hoje.vazio_lancar")),
            obj === "ambos" ? h("button", { type: "button", class: "botao leve", onclick: () => ctx.navegar("shape") }, icone("peso"), t("hoje.vazio_peso")) : null];
        return h("section", { class: "cartao vazio-hoje" },
          h("span", { class: "marca-ouro", "aria-hidden": "true" }),
          h("h2", { id: "hoje-h" }, t(`hoje.vazio_titulo_${obj}`)), h("p", { class: "nota" }, t(`hoje.vazio_texto_${obj}`)),
          h("div", { class: "acoes" }, ...principais,
            h("button", { type: "button", class: "botao leve", onclick: () => ctx.navegar("exemplo") }, icone("exemplo"), t("hoje.vazio_exemplo"))),
          h("p", { class: "passo" }, t("hoje.vazio_passo")));
      }
      if (g.semReceita) {
        return h("section", { class: "cartao heroi sem-receita" },
          h("p", { class: "rot" }, t("hoje.da_para_gastar")),
          h("h2", { id: "hoje-h", class: "gran-texto" }, t("hoje.sem_receita_titulo")),
          h("p", { class: "nota" }, t("hoje.sem_receita_texto")),
          h("button", { type: "button", class: "botao", onclick: () => ctx.navegar("lancar", { tipo: "receita" }) }, icone("lancar"), t("hoje.lancar_receita")),
          g.insumos.gastoVariavelFeito ? h("p", { class: "nota" }, t("hoje.gasto_ate_agora", { valor: fmt.moeda(g.insumos.gastoVariavelFeito) })) : null);
      }
      const acima = g.acimaDoLimite, valor = Math.abs(g.disponivelMesCentavos);
      const medidor = h("div", { class: "medidor", role: "img", "aria-label": `${t("hoje.medidor_tempo", { pct: g.pctTempo })}. ${g.pctGasto == null ? "" : t("hoje.medidor_gasto", { pct: g.pctGasto })}` },
        barra(g.pctTempo, "tempo"), barra(g.pctGasto, "gasto"));
      const legenda = h("div", { class: "medidor-legenda", "aria-hidden": "true" }, h("span", null, h("i", { class: "q tempo" }), t("hoje.medidor_tempo", { pct: g.pctTempo })), g.pctGasto == null ? null : h("span", null, h("i", { class: "q gasto" }), t("hoje.medidor_gasto", { pct: g.pctGasto })));
      const i = g.insumos;
      const ritmo = g.pctGasto == null ? null : g.pctGasto > g.pctTempo + 5 ? "hoje.ritmo_a_frente" : g.pctGasto < g.pctTempo - 5 ? "hoje.ritmo_atras" : "hoje.ritmo_junto";
      return h("section", { class: ["cartao heroi", acima && "acima"], "aria-labelledby": "hoje-h" },
        h("span", { class: "marca-ouro", "aria-hidden": "true" }),
        h("h2", { id: "hoje-h", class: "rot" }, t(acima ? "hoje.acima_titulo" : "hoje.da_para_gastar")),
        h("p", { class: "gran num" }, acima ? `−${fmt.moeda(valor)}` : fmt.moeda(valor)),
        h("p", { class: "leg" }, t("hoje.ate", { data: fmt.dataCurta(g.fimDoMes) })),
        h("p", { class: "leg num" }, acima ? t("hoje.acima_texto", { valor: fmt.moeda(valor) }) : t("hoje.por_dia", { valor: fmt.moeda(Math.max(0, g.porDiaCentavos)), n: g.diasRestantes })),
        medidor, legenda,
        ritmo ? h("p", { class: "ritmo" }, t(ritmo)) : null,
        h("details", { class: "formula" }, h("summary", null, icone("info"), t("hoje.como_calculado")),
          h("p", null, t("hoje.formula", { receita: fmt.moeda(i.receitaPrevistaMes), fixas: fmt.moeda(i.fixasRestantes), cartao: fmt.moeda(i.parcelasCartaoMes), metas: fmt.moeda(i.aportesMetas), gasto: fmt.moeda(i.gastoVariavelFeito), dias: g.diasRestantes }))));
    }

    function alerta(d, hoje) {
      const a = alertaHoje(d, hoje);
      if (!a) return h("p", { class: "tudo-certo" }, icone("ok"), t("hoje.tudo_certo"));
      let texto;
      if (a.tipo === "fatura") texto = t(a.vencida ? "hoje.alerta_fatura_vencida" : "hoje.alerta_fatura", { cartao: a.cartao, valor: fmt.moeda(a.centavos), data: fmt.dataCurta(a.vencimento) });
      else if (a.tipo === "limite") texto = t("hoje.alerta_limite", { categoria: nomeCat(d, a.categoriaId), gasto: fmt.moeda(a.gasto), limite: fmt.moeda(a.limite) });
      else texto = t("hoje.alerta_saldo", { data: fmt.dataCurta(a.data), valor: fmt.moeda(a.menor) });
      return h("div", { class: "alerta-hoje", role: "status" }, icone("atencao"), h("p", null, h("strong", null, t("hoje.atencao")), " ", texto));
    }

    function sparkline(pesos) {
      if (pesos.length < 2) return null;
      const W = 120, H = 36, kgs = pesos.map((p) => p.kg), min = Math.min(...kgs), max = Math.max(...kgs), faixa = max - min || 1;
      const x = (i) => (i / (pesos.length - 1)) * (W - 6) + 3, y = (kg) => H - 4 - ((kg - min) / faixa) * (H - 8);
      const pts = pesos.map((p, i) => `${x(i).toFixed(1)},${y(p.kg).toFixed(1)}`).join(" ");
      return hs("svg", { class: "sparkline", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-labelledby": "spark-t spark-d" },
        hs("title", { id: "spark-t" }, t("hoje.peso_grafico")),
        hs("desc", { id: "spark-d" }, t("hoje.peso_desc", { n: pesos.length, min: fmt.numero(min, 1), max: fmt.numero(max, 1) })),
        hs("polyline", { points: pts, fill: "none", "stroke-width": "2", "stroke-linejoin": "round", "stroke-linecap": "round" }),
        hs("circle", { cx: x(pesos.length - 1).toFixed(1), cy: y(pesos[pesos.length - 1].kg).toFixed(1), r: "3" }));
    }

    function tiles(d, hoje) {
      const metaTreino = d.metas.find((m) => m.tipo === "treino")?.alvo ?? null;
      const semana = treinosNaSemana(d.treinos, hoje).length;
      const ultimos7 = d.pesos.filter((p) => p.data > somarDias(hoje, -7) && p.data <= hoje);
      const ultimo = d.pesos[d.pesos.length - 1];
      const venc = proximosVencimentos(d, hoje, { limite: 1 })[0];
      const tile = (nome, rot, valor, sub, extra) => h("li", { class: "tile" }, h("div", { class: "tile-cab" }, icone(nome), h("span", null, rot)), h("b", { class: "num" }, valor), extra, sub ? h("small", null, sub) : null);
      return h("ul", { class: "tiles", "aria-label": t("hoje.tiles") },
        tile("treino", t("hoje.treinos"), metaTreino ? t("hoje.treinos_valor", { n: semana, meta: metaTreino }) : String(semana), metaTreino ? t(semana >= metaTreino ? "hoje.treinos_na_meta" : "hoje.treinos_faltam", { n: Math.max(0, metaTreino - semana) }) : t("hoje.treinos_sem_meta")),
        tile("peso", t("hoje.peso"), ultimo ? t("hoje.kg", { n: fmt.numero(ultimo.kg, 1) }) : "—", ultimo ? t("hoje.peso_em", { data: fmt.dataCurta(ultimo.data) }) : t("hoje.peso_sem"), ultimo ? sparkline(ultimos7) : null),
        tile("vence", t("hoje.vence"), venc ? fmt.moeda(venc.centavos) : "—", venc ? t("hoje.vence_item", { nome: venc.nome, data: fmt.dataCurta(venc.data) }) : t("hoje.vence_nada")));
    }

    function checkin(d, hoje) {
      const metaTreino = d.metas.find((m) => m.tipo === "treino")?.alvo ?? 3;
      const s = semanasNaMeta({ treinos: d.treinos, hoje, metaTreinosSemana: metaTreino, n: 8 });
      return h("section", { class: "cartao checkin" }, h("div", { class: "tile-cab" }, icone("checkin"), h("h2", null, t("hoje.checkin_titulo"))),
        h("p", { class: "nota" }, t("hoje.checkin_texto")),
        d.treinos.length ? h("p", { class: "nota semanas" }, t("hoje.checkin_semanas", { n: s.naMeta, de: s.de })) : null,
        h("button", { type: "button", class: "botao leve", onclick: () => ctx.navegar("checkin") }, t("hoje.checkin_botao"), icone("seta")));
    }

    // O placar (v1) puxa financas.mjs e dados.mjs, ~12 KB que só ele usa: chega por import dinâmico, depois da
    // primeira pintura. Um render mais novo invalida o anterior (`vezPlacar`) para resposta velha não sobrescrever.
    let vezPlacar = 0;
    function placarRecolhido(d, hoje) {
      const caixa = h("div", { class: "slot-placar" }), vez = ++vezPlacar;
      import("../../../placar.mjs").then(({ placar }) => { if (vez === vezPlacar) caixa.replaceChildren(blocoPlacar(placar, d, hoje)); }).catch(() => {});
      return caixa;
    }
    function blocoPlacar(placar, d, hoje) {
      const metas = { treinosSemana: d.metas.find((m) => m.tipo === "treino")?.alvo ?? 3, poupancaPct: d.metas.find((m) => m.tipo === "poupanca")?.alvo ?? 20 };
      const ls = d.lancamentos.filter((l) => l.status === "efetivado" && (l.tipo === "receita" || l.tipo === "despesa"));
      const p = placar({ treinos: d.treinos, lancamentos: ls, pesos: d.pesos, metas, hoje });
      return h("details", { class: "formula placar" },
        h("summary", null, icone("metas"), t("hoje.placar", { total: p.total })),
        h("ul", { class: "partes" }, ...p.partes.map((x) => h("li", null, h("span", null, t(`hoje.parte_${x.nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}`)), barra(Math.round(x.valor * 100), "parte"), h("b", { class: "num" }, `${Math.round(x.valor * 100)}%`)))),
        h("p", null, t("hoje.placar_formula"), p.semReceita ? ` ${t("hoje.placar_sem_receita")}` : ""));
    }

    // Ponto de extensão (slots-hoje.mjs): cartões plugados entram logo abaixo do alerta, carregados sob demanda.
    let montados = [];
    const soltar = () => { for (const m of montados) { try { m.destruir?.(); } catch { /* o cartão já era */ } } montados = []; };
    function slotInsights() {
      const caixa = h("div", { class: ["slot-hoje", SLOTS_HOJE.length && "ocupado"], "data-slot": "insights" });
      [...SLOTS_HOJE].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).forEach(async (e) => {
        try { const r = (await e.carregar()).cartao?.montar(ctx); if (r?.elemento) { montados.push(r); caixa.append(r.elemento); } } catch (erro) { console.error(erro); }
      });
      return caixa;
    }
    // Região ao vivo que NÃO é recriada: leitor de tela ouve o resultado novo quando o número muda, e só então.
    const aoVivo = h("p", { class: "oculto", role: "status", "aria-live": "polite" });
    const corpo = h("div", { class: "hoje-corpo" });
    let ultimoResumo = "";
    function anunciar(d, hoje) {
      const g = insumosGastarHoje(d, hoje);
      const texto = d.lancamentos.length && !g.semReceita ? t(g.acimaDoLimite ? "hoje.resumo_acima" : "hoje.resumo", { valor: fmt.moeda(Math.abs(g.disponivelMesCentavos)), data: fmt.dataCurta(g.fimDoMes) }) : "";
      if (texto !== ultimoResumo) { ultimoResumo = texto; aoVivo.textContent = texto; }
    }
    function render() {
      const d = ctx.estado(), hoje = ctx.hoje();
      soltar(); limpar(corpo);
      const vazioDeTudo = !d.lancamentos.length && !d.pesos.length && !d.treinos.length;
      corpo.append(heroi(d, hoje));
      anunciar(d, hoje);
      if (vazioDeTudo) return;
      corpo.append(alerta(d, hoje), slotInsights(), tiles(d, hoje), checkin(d, hoje), placarRecolhido(d, hoje));
    }
    el.append(aoVivo, corpo);
    render();
    return { elemento: el, atualizar: render, destruir: soltar };
  },
};
