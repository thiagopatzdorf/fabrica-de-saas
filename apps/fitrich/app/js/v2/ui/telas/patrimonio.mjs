// Tela Patrimônio: patrimônio líquido e variação vs mês passado, linha de 12 meses, composição por tipo
// com dívidas em divergente, "atualizar saldos" uma vez por mês (snapshot), CRUD de conta e investimento e
// "rendimento estimado se levado ao vencimento". Regra financeira vem dos módulos v2; aqui só se apresenta.
import { TIPOS_CONTA, adicionar, editar, remover, saldoDaConta } from "../../esquema.mjs";
import { idadeDoSnapshotEmDias } from "../../indices.mjs";
import { rendimentoAteVencimento } from "../../investimentos.mjs";
import { patrimonioLiquido } from "../../patrimonio.mjs";
import { mesDe, somarMeses } from "../../../datas.mjs";
import { barraDivergente, graficoLinha, legenda } from "../graficos-patrimonio.mjs";
import { alternador, aviso, campo, centavosDeTexto, confirmar, dadosExternos, estado, gravarSnapshot, larguraGrafico, nota, reconciliarConta, secao, selecionar, sinal, stat, tabelaIrma, textoDeCentavos, vazio } from "./_comum.mjs";

export const PRODUTOS = ["cdb", "lci_lca", "tesouro_selic", "tesouro_ipca", "tesouro_prefixado", "poupanca", "fundo", "outro"];
export const INDEXADORES = ["cdi", "selic", "ipca", "prefixado"];
// Cor por tipo de ativo (a legenda e a tabela dizem o nome; a cor só reforça). Passivos são sempre laranja (s2).
const CLASSE_TIPO = { investimento: "s1", poupanca: "s3", corrente: "s1b", dinheiro: "s1b" };

// ---------- lógica de apresentação pura (testada em Node) ----------

// Série dos últimos 12 meses: snapshots gravados + o mês corrente calculado ao vivo quando ainda não há
// snapshot dele (marcado `aoVivo`), para a linha nunca terminar num mês atrasado.
export function serieDozeMeses(snapshots, ymHoje, liquidoAtual) {
  const por = new Map(snapshots.map((s) => [s.ym, s.patrimonioCentavos]));
  const serie = [];
  for (let k = 11; k >= 0; k--) {
    const ym = somarMeses(ymHoje, -k);
    if (por.has(ym)) serie.push({ ym, centavos: por.get(ym), aoVivo: false });
    else if (k === 0) serie.push({ ym, centavos: liquidoAtual, aoVivo: true });
  }
  return serie;
}

// Variação vs mês passado: contra o snapshot do mês anterior. null sem snapshot anterior; bp null se o
// anterior não é positivo (porcentagem sobre patrimônio negativo não significa nada).
export function variacaoVsMesPassado(snapshots, ymHoje, liquidoAtual) {
  const ant = snapshots.find((s) => s.ym === somarMeses(ymHoje, -1));
  if (!ant) return null;
  const centavos = liquidoAtual - ant.patrimonioCentavos;
  return { centavos, bp: ant.patrimonioCentavos > 0 ? Math.round((centavos / ant.patrimonioCentavos) * 10000) : null };
}

// Segmentos da barra divergente: ativos por tipo (≥ 0) e passivos (dívidas, faturas) para o outro lado.
export function composicaoDivergente(p) {
  return {
    ativos: p.composicao.ativos.filter((a) => a.centavos > 0).map((a) => ({ tipo: a.tipo, valor: a.centavos, bp: a.bp, classe: CLASSE_TIPO[a.tipo] ?? "s1" })),
    passivos: p.composicao.passivos.filter((x) => x.centavos > 0).map((x) => ({ tipo: x.tipo, valor: x.centavos, classe: "s2" })),
  };
}

