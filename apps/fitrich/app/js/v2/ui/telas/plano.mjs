// Tela Plano: planejamento e patrimônio a longo prazo, em cinco abas — para onde vai cada real (base zero com o
// 50/30/20 só como ponto de partida), reserva por estabilidade de renda, quitar dívida (avalanche × bola de neve ×
// híbrido), independência financeira (cenários + Monte Carlo determinístico + marcos) e comparador de renda
// fixa. Toda regra vem de plano.mjs, metas.mjs, dividas.mjs, investimentos.mjs e patrimonio.mjs; aqui só se
// agrupa e apresenta. Estimativa, nunca promessa; sem sequência, sem culpa.
import { definir } from "../../esquema.mjs";
import { despesaEssencialMedia } from "../../metas.mjs";
import { patrimonioLiquido } from "../../patrimonio.mjs";
import { idadeDoSnapshotEmDias } from "../../indices.mjs";
import {
  PERFIS_RISCO, TAXAS_REAIS_PADRAO, TAXAS_RETIRADA, RETIRADA_PADRAO_BP, PRODUTOS_RENDA_FIXA, CAMINHOS_PADRAO,
  alvoIndependencia, atualDaMeta, cenarios, compararQuitacao, compararRendaFixa, despesaMedia, insumosDoPlano, marcos, monteCarlo,
  planoMensal, progressoAlvoBp, receitaMedia, reservaPlano, taxaRealLiquidaHoje,
} from "../../plano.mjs";
import { mesDe } from "../../../datas.mjs";
import { graficoFaixa } from "../graficos-plano.mjs";
import { legenda } from "../graficos-patrimonio.mjs";
import { aviso, barra, campo, centavosDeTexto, dadosExternos, estado, larguraGrafico, nota, numeroDeTexto, secao, selecionar, stat, tabelaIrma, textoDeCentavos, vazio } from "./_comum.mjs";

export const ABAS = ["mensal", "reserva", "dividas", "independencia", "rendafixa"];
export const ESTABILIDADES = ["estavel", "clt", "variavel", "autonomo"];
export const ANOS_PADRAO = 20;
export const PRAZOS_RENDA_FIXA = [90, 180, 365, 720, 1080];

// ---------- lógica de apresentação pura (testada em Node) ----------

// Tudo que as cinco abas precisam, derivado dos dados do app e das escolhas guardadas em `perfil.plano`.
export function derivadosDoPlano(d, { hoje, indices }) {
  const plano = d.perfil.plano ?? {};
  const ym = mesDe(hoje);
  const ext = dadosExternos(d, hoje);
  const liquido = patrimonioLiquido(d, ext).liquido;
  const reservaMeta = d.metas.find((m) => m.tipo === "reserva") ?? null;
  const reservaAtualCentavos = reservaMeta ? atualDaMeta(d, reservaMeta, hoje) : plano.reservaAtualCentavos ?? 0;
  const despEssencial = despesaEssencialMedia(d.lancamentos, d.categorias, ym);
  const despTotal = despesaMedia(d.lancamentos, ym);
  const despBase = despEssencial ?? despTotal;
  const estabilidade = plano.estabilidade ?? "clt";
  const reserva = despBase ? reservaPlano({ despesaMensalCentavos: despBase, atualCentavos: reservaAtualCentavos, estabilidade, dependentes: Boolean(plano.dependentes), rendaUnica: Boolean(plano.rendaUnica) }) : null;
  const receita = receitaMedia(d.lancamentos, ym);
  const renda = plano.rendaCentavos ?? receita ?? null;
  const insumos = insumosDoPlano(d, { hoje, indices, reservaAtualCentavos, reservaAlvoCentavos: reserva?.alvoCentavos ?? 0, despesaEssencialCentavos: despBase });
  const mensal = renda ? planoMensal({ rendaCentavos: renda, necessidadesCentavos: insumos.necessidadesCentavos, minimosDividaCentavos: insumos.minimosDividaCentavos, colchaoFaltaCentavos: insumos.colchaoFaltaCentavos, reservaFaltaCentavos: insumos.reservaFaltaCentavos, dividasCaras: insumos.dividasCaras, metas: insumos.metas }) : null;
  const linhaInvest = mensal?.linhas.find((l) => l.id === "investimento")?.centavos ?? 0;
  const extraDivida = mensal ? mensal.linhas.filter((l) => l.motivo === "divida_cara").reduce((s, l) => s + l.centavos, 0) : 0;
  return {
    plano, ym, liquido, investivel: Math.max(0, liquido), reservaMeta, reservaAtualCentavos, despEssencial, despTotal, despBase, estabilidade, reserva, receita, renda,
    rendaFonte: plano.rendaCentavos != null ? "digitada" : receita != null ? "media" : null, insumos, mensal, extraDivida,
    dividasAtivas: d.dividas.filter((x) => x.saldoCentavos > 0),
    despesaDesejada: plano.despesaDesejadaCentavos ?? despTotal ?? null,
    aporte: plano.aporteMensalCentavos ?? linhaInvest,
    anos: plano.anos ?? ANOS_PADRAO, retiradaBp: plano.retiradaBp ?? RETIRADA_PADRAO_BP, risco: plano.risco ?? "moderado",
    taxas: plano.taxasReaisBp ?? { ...TAXAS_REAIS_PADRAO },
  };
}