// ---------- tela ----------
export const tela = {
  id: "patrimonio", titulo: "patrimonio.titulo", icone: "wallet", grupo: "mais", ordem: 50,
  css: ["/css/_telas.css", "/css/patrimonio.css"], i18n: "/js/v2/ui/telas/patrimonio.i18n.mjs",
  montar(ctx) {
    const { h, hs, t, fmt } = ctx;
    const raiz = h("div", { class: "tela-patrimonio" });
    const ui = { atualizando: false, editandoConta: null, editandoInv: null, msg: null };
    const render = () => { ctx.limpar(raiz); raiz.append(...montarConteudo().filter(Boolean)); };
    const salvar = (fn) => ctx.mudar(fn).then(() => { ui.msg = null; }).catch((e) => { ui.msg = t("patrimonio.erro", { codigo: (e?.erros ?? []).map((x) => x.codigo).join(", ") || String(e?.message ?? e) }); render(); });

    function montarConteudo() {
      const d = ctx.estado(), hoje = ctx.hoje(), ym = mesDe(hoje);
      const ext = dadosExternos(d, hoje), p = patrimonioLiquido(d, ext);
      const temAlgo = d.contas.length || d.investimentos.length || d.dividas.length;
      const partes = [];
      if (ui.msg) partes.push(aviso(h, ui.msg));
      partes.push(heroi(d, p, ym), linha12(d, ym, p.liquido), composicao(p));
      partes.push(atualizarSaldos(d, hoje, ym));
      partes.push(contas(d, hoje, p), investimentos(d, hoje));
      if (!temAlgo) partes.splice(1, 0, vazio(h, t("patrimonio.vazio")));
      return partes;
    }

    function heroi(d, p, ym) {
      const v = variacaoVsMesPassado(d.snapshots, ym, p.liquido);
      const subt = v == null ? t("patrimonio.semMesPassado") : t("patrimonio.variacao", { valor: `${sinal(v.centavos)}${fmt.moeda(Math.abs(v.centavos))}`, pct: v.bp == null ? "" : ` (${sinal(v.bp)}${fmt.percentualBp(Math.abs(v.bp))})` });
      return h("section", { class: "heroi" },
        h("span", { class: "rot" }, t("patrimonio.liquido")),
        h("div", { class: "gran", "data-negativo": p.liquido < 0 ? "1" : null }, fmt.moeda(p.liquido)),
        h("p", { class: "leg" }, subt),
        h("div", { class: "grade" }, stat(h, { rotulo: t("patrimonio.ativos"), valor: fmt.moeda(p.ativos) }), stat(h, { rotulo: t("patrimonio.passivos"), valor: p.passivos ? `−${fmt.moeda(p.passivos)}` : fmt.moeda(0) })));
    }

    function linha12(d, ym, liquido) {
      const serie = serieDozeMeses(d.snapshots, ym, liquido);
      if (serie.length < 2) return secao(h, t("patrimonio.doze"), "sec-linha", nota(h, t("patrimonio.dozeVazio")));
      const pontos = serie.map((s, i) => ({ x: i, y: s.centavos / 100, tip: `${fmt.mes(s.ym)}: ${fmt.moeda(s.centavos)}${s.aoVivo ? ` (${t("patrimonio.aoVivo")})` : ""}` }));
      const svg = graficoLinha({ hs, largura: larguraGrafico(), pontos, media: pontos.map(({ x, y }) => ({ x, y })), fmtY: (v) => fmt.numero(v / 1000, 0) + "k", xRotulos: serie.filter((_, i) => i === 0 || i === serie.length - 1 || i === Math.floor(serie.length / 2)).map((s) => ({ x: serie.indexOf(s), texto: fmt.mes(s.ym) })), titulo: t("patrimonio.doze"), desc: t("patrimonio.dozeDesc", { n: serie.length }) });
      return secao(h, t("patrimonio.doze"), "sec-linha", h("div", { class: "graf" }, svg), nota(h, t("patrimonio.dozeNota")),
        tabelaIrma(h, { resumo: t("patrimonio.verTabela"), cabecalho: [t("patrimonio.mes"), t("patrimonio.liquido")], linhas: serie.map((s) => [fmt.mes(s.ym) + (s.aoVivo ? ` · ${t("patrimonio.aoVivo")}` : ""), fmt.moeda(s.centavos)]) }));
    }

    function composicao(p) {
      const c = composicaoDivergente(p);
      if (!c.ativos.length && !c.passivos.length) return null;
      const rot = (tipo) => t(`patrimonio.tipo.${tipo}`);
      const svg = barraDivergente({ hs, largura: larguraGrafico(), ativos: c.ativos.map((a) => ({ ...a, rotulo: rot(a.tipo) })), passivos: c.passivos.map((x) => ({ ...x, rotulo: rot(x.tipo) })), fmt: (v) => fmt.moeda(v), titulo: t("patrimonio.composicao"), desc: t("patrimonio.composicaoDesc") });
      const itens = [...c.ativos.map((a) => ({ classe: a.classe, rotulo: rot(a.tipo), valor: fmt.moeda(a.valor) })), ...c.passivos.map((x) => ({ classe: x.classe, rotulo: rot(x.tipo), valor: `−${fmt.moeda(x.valor)}` }))];
      return secao(h, t("patrimonio.composicao"), "sec-comp", h("div", { class: "graf" }, svg), legenda(h, itens),
        tabelaIrma(h, { resumo: t("patrimonio.verTabela"), cabecalho: [t("patrimonio.tipoCol"), t("patrimonio.valor"), "%"], linhas: [...c.ativos.map((a) => [rot(a.tipo), fmt.moeda(a.valor), a.bp == null ? "—" : fmt.percentualBp(a.bp, 0)]), ...c.passivos.map((x) => [rot(x.tipo), `−${fmt.moeda(x.valor)}`, "—"])] }));
    }

    // "Atualizar saldos": uma vez por mês. Guia conta a conta (saldo de hoje) e grava o snapshot do mês.
    function atualizarSaldos(d, hoje, ym) {
      const feito = d.snapshots.find((s) => s.ym === ym);
      const cab = feito ? estado(h, { codigo: "ok", texto: t("patrimonio.saldosFeitos", { mes: fmt.mes(ym) }) }) : estado(h, { codigo: "info", texto: t("patrimonio.saldosPendentes", { mes: fmt.mes(ym) }) });
      const form = h("form", { id: "form-saldos", class: "form-saldos", onsubmit: (e) => { e.preventDefault(); gravarSaldos(e.target, d, hoje); } });
      const contasLiquidas = d.contas.filter((c) => !c.arquivada && !(c.tipo === "investimento" && d.investimentos.some((i) => i.contaId === c.id)));
      for (const c of contasLiquidas) form.append(campo(h, { rotulo: t("patrimonio.saldoDe", { nome: c.nome }), nome: `saldo-${c.id}`, valor: textoDeCentavos(saldoDaConta(d, c.id, hoje), ctx.idioma()), attrs: { inputmode: "decimal" } }));
      for (const i of d.investimentos) form.append(campo(h, { rotulo: t("patrimonio.saldoDe", { nome: i.nome }), nome: `inv-${i.id}`, valor: textoDeCentavos(i.saldoInformadoCentavos ?? i.aporteCentavos, ctx.idioma()), attrs: { inputmode: "decimal" } }));
      form.append(nota(h, t("patrimonio.saldosComo")), h("button", { type: "submit" }, t("patrimonio.gravarSnapshot")));
      const botao = alternador(h, { texto: feito ? t("patrimonio.atualizarDeNovo") : t("patrimonio.atualizarSaldos"), alvo: form, aberto: ui.atualizando });
      if (!feito) botao.classList.remove("peq");
      return secao(h, t("patrimonio.saldos"), "sec-saldos", cab, h("div", { class: "botoes" }, botao), form);
    }
    function gravarSaldos(form, d0, hoje) {
      const dados = new FormData(form);
      salvar((d) => {
        let n = d;
        for (const c of d0.contas) { const v = dados.get(`saldo-${c.id}`); if (v != null) { const cents = centavosDeTexto(v); if (cents == null) throw new Error("valor_invalido"); if (cents !== saldoDaConta(n, c.id, hoje)) n = reconciliarConta(n, c.id, cents, hoje, { agora: ctx.agora }); } }
        for (const i of d0.investimentos) { const v = dados.get(`inv-${i.id}`); if (v != null) { const cents = centavosDeTexto(v); if (cents == null) throw new Error("valor_invalido"); n = editar(n, "investimentos", i.id, { saldoInformadoCentavos: cents, dataSaldo: hoje }, { agora: ctx.agora }); } }
        return gravarSnapshot(n, hoje, ctx.agora);
      });
      ui.atualizando = false;
    }

    // ---- contas ----
    function contas(d, hoje, p) {
      const lista = d.contas.filter((c) => !c.arquivada);
      const form = formConta(d, ui.editandoConta ? d.contas.find((c) => c.id === ui.editandoConta) : null, hoje);
      const abrir = alternador(h, { texto: t("patrimonio.novaConta"), alvo: form, aberto: ui.editandoConta != null });
      const ul = h("ul", { class: "lista" }, lista.map((c) => {
        const vinculados = c.tipo === "investimento" ? d.investimentos.filter((i) => i.contaId === c.id) : [];
        const valor = vinculados.length ? vinculados.reduce((s, i) => s + (i.saldoInformadoCentavos ?? i.aporteCentavos), 0) : saldoDaConta(d, c.id, hoje);
        return h("li", null, h("div", { class: "item" }, h("b", null, c.nome), h("small", null, `${t(`patrimonio.tipo.${c.tipo}`)}${vinculados.length ? ` · ${t("patrimonio.somaInvestimentos", { n: vinculados.length })}` : ""}`)),
          h("span", { class: "valor" }, fmt.moeda(valor)),
          h("div", { class: "acoes" }, h("button", { type: "button", class: "peq", onclick: () => { ui.editandoConta = c.id; render(); raiz.querySelector("#form-conta input")?.focus(); }, "aria-label": t("patrimonio.editarX", { nome: c.nome }) }, t("patrimonio.editar")),
            h("button", { type: "button", class: "peq", "aria-label": t("patrimonio.apagarX", { nome: c.nome }), onclick: async () => { if (await confirmar(h, raiz, { titulo: t("patrimonio.apagarConta"), texto: t("patrimonio.apagarContaTexto", { nome: c.nome }), ok: t("patrimonio.apagar"), cancelar: t("patrimonio.cancelar") })) salvar((x) => remover(x, "contas", c.id, { agora: ctx.agora })); } }, t("patrimonio.apagar"))));
      }));
      return secao(h, t("patrimonio.contas"), "sec-contas", lista.length ? ul : ctx.estadoVazio({ icone: "patrimonio", titulo: t("vazio.patrimonio_contas.titulo"), texto: t("vazio.patrimonio_contas.texto") }), h("div", { class: "botoes" }, abrir), form);
    }
    function formConta(d, c, hoje) {
      const tipo = selecionar(h, { rotulo: t("patrimonio.tipoCol"), nome: "tipo", valor: c?.tipo ?? "corrente", opcoes: TIPOS_CONTA.map((v) => ({ valor: v, texto: t(`patrimonio.tipo.${v}`) })) });
      const nome = campo(h, { rotulo: t("patrimonio.nome"), nome: "nome", valor: c?.nome ?? "", attrs: { required: true, maxlength: 60 } });
      const saldo = campo(h, { rotulo: t("patrimonio.saldoHoje"), nome: "saldo", valor: c ? textoDeCentavos(saldoDaConta(d, c.id, hoje), ctx.idioma()) : "", attrs: { inputmode: "decimal", required: true } });
      return h("form", { id: "form-conta", class: "form-crud", onsubmit: (e) => {
        e.preventDefault();
        const cents = centavosDeTexto(saldo.input.value);
        if (cents == null) { ui.msg = t("patrimonio.valorInvalido"); return render(); }
        const item = { nome: nome.input.value.trim(), tipo: tipo.input.value, moeda: d.perfil.moedaPadrao, arquivada: false };
        salvar((x) => (c ? reconciliarConta(editar(x, "contas", c.id, item, { agora: ctx.agora }), c.id, cents, hoje, { agora: ctx.agora }) : adicionar(x, "contas", { ...item, saldoInicialCentavos: cents, dataSaldoInicial: hoje }, { novoId: ctx.novoId, agora: ctx.agora })));
        ui.editandoConta = null;
      } }, h("h3", null, c ? t("patrimonio.editarConta") : t("patrimonio.novaConta")), nome, tipo, saldo,
        h("div", { class: "botoes" }, h("button", { type: "submit" }, t("patrimonio.salvar")), c ? h("button", { type: "button", class: "peq", onclick: () => { ui.editandoConta = null; render(); } }, t("patrimonio.cancelar")) : null));
    }

    // ---- investimentos ----
    function investimentos(d, hoje) {
      const idade = idadeDoSnapshotEmDias(ctx.indices, hoje);
      const fonte = h("p", { class: "nota fonte" }, estado(h, { codigo: idade.codigo === "desatualizado" ? "atencao" : "info", texto: t(idade.codigo === "desatualizado" ? "patrimonio.indicesDesatualizados" : "patrimonio.indicesFonte", { fonte: ctx.indices.fonte, data: fmt.data(ctx.indices.atualizadoEm), dias: idade.dias }) }));
      const form = formInvestimento(d, ui.editandoInv ? d.investimentos.find((i) => i.id === ui.editandoInv) : null, hoje);
      const abrir = alternador(h, { texto: t("patrimonio.novoInvestimento"), alvo: form, aberto: ui.editandoInv != null });
      const cards = d.investimentos.map((i) => cartaoInvestimento(d, i, hoje));
      return secao(h, t("patrimonio.investimentos"), "sec-inv", fonte, cards.length ? h("div", { class: "cards" }, cards) : vazio(h, t("patrimonio.investimentosVazio")), h("div", { class: "botoes" }, abrir), form);
    }
    function cartaoInvestimento(d, i, hoje) {
      let r = null, erro = null;
      try { r = rendimentoAteVencimento(i, ctx.indices, { hoje }); } catch (e) { erro = String(e?.message ?? e); }
      const desc = [PRODUTOS.includes(i.produto) ? t(`patrimonio.produto.${i.produto}`) : i.produto, INDEXADORES.includes(i.indexador) ? `${i.percentualBp != null && i.indexador === "cdi" ? fmt.percentualBp(i.percentualBp, 0) + " " : ""}${t(`patrimonio.indexador.${i.indexador}`)}${i.taxaBp ? ` + ${fmt.percentualBp(i.taxaBp, 2)}` : ""}` : null, i.vencimento ? t("patrimonio.vence", { data: fmt.data(i.vencimento) }) : t("patrimonio.semVencimento")].filter(Boolean).join(" · ");
      const saldo = h("div", { class: "grade" }, stat(h, { rotulo: t("patrimonio.saldoInformado"), valor: fmt.moeda(i.saldoInformadoCentavos ?? i.aporteCentavos), sub: i.dataSaldo ? t("patrimonio.em", { data: fmt.data(i.dataSaldo) }) : t("patrimonio.aporteComoSaldo") }),
        r ? stat(h, { rotulo: t("patrimonio.rendimentoEstimado"), valor: `+${fmt.moeda(r.liquidoCentavos)}`, sub: t("patrimonio.rendimentoDetalhe", { bruto: fmt.moeda(r.brutoCentavos), ir: fmt.moeda(r.irCentavos), iof: fmt.moeda(r.iofCentavos), dias: r.dias }) }) : stat(h, { rotulo: t("patrimonio.rendimentoEstimado"), valor: "—", sub: t("patrimonio.rendimentoIndisponivel", { motivo: erro ?? "" }) }));
      const avisos = r ? h("ul", { class: "avisos" }, r.avisos.map((a) => h("li", null, t(`patrimonio.aviso.${a}`)))) : null;
      return h("article", { class: "card-inv" }, h("div", { class: "item" }, h("b", null, i.nome), h("small", null, desc)), saldo, avisos,
        h("div", { class: "acoes" }, h("button", { type: "button", class: "peq", "aria-label": t("patrimonio.editarX", { nome: i.nome }), onclick: () => { ui.editandoInv = i.id; render(); raiz.querySelector("#form-inv input")?.focus(); } }, t("patrimonio.editar")),
          h("button", { type: "button", class: "peq", "aria-label": t("patrimonio.apagarX", { nome: i.nome }), onclick: async () => { if (await confirmar(h, raiz, { titulo: t("patrimonio.apagarInvestimento"), texto: t("patrimonio.apagarContaTexto", { nome: i.nome }), ok: t("patrimonio.apagar"), cancelar: t("patrimonio.cancelar") })) salvar((x) => remover(x, "investimentos", i.id, { agora: ctx.agora })); } }, t("patrimonio.apagar"))));
    }
    function formInvestimento(d, i, hoje) {
      const contasInv = d.contas.filter((c) => !c.arquivada);
      const nome = campo(h, { rotulo: t("patrimonio.nome"), nome: "inome", valor: i?.nome ?? "", attrs: { required: true, maxlength: 60 } });
      const conta = selecionar(h, { rotulo: t("patrimonio.contaCol"), nome: "iconta", valor: i?.contaId ?? contasInv.find((c) => c.tipo === "investimento")?.id ?? contasInv[0]?.id ?? "", opcoes: contasInv.map((c) => ({ valor: c.id, texto: c.nome })) });
      const produto = selecionar(h, { rotulo: t("patrimonio.produtoCol"), nome: "iproduto", valor: i?.produto ?? "cdb", opcoes: PRODUTOS.map((v) => ({ valor: v, texto: t(`patrimonio.produto.${v}`) })) });
      const indexador = selecionar(h, { rotulo: t("patrimonio.indexadorCol"), nome: "iindex", valor: i?.indexador ?? "cdi", opcoes: INDEXADORES.map((v) => ({ valor: v, texto: t(`patrimonio.indexador.${v}`) })) });
      const pct = campo(h, { rotulo: t("patrimonio.percentualDoIndice"), nome: "ipct", valor: i?.percentualBp != null ? String(i.percentualBp / 100) : "100", attrs: { inputmode: "decimal" }, ajuda: t("patrimonio.percentualAjuda") });
      const taxa = campo(h, { rotulo: t("patrimonio.taxaAa"), nome: "itaxa", valor: i?.taxaBp != null ? String(i.taxaBp / 100) : "", attrs: { inputmode: "decimal" }, ajuda: t("patrimonio.taxaAjuda") });
      const aporte = campo(h, { rotulo: t("patrimonio.aporte"), nome: "iaporte", valor: i ? textoDeCentavos(i.aporteCentavos, ctx.idioma()) : "", attrs: { inputmode: "decimal", required: true } });
      const saldo = campo(h, { rotulo: t("patrimonio.saldoInformado"), nome: "isaldo", valor: i?.saldoInformadoCentavos != null ? textoDeCentavos(i.saldoInformadoCentavos, ctx.idioma()) : "", attrs: { inputmode: "decimal" } });
      const aplicacao = campo(h, { rotulo: t("patrimonio.aplicacao"), nome: "iaplic", tipo: "date", valor: i?.aplicacao ?? hoje, attrs: { required: true } });
      const venc = campo(h, { rotulo: t("patrimonio.vencimento"), nome: "ivenc", tipo: "date", valor: i?.vencimento ?? "" });
      const isento = h("input", { type: "checkbox", name: "iisento", id: "iisento", checked: Boolean(i?.isentoIR) });
      const isentoLabel = h("label", { class: "campo-check", for: "iisento" }, isento, h("span", null, t("patrimonio.isentoIR")));
      return h("form", { id: "form-inv", class: "form-crud", onsubmit: (e) => {
        e.preventDefault();
        const aporteC = centavosDeTexto(aporte.input.value), saldoC = saldo.input.value.trim() ? centavosDeTexto(saldo.input.value) : null;
        const pctN = pct.input.value.trim() ? Math.round(Number(pct.input.value.replace(",", ".")) * 100) : null, taxaN = taxa.input.value.trim() ? Math.round(Number(taxa.input.value.replace(",", ".")) * 100) : null;
        if (aporteC == null || (saldo.input.value.trim() && saldoC == null) || Number.isNaN(pctN) || Number.isNaN(taxaN)) { ui.msg = t("patrimonio.valorInvalido"); return render(); }
        const item = { nome: nome.input.value.trim(), contaId: conta.input.value, produto: produto.input.value, indexador: indexador.input.value, percentualBp: pctN, taxaBp: taxaN, isentoIR: isento.checked, aplicacao: aplicacao.input.value, vencimento: venc.input.value || null, aporteCentavos: aporteC, saldoInformadoCentavos: saldoC, dataSaldo: saldoC != null ? hoje : null };
        salvar((x) => (i ? editar(x, "investimentos", i.id, item, { agora: ctx.agora }) : adicionar(x, "investimentos", item, { novoId: ctx.novoId, agora: ctx.agora })));
        ui.editandoInv = null;
      } }, h("h3", null, i ? t("patrimonio.editarInvestimento") : t("patrimonio.novoInvestimento")), nome, conta, produto, indexador, pct, taxa, aporte, saldo, aplicacao, venc, isentoLabel,
        nota(h, t("patrimonio.semMarcacao")),
        h("div", { class: "botoes" }, h("button", { type: "submit" }, t("patrimonio.salvar")), i ? h("button", { type: "button", class: "peq", onclick: () => { ui.editandoInv = null; render(); } }, t("patrimonio.cancelar")) : null));
    }

    render();
    return { elemento: raiz, atualizar: render };
  },
};