// Anos mostrados na tabela-irmã da faixa: de 1 em 1 até 10, de 5 em 5 até 30, de 10 em 10 depois, sempre com o último.
export function anosDaTabela(anos) {
  const passo = anos <= 10 ? 1 : anos <= 30 ? 5 : 10;
  const lista = [];
  for (let a = 0; a <= anos; a += passo) lista.push(a);
  if (lista[lista.length - 1] !== anos) lista.push(anos);
  return lista;
}

// ---------- tela ----------
export const tela = {
  id: "plano", titulo: "plano.titulo", icone: "plano", grupo: "mais", ordem: 55,
  css: ["/css/_telas.css", "/css/plano.css"], i18n: "/js/v2/ui/telas/plano.i18n.mjs",
  montar(ctx) {
    const { h, hs, t, fmt } = ctx;
    const raiz = h("div", { class: "tela-plano" });
    const ui = { aba: "mensal", msg: null, foco: null, extraDivida: null, rf: { principal: "10000,00", dias: "365", taxas: { cdb: "100", lci_lca: "90", tesouro_selic: "0", tesouro_ipca: "7", tesouro_pre: "13" } } };
    const render = () => { ctx.limpar(raiz); raiz.append(...conteudo()); if (ui.foco) { raiz.querySelector(`#${ui.foco}`)?.focus(); ui.foco = null; } };
    const salvarPlano = (patch, foco = null) => {
      ui.foco = foco;
      return ctx.mudar((x) => definir(x, "perfil", { plano: { ...(x.perfil.plano ?? {}), ...patch } }, { agora: ctx.agora }))
        .then(() => { ui.msg = null; })
        .catch((e) => { ui.msg = t("plano.erro", { codigo: (e?.erros ?? []).map((x) => x.codigo).join(", ") || String(e?.message ?? e) }); render(); });
    };
    const moeda = (c) => fmt.moeda(c);
    const meses1 = (meios) => fmt.numero(meios / 2, 1);
    const pct = (bp, casas = 1) => fmt.percentualBp(bp, casas);
    const mesAno = (ym) => fmt.mes(ym);
    // Duração em anos com uma casa ("8,5 anos"): `n` fecha o plural do idioma ("1,5 ano" em pt-BR, "1.5 years" em en).
    const tempo = (chave, meses) => t(chave, { n: meses / 12, anos: fmt.numero(meses / 12, 1) });
    const compacto = new Intl.NumberFormat(fmt.locale, { notation: "compact", maximumFractionDigits: 1 });
    const rotuloMotivo = (l) => t(`plano.linha.${l.motivo}`, { nome: l.nome ?? "" });

    function conteudo() {
      const d = ctx.estado(), dv = derivadosDoPlano(d, { hoje: ctx.hoje(), indices: ctx.indices });
      const partes = [];
      if (ui.msg) partes.push(aviso(h, ui.msg));
      partes.push(cabecalho(dv));
      partes.push(abas());
      const painel = { mensal: abaMensal, reserva: abaReserva, dividas: abaDividas, independencia: abaIndependencia, rendafixa: abaRendaFixa }[ui.aba](d, dv);
      partes.push(h("div", { role: "tabpanel", id: `plano-painel-${ui.aba}`, "aria-labelledby": `plano-aba-${ui.aba}`, class: "painel" }, painel));
      partes.push(nota(h, t("plano.rodape")));
      return partes;
    }

    function cabecalho(dv) {
      const m = marcos(dv.investivel);
      return h("section", { class: "cartao sec-plano-cab" }, h("h2", null, t("plano.titulo")), h("p", { class: "leg" }, t("plano.sub")),
        h("div", { class: "grade" }, stat(h, { rotulo: t("plano.patrimonio"), valor: moeda(dv.liquido), sub: dv.liquido < 0 ? t("plano.patrimonioNegativo") : t("plano.patrimonioSub") }),
          m.proximoCentavos == null ? stat(h, { rotulo: t("plano.marcoRot"), valor: t("plano.marcoTopo") })
            : stat(h, { rotulo: t("plano.marco", { alvo: moeda(m.proximoCentavos) }), valor: pct(m.progressoBp, 0), sub: t("plano.marcoFalta", { valor: moeda(m.faltaCentavos) }) })));
    }

    function abas() {
      const lista = h("div", { class: "abas", role: "tablist", "aria-label": t("plano.abas") },
        ABAS.map((id) => h("button", { type: "button", role: "tab", id: `plano-aba-${id}`, "aria-selected": String(ui.aba === id), "aria-controls": `plano-painel-${id}`, tabindex: ui.aba === id ? "0" : "-1", class: ["aba", ui.aba === id ? "aba-ativa" : null],
          onclick: () => { ui.aba = id; ui.foco = `plano-aba-${id}`; render(); },
          onkeydown: (e) => { const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (k) { e.preventDefault(); ui.aba = ABAS[(ABAS.indexOf(id) + k + ABAS.length) % ABAS.length]; ui.foco = `plano-aba-${ui.aba}`; render(); } } }, t(`plano.aba.${id}`))));
      return lista;
    }

    // ---- 1. Para onde vai cada real ----
    function abaMensal(d, dv) {
      const partes = [];
      const rendaCampo = campo(h, { rotulo: t("plano.renda"), nome: "renda", valor: dv.plano.rendaCentavos != null ? textoDeCentavos(dv.plano.rendaCentavos, ctx.idioma()) : "", attrs: { inputmode: "decimal", placeholder: dv.receita != null ? textoDeCentavos(dv.receita, ctx.idioma()) : "" }, ajuda: dv.rendaFonte === "media" ? t("plano.rendaMedia", { valor: moeda(dv.receita) }) : dv.rendaFonte === "digitada" ? t("plano.rendaDigitada") : t("plano.rendaSem") });
      const form = h("form", { class: "form-plano", onsubmit: (e) => {
        e.preventDefault();
        const txt = rendaCampo.input.value.trim(), c = txt ? centavosDeTexto(txt) : null;
        if (txt && (c == null || c < 1)) { ui.msg = t("plano.valorInvalido"); return render(); }
        salvarPlano({ rendaCentavos: c }, "plano-resultado");
      } }, rendaCampo, h("div", { class: "botoes" }, h("button", { type: "submit" }, t("plano.calcular"))));
      partes.push(secao(h, t("plano.mensal.titulo"), "sec-mensal", h("p", { class: "leg" }, t("plano.mensal.intro")), form));
      const p = dv.mensal;
      if (!p) { partes.push(vazio(h, t("plano.mensal.semRenda"))); return partes; }
      const alvo = h("h3", { id: "plano-resultado", tabindex: "-1" }, t("plano.mensal.resultado", { renda: moeda(p.rendaCentavos) }));
      // Linha zerada some (nada a explicar), menos o investimento, que é onde o resto sempre cai.
      const itens = p.linhas.filter((l) => l.centavos > 0 || l.id === "investimento").map((l) => h("li", { class: ["passo", `passo-${l.grupo}`] },
        h("div", { class: "passo-cab" }, h("span", { class: "passo-nome" }, rotuloMotivo(l)), h("b", { class: "passo-valor" }, moeda(l.centavos)), h("small", { class: "passo-pct" }, pct(l.bp))),
        barra(h, { fracao: l.centavos / p.rendaCentavos, rotulo: `${rotuloMotivo(l)}: ${moeda(l.centavos)}`, classe: l.grupo === "futuro" ? "barra-s3" : l.grupo === "desejo" ? "barra-s2" : null }),
        h("p", { class: "porque" }, t(`plano.porque.${l.motivo}`))));
      const corpo = [alvo];
      if (p.codigo === "renda_nao_cobre") corpo.push(aviso(h, t("plano.mensal.naoCobre", { valor: moeda(p.deficitCentavos) })), h("ol", { class: "passos" }, itens.slice(0, 2)));
      else corpo.push(h("ol", { class: "passos" }, itens));
      if (p.avisos.includes("sem_historico_usando_50")) corpo.push(nota(h, t("plano.mensal.semHistorico")));
      if (p.avisos.includes("desejos_abaixo_do_piso")) corpo.push(nota(h, t("plano.mensal.pisoDesejos")));
      partes.push(h("section", { class: "cartao" }, corpo));
      if (p.codigo === "ok") partes.push(comparacao503020(p));
      return partes;
    }

    function comparacao503020(p) {
      const soma = (g) => p.linhas.filter((l) => l.grupo === g).reduce((s, l) => s + l.centavos, 0);
      const r = p.referencia, linhas = [
        [t("plano.cmp.necessidades"), moeda(soma("essencial")), pct(Math.round((soma("essencial") / p.rendaCentavos) * 10000)), moeda(r.necessidadesCentavos), pct(5000, 0)],
        [t("plano.cmp.desejos"), moeda(soma("desejo")), pct(Math.round((soma("desejo") / p.rendaCentavos) * 10000)), moeda(r.desejosCentavos), pct(3000, 0)],
        [t("plano.cmp.futuro"), moeda(soma("futuro")), pct(Math.round((soma("futuro") / p.rendaCentavos) * 10000)), moeda(r.futuroCentavos), pct(2000, 0)],
      ];
      return secao(h, t("plano.cmp.titulo"), "sec-cmp", h("p", { class: "leg" }, t("plano.cmp.intro")),
        tabelaIrma(h, { aberta: true, resumo: t("plano.cmp.tabela"), cabecalho: [t("plano.cmp.grupo"), t("plano.cmp.seuPlano"), t("plano.cmp.seuPct"), t("plano.cmp.partida"), t("plano.cmp.partidaPct")], linhas }));
    }

    // ---- 2. Reserva de emergência ----
    function abaReserva(d, dv) {
      const partes = [];
      const est = selecionar(h, { rotulo: t("plano.res.estabilidade"), nome: "estabilidade", valor: dv.estabilidade, opcoes: ESTABILIDADES.map((v) => ({ valor: v, texto: t(`plano.res.est.${v}`) })) });
      const dep = h("label", { class: "campo-check" }, h("input", { type: "checkbox", name: "dependentes", checked: Boolean(dv.plano.dependentes) }), h("span", null, t("plano.res.dependentes")));
      const unica = h("label", { class: "campo-check" }, h("input", { type: "checkbox", name: "rendaUnica", checked: Boolean(dv.plano.rendaUnica) }), h("span", null, t("plano.res.rendaUnica")));
      const atualCampo = dv.reservaMeta ? null : campo(h, { rotulo: t("plano.res.atual"), nome: "reservaAtual", valor: dv.plano.reservaAtualCentavos != null ? textoDeCentavos(dv.plano.reservaAtualCentavos, ctx.idioma()) : "", attrs: { inputmode: "decimal" }, ajuda: t("plano.res.atualAjuda") });
      const form = h("form", { class: "form-plano", onsubmit: (e) => {
        e.preventDefault();
        const patch = { estabilidade: est.input.value, dependentes: dep.querySelector("input").checked, rendaUnica: unica.querySelector("input").checked };
        if (atualCampo) { const txt = atualCampo.input.value.trim(), c = txt ? centavosDeTexto(txt) : null; if (txt && (c == null || c < 0)) { ui.msg = t("plano.valorInvalido"); return render(); } patch.reservaAtualCentavos = c; }
        salvarPlano(patch, "plano-resultado");
      } }, est, dep, unica, atualCampo, h("div", { class: "botoes" }, h("button", { type: "submit" }, t("plano.calcular"))));
      partes.push(secao(h, t("plano.res.titulo"), "sec-reserva", h("p", { class: "leg" }, t("plano.res.intro")), form));
      const r = dv.reserva;
      if (!r) { partes.push(vazio(h, t("plano.res.semDespesa"))); return partes; }
      const codigo = { completa: "ok", na_faixa: "info", abaixo_da_faixa: "atencao" }[r.codigo];
      partes.push(h("section", { class: "cartao" }, h("h3", { id: "plano-resultado", tabindex: "-1" }, t("plano.res.resultado")),
        h("div", { class: "grade" },
          stat(h, { rotulo: t("plano.res.alvo"), valor: moeda(r.alvoCentavos), sub: t("plano.res.alvoSub", { meses: meses1(r.alvoMeios), de: meses1(r.faixa.minMeios), ate: meses1(r.faixa.maxMeios) }) }),
          stat(h, { rotulo: t("plano.res.atualRot"), valor: moeda(dv.reservaAtualCentavos), sub: dv.reservaMeta ? t("plano.res.deMeta", { nome: dv.reservaMeta.nome }) : t("plano.res.digitado") }),
          stat(h, { rotulo: t("plano.res.falta"), valor: moeda(r.faltaCentavos), sub: t("plano.res.cobre", { meses: meses1(r.coberturaMeios ?? 0) }) })),
        barra(h, { fracao: (r.progressoBp ?? 0) / 10000, rotulo: t("plano.res.progresso", { pct: pct(r.progressoBp ?? 0, 0) }), classe: "barra-s3" }),
        estado(h, { codigo, texto: t(`plano.res.estado.${r.codigo}`) }),
        nota(h, t("plano.res.base", { essencial: dv.despEssencial != null ? moeda(dv.despEssencial) : "—", total: dv.despTotal != null ? moeda(dv.despTotal) : "—", usada: moeda(dv.despBase) })),
        nota(h, t(`plano.res.nota.${dv.estabilidade}`)), nota(h, t("plano.res.sugestao"))));
      return partes;
    }

    // ---- 3. Quitar dívida ----
    function abaDividas(d, dv) {
      const partes = [];
      if (!dv.dividasAtivas.length) {
        partes.push(secao(h, t("plano.div.titulo"), "sec-div", vazio(h, t("plano.div.semDividas")), h("div", { class: "botoes" }, h("button", { type: "button", class: "peq", onclick: () => ctx.navegar("dividas") }, t("plano.div.abrirDividas")))));
        return partes;
      }
      const minimos = dv.dividasAtivas.reduce((s, x) => s + Math.min(x.parcelaMinimaCentavos ?? 0, x.saldoCentavos), 0);
      const extraCentavos = ui.extraDivida ?? dv.extraDivida;
      const extra = campo(h, { rotulo: t("plano.div.extra"), nome: "extra", valor: textoDeCentavos(extraCentavos, ctx.idioma()), attrs: { inputmode: "decimal" }, ajuda: t("plano.div.extraAjuda", { minimos: moeda(minimos), plano: moeda(dv.extraDivida) }) });
      const form = h("form", { class: "form-plano", onsubmit: (e) => {
        e.preventDefault();
        const c = extra.input.value.trim() ? centavosDeTexto(extra.input.value) : 0;
        if (c == null || c < 0) { ui.msg = t("plano.valorInvalido"); return render(); }
        ui.extraDivida = c; ui.foco = "plano-resultado"; render();
      } }, extra, h("div", { class: "botoes" }, h("button", { type: "submit" }, t("plano.calcular"))));
      partes.push(secao(h, t("plano.div.titulo"), "sec-div", h("p", { class: "leg" }, t("plano.div.intro")), form));
      const orcamento = minimos + extraCentavos;
      const c = compararQuitacao(dv.dividasAtivas, orcamento, { hoje: ctx.hoje() });
      const cab = h("h3", { id: "plano-resultado", tabindex: "-1" }, t("plano.div.resultado", { orcamento: moeda(orcamento) }));
      if (c.codigo !== "ok") { partes.push(h("section", { class: "cartao" }, cab, aviso(h, t(`plano.div.codigo.${c.codigo}`, { falta: moeda(Math.max(0, c.minimosCentavos - orcamento)) })))); return partes; }
      const nomes = Object.fromEntries(dv.dividasAtivas.map((x) => [x.id, x.nome]));
      const metodos = ["avalanche", "bolaDeNeve", "hibrido"];
      const linhas = metodos.map((m) => [t(`plano.div.metodo.${m}`), mesAno(c[m].quitaEm), t("plano.div.meses", { n: c[m].meses }), moeda(c[m].jurosCentavos), moeda(c[m].economiaVsMaiorCentavos)]);
      const primeira = (m) => { const o = Object.entries(c[m].ordem).sort((a, b) => a[1] - b[1])[0]; return { nome: nomes[o[0]], mes: o[1] }; };
      const cards = metodos.map((m) => h("article", { class: "metodo-card" }, h("span", { class: "metodo-nome" }, t(`plano.div.metodo.${m}`)), h("b", null, mesAno(c[m].quitaEm)), h("small", null, t("plano.div.cardJuros", { juros: moeda(c[m].jurosCentavos), n: c[m].meses })),
        h("small", null, t("plano.div.primeira", { nome: primeira(m).nome, n: primeira(m).mes })), h("p", { class: "porque" }, t(`plano.div.desc.${m}`))));
      const ordens = metodos.map((m) => [t(`plano.div.metodo.${m}`), Object.entries(c[m].ordem).sort((a, b) => a[1] - b[1]).map(([id, mes]) => t("plano.div.ordemItem", { nome: nomes[id], n: mes })).join(" · ")]);
      partes.push(h("section", { class: "cartao" }, cab, h("div", { class: "metodos-cards" }, cards),
        tabelaIrma(h, { aberta: true, resumo: t("plano.div.tabela"), cabecalho: [t("plano.div.colMetodo"), t("plano.div.colData"), t("plano.div.colMeses"), t("plano.div.colJuros"), t("plano.div.colEconomia")], linhas }),
        tabelaIrma(h, { resumo: t("plano.div.ordemTabela"), cabecalho: [t("plano.div.colMetodo"), t("plano.div.colOrdem")], linhas: ordens }),
        nota(h, t("plano.div.ressalva")), nota(h, t("plano.div.base"))));
      return partes;
    }

    // ---- 4. Independência financeira ----
    function abaIndependencia(d, dv) {
      const partes = [];
      partes.push(blocoMarcos(dv));
      const despesa = campo(h, { rotulo: t("plano.ind.despesa"), nome: "despesa", valor: dv.plano.despesaDesejadaCentavos != null ? textoDeCentavos(dv.plano.despesaDesejadaCentavos, ctx.idioma()) : "", attrs: { inputmode: "decimal", placeholder: dv.despTotal != null ? textoDeCentavos(dv.despTotal, ctx.idioma()) : "" }, ajuda: t("plano.ind.despesaAjuda") });
      const aporte = campo(h, { rotulo: t("plano.ind.aporte"), nome: "aporte", valor: dv.plano.aporteMensalCentavos != null ? textoDeCentavos(dv.plano.aporteMensalCentavos, ctx.idioma()) : "", attrs: { inputmode: "decimal", placeholder: textoDeCentavos(dv.mensal?.linhas.find((l) => l.id === "investimento")?.centavos ?? 0, ctx.idioma()) }, ajuda: t("plano.ind.aporteAjuda") });
      const anos = campo(h, { rotulo: t("plano.ind.anos"), nome: "anos", valor: String(dv.anos), attrs: { inputmode: "numeric", min: 1, max: 60 } });
      const retirada = selecionar(h, { rotulo: t("plano.ind.retirada"), nome: "retirada", valor: dv.retiradaBp, opcoes: TAXAS_RETIRADA.map((x) => ({ valor: x.bp, texto: t(`plano.ind.ret.${x.id}`, { pct: pct(x.bp, 1) }) })) });
      const risco = selecionar(h, { rotulo: t("plano.ind.risco"), nome: "risco", valor: dv.risco, opcoes: Object.keys(PERFIS_RISCO).map((k) => ({ valor: k, texto: t(`plano.ind.risco.${k}`, { vol: pct(PERFIS_RISCO[k], 0) }) })) });
      const tx = { pessimistaBp: campo(h, { rotulo: t("plano.ind.pessimista"), nome: "tpes", valor: String(dv.taxas.pessimistaBp / 100), attrs: { inputmode: "decimal" } }), baseBp: campo(h, { rotulo: t("plano.ind.base"), nome: "tbase", valor: String(dv.taxas.baseBp / 100), attrs: { inputmode: "decimal" } }), otimistaBp: campo(h, { rotulo: t("plano.ind.otimista"), nome: "totm", valor: String(dv.taxas.otimistaBp / 100), attrs: { inputmode: "decimal" } }) };
      const form = h("form", { class: "form-plano", onsubmit: (e) => {
        e.preventDefault();
        const dTxt = despesa.input.value.trim(), aTxt = aporte.input.value.trim();
        const dC = dTxt ? centavosDeTexto(dTxt) : null, aC = aTxt ? centavosDeTexto(aTxt) : null, n = Number(anos.input.value);
        const taxas = Object.fromEntries(Object.entries(tx).map(([k, c]) => { const v = numeroDeTexto(c.input.value); return [k, v == null ? null : Math.round(v * 100)]; }));
        if ((dTxt && (dC == null || dC < 1)) || (aTxt && (aC == null || aC < 0)) || !Number.isInteger(n) || n < 1 || n > 60 || Object.values(taxas).some((v) => v == null || v < 0)) { ui.msg = t("plano.valorInvalido"); return render(); }
        if (!(taxas.pessimistaBp <= taxas.baseBp && taxas.baseBp <= taxas.otimistaBp)) { ui.msg = t("plano.ind.taxasOrdem"); return render(); }
        salvarPlano({ despesaDesejadaCentavos: dC, aporteMensalCentavos: aC, anos: n, retiradaBp: Number(retirada.input.value), risco: risco.input.value, taxasReaisBp: taxas }, "plano-resultado");
      } }, despesa, aporte, anos, retirada, risco,
        h("details", { class: "avancado" }, h("summary", null, t("plano.ind.avancado")), h("p", { class: "leg" }, t("plano.ind.avancadoIntro")), h("div", { class: "grade" }, tx.pessimistaBp, tx.baseBp, tx.otimistaBp)),
        h("div", { class: "botoes" }, h("button", { type: "submit" }, t("plano.calcular"))));
      partes.push(secao(h, t("plano.ind.titulo"), "sec-ind", h("p", { class: "leg" }, t("plano.ind.intro")), form));
      if (!dv.despesaDesejada) { partes.push(vazio(h, t("plano.ind.semDespesa"))); return partes; }

      const hoje = taxaRealLiquidaHoje(ctx.indices);
      const idade = idadeDoSnapshotEmDias(ctx.indices, ctx.hoje());
      const patrimonio = dv.investivel, ap = dv.aporte;
      const alvos = TAXAS_RETIRADA.map((x) => ({ ...x, alvo: alvoIndependencia({ despesaMensalCentavos: dv.despesaDesejada, retiradaBp: x.bp }) }));
      const alvoSel = alvoIndependencia({ despesaMensalCentavos: dv.despesaDesejada, retiradaBp: dv.retiradaBp });
      const cen = cenarios({ patrimonioCentavos: patrimonio, aporteMensalCentavos: ap, anos: dv.anos, alvoCentavos: alvoSel, taxas: dv.taxas });
      const mc = monteCarlo({ patrimonioCentavos: patrimonio, aporteMensalCentavos: ap, anos: dv.anos, taxaRealAaBp: dv.taxas.baseBp, volatilidadeBp: PERFIS_RISCO[dv.risco], alvoCentavos: alvoSel, caminhos: CAMINHOS_PADRAO });

      const cab = h("h3", { id: "plano-resultado", tabindex: "-1" }, t("plano.ind.resultado", { despesa: moeda(dv.despesaDesejada), aporte: moeda(ap), anos: dv.anos }));
      const linhasAlvo = alvos.map((a) => {
        const m = cen.find((c) => c.id === "base"), meses = m && a.bp === dv.retiradaBp ? m.mesesAteAlvo : null;
        return [t(`plano.ind.ret.${a.id}`, { pct: pct(a.bp, 1) }), moeda(a.alvo), pct(progressoAlvoBp(patrimonio, a.alvo) ?? 0, 0), a.bp === dv.retiradaBp ? t("plano.ind.escolhida") : "—", meses == null ? "—" : tempo("plano.ind.tempo", meses)];
      });
      const linhasCen = cen.map((c) => [t(`plano.ind.cen.${c.id}`), pct(c.taxaRealAaBp, 2), moeda(c.finalCentavos), c.mesesAteAlvo == null ? t("plano.ind.naoChega") : c.mesesAteAlvo === 0 ? t("plano.ind.jaChegou") : c.alcancaNoHorizonte ? tempo("plano.ind.tempo", c.mesesAteAlvo) : tempo("plano.ind.depois", c.mesesAteAlvo)]);
      const prob = Math.round(mc.probAlvoBp / 100);
      const largura = larguraGrafico();
      const grafico = graficoFaixa({ hs, faixa: mc.faixa.map((f) => ({ ano: f.ano, p10: f.p10Centavos / 100, p50: f.p50Centavos / 100, p90: f.p90Centavos / 100 })), alvo: alvoSel / 100, fmtY: (v) => compacto.format(v), fmtX: (v) => String(v), largura,
        titulo: t("plano.ind.grafTitulo"), desc: t("plano.ind.grafDesc", { anos: dv.anos, p10: moeda(mc.faixa[dv.anos].p10Centavos), p50: moeda(mc.faixa[dv.anos].p50Centavos), p90: moeda(mc.faixa[dv.anos].p90Centavos) }), rotuloAlvo: t("plano.ind.alvo") });
      const linhasMc = anosDaTabela(dv.anos).map((a) => [String(a), moeda(mc.faixa[a].p10Centavos), moeda(mc.faixa[a].p50Centavos), moeda(mc.faixa[a].p90Centavos)]);

      partes.push(h("section", { class: "cartao" }, cab,
        h("div", { class: "grade" }, stat(h, { rotulo: t("plano.ind.alvoSel"), valor: moeda(alvoSel), sub: t("plano.ind.alvoSub", { pct: pct(dv.retiradaBp, 1) }) }), stat(h, { rotulo: t("plano.ind.patInicial"), valor: moeda(patrimonio), sub: t("plano.ind.progresso", { pct: pct(progressoAlvoBp(patrimonio, alvoSel) ?? 0, 0) }) })),
        barra(h, { fracao: (progressoAlvoBp(patrimonio, alvoSel) ?? 0) / 10000, rotulo: t("plano.ind.progresso", { pct: pct(progressoAlvoBp(patrimonio, alvoSel) ?? 0, 0) }) }),
        h("h4", null, t("plano.ind.regraTitulo")), h("p", { class: "leg" }, t("plano.ind.regraIntro")),
        tabelaIrma(h, { aberta: true, resumo: t("plano.ind.regraTabela"), cabecalho: [t("plano.ind.colRegra"), t("plano.ind.colAlvo"), t("plano.ind.colCaminho"), t("plano.ind.colSel"), t("plano.ind.colTempo")], linhas: linhasAlvo }),
        nota(h, t("plano.ind.regraRessalva"))));
      partes.push(h("section", { class: "cartao" }, h("h3", null, t("plano.ind.cenTitulo", { anos: dv.anos })), h("p", { class: "leg" }, t("plano.ind.cenIntro", { hoje: pct(hoje.bp, 2) })),
        tabelaIrma(h, { aberta: true, resumo: t("plano.ind.cenTabela"), cabecalho: [t("plano.ind.colCenario"), t("plano.ind.colTaxa"), t("plano.ind.colFinal", { anos: dv.anos }), t("plano.ind.colAlvoEm")], linhas: linhasCen }),
        nota(h, t("plano.ind.taxaHoje", { real: pct(hoje.bp, 2), cdi: pct(ctx.indices.cdiBp, 2), ipca: pct(ctx.indices.ipca12Bp, 2), data: fmt.data(ctx.indices.atualizadoEm) })),
        idade.codigo === "desatualizado" ? aviso(h, t("plano.indicesVelhos", { dias: idade.dias })) : null));
      partes.push(h("section", { class: "cartao" }, h("h3", null, t("plano.ind.mcTitulo")), h("p", { class: "leg" }, t("plano.ind.mcIntro", { n: mc.caminhos, risco: t(`plano.ind.risco.${dv.risco}`, { vol: pct(PERFIS_RISCO[dv.risco], 0) }) })),
        h("p", { class: "gran gran-mc" }, t("plano.ind.mcProb", { x: prob })), h("p", { class: "leg" }, t("plano.ind.mcProbSub", { anos: dv.anos, alvo: moeda(alvoSel) })),
        h("div", { class: "graf" }, grafico), legenda(h, [{ classe: "s1b", rotulo: t("plano.ind.legFaixa") }, { classe: "s1", rotulo: t("plano.ind.legMediana") }]),
        tabelaIrma(h, { resumo: t("plano.ind.mcTabela"), cabecalho: [t("plano.ind.colAno"), t("plano.ind.colP10"), t("plano.ind.colP50"), t("plano.ind.colP90")], linhas: linhasMc }),
        nota(h, t("plano.ind.mcRessalva", { semente: mc.semente }))));
      return partes;
    }

    function blocoMarcos(dv) {
      const m = marcos(dv.investivel);
      const chips = m.alcancados.length ? h("ul", { class: "marcos-lista" }, m.alcancados.map((v) => h("li", null, estado(h, { codigo: "ok", texto: moeda(v) })))) : null;
      return h("section", { class: "cartao" }, h("h3", null, t("plano.marcos.titulo")), h("p", { class: "leg" }, t("plano.marcos.intro")),
        m.proximoCentavos == null ? estado(h, { codigo: "ok", texto: t("plano.marcos.topo") })
          : [h("p", { class: "meta-frase" }, t("plano.marcos.frase", { pct: pct(m.progressoBp, 0), de: moeda(m.anteriorCentavos), ate: moeda(m.proximoCentavos) })),
            barra(h, { fracao: m.progressoBp / 10000, rotulo: t("plano.marcos.frase", { pct: pct(m.progressoBp, 0), de: moeda(m.anteriorCentavos), ate: moeda(m.proximoCentavos) }), classe: "barra-s3" })],
        chips ? h("div", null, h("p", { class: "leg" }, t("plano.marcos.passou")), chips) : null,
        dv.liquido < 0 ? nota(h, t("plano.marcos.negativo")) : null);
    }

    // ---- 5. Renda fixa ----
    function abaRendaFixa(d, dv) {
      const partes = [];
      const principal = campo(h, { rotulo: t("plano.rf.valor"), nome: "rfvalor", valor: ui.rf.principal, attrs: { inputmode: "decimal" } });
      const dias = selecionar(h, { rotulo: t("plano.rf.prazo"), nome: "rfdias", valor: ui.rf.dias, opcoes: PRAZOS_RENDA_FIXA.map((n) => ({ valor: n, texto: t("plano.rf.prazoOpcao", { n }) })) });
      const taxas = {
        cdb: campo(h, { rotulo: t("plano.rf.taxa.cdb"), nome: "rfcdb", valor: ui.rf.taxas.cdb, attrs: { inputmode: "decimal" } }),
        lci_lca: campo(h, { rotulo: t("plano.rf.taxa.lci_lca"), nome: "rflci", valor: ui.rf.taxas.lci_lca, attrs: { inputmode: "decimal" } }),
        tesouro_selic: campo(h, { rotulo: t("plano.rf.taxa.tesouro_selic"), nome: "rfsel", valor: ui.rf.taxas.tesouro_selic, attrs: { inputmode: "decimal" } }),
        tesouro_ipca: campo(h, { rotulo: t("plano.rf.taxa.tesouro_ipca"), nome: "rfipca", valor: ui.rf.taxas.tesouro_ipca, attrs: { inputmode: "decimal" } }),
        tesouro_pre: campo(h, { rotulo: t("plano.rf.taxa.tesouro_pre"), nome: "rfpre", valor: ui.rf.taxas.tesouro_pre, attrs: { inputmode: "decimal" } }),
      };
      const form = h("form", { class: "form-plano", onsubmit: (e) => {
        e.preventDefault();
        const vals = Object.fromEntries(Object.entries(taxas).map(([k, c]) => [k, numeroDeTexto(c.input.value)]));
        const pr = centavosDeTexto(principal.input.value);
        if (pr == null || pr < 1 || Object.values(vals).some((v) => v == null || v < 0)) { ui.msg = t("plano.valorInvalido"); return render(); }
        ui.rf = { principal: principal.input.value, dias: dias.input.value, taxas: Object.fromEntries(Object.entries(taxas).map(([k, c]) => [k, c.input.value])) };
        ui.foco = "plano-resultado"; render();
      } }, principal, dias, h("div", { class: "grade" }, Object.values(taxas)), h("p", { class: "leg" }, t("plano.rf.exemplos")), h("div", { class: "botoes" }, h("button", { type: "submit" }, t("plano.calcular"))));
      partes.push(secao(h, t("plano.rf.titulo"), "sec-rf", h("p", { class: "leg" }, t("plano.rf.intro")), form));

      const pr = centavosDeTexto(ui.rf.principal), diasN = Number(ui.rf.dias), tx = (k) => Math.round(numeroDeTexto(ui.rf.taxas[k]) * 100);
      const produtos = PRODUTOS_RENDA_FIXA.map((p) => p.id === "cdb" || p.id === "lci_lca" ? { ...p, percentualBp: tx(p.id) } : p.id === "poupanca" ? p : { ...p, taxaBp: tx(p.id) });
      const linhas = compararRendaFixa({ principalCentavos: pr, dias: diasN, produtos, indices: ctx.indices, hoje: ctx.hoje() });
      const idade = idadeDoSnapshotEmDias(ctx.indices, ctx.hoje());
      const cab = h("h3", { id: "plano-resultado", tabindex: "-1" }, t("plano.rf.resultado", { valor: moeda(pr), n: diasN }));
      const maior = linhas.filter((x) => x.id !== "poupanca").reduce((a, b) => (b.liquidoCentavos > a.liquidoCentavos ? b : a));
      const tab = tabelaIrma(h, { aberta: true, resumo: t("plano.rf.tabela"), cabecalho: [t("plano.rf.colProduto"), t("plano.rf.colBruto"), t("plano.rf.colIof"), t("plano.rf.colIr"), t("plano.rf.colCustodia"), t("plano.rf.colLiquido"), t("plano.rf.colAnual"), t("plano.rf.colEquiv")],
        linhas: linhas.map((x) => [t(`plano.rf.produto.${x.id}`), moeda(x.brutoCentavos), moeda(x.iofCentavos), moeda(x.irCentavos), moeda(x.custodiaCentavos), moeda(x.liquidoCentavos), pct(x.liquidoAnualBp, 2), x.cdbEquivalenteBp == null ? "—" : pct(x.cdbEquivalenteBp, 1)]) });
      partes.push(h("section", { class: "cartao" }, cab, tab,
        h("p", { class: "meta-frase" }, t("plano.rf.maior", { produto: t(`plano.rf.produto.${maior.id}`), valor: moeda(maior.liquidoCentavos) })),
        h("ul", { class: "avisos ressalvas" }, ["fgc", "lci", "tesouro", "ipca", "taxas", "ir", "naoRecomenda"].map((k) => h("li", null, t(`plano.rf.ressalva.${k}`)))),
        nota(h, t("plano.rf.indices", { cdi: pct(ctx.indices.cdiBp, 2), selic: pct(ctx.indices.selicBp, 2), ipca: pct(ctx.indices.ipca12Bp, 2), data: fmt.data(ctx.indices.atualizadoEm) })),
        idade.codigo === "desatualizado" ? aviso(h, t("plano.indicesVelhos", { dias: idade.dias })) : null));
      return partes;
    }

    render();
    return { elemento: raiz, atualizar: render };
  },
};
