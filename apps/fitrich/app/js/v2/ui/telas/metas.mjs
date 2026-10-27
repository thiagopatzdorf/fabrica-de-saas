// Tela Metas: um cartão por meta com progresso e projeção em linguagem simples ("no ritmo atual, ~8 meses").
// Tipos: reserva (alvo em meses de despesa essencial), poupança %, treino/semana, peso, objetivo com prazo
// (aporte nominal e REAL) e independência financeira como faixa 3,5–4% em termos reais ("regra de bolso
// (EUA), não promessa"). "X das últimas 8 semanas", nunca sequência. Regra de cálculo vem de metas.mjs,
// shape.mjs, shape-financas.mjs e lancamentos-soma.mjs; aqui só se agrupa e apresenta.
import { TIPOS_META, adicionar, editar, remover, saldoDaConta } from "../../esquema.mjs";
import { despesaEssencialMedia, independenciaFinanceira, aporteMensalReal, progressoMeta, reservaEmergencia } from "../../metas.mjs";
import { despesasDoMes, receitasDoMes, taxaPoupancaBp } from "../../lancamentos-soma.mjs";
import { patrimonioLiquido } from "../../patrimonio.mjs";
import { semanasNaMeta } from "../../shape-financas.mjs";
import { mediaMovel, projecaoMeta, tendencia } from "../../../shape.mjs";
import { mesDe, somarDias, somarMeses } from "../../../datas.mjs";
import { alternador, aviso, barra, campo, centavosDeTexto, confirmar, dadosExternos, estado, nota, numeroDeTexto, selecionar, semanasGrade, stat, textoDeCentavos } from "./_comum.mjs";

export const TIPOS_DINHEIRO = ["reserva", "sinking", "objetivo"];

// ---------- lógica de apresentação pura (testada em Node) ----------

// Quanto a meta "tem" hoje: saldo da conta vinculada, senão o `atual` digitado.
export const atualDaMeta = (d, meta, hoje) => (meta.contaId ? saldoDaConta(d, meta.contaId, hoje) ?? 0 : Math.round(meta.atual ?? 0));

// Ritmo mensal em centavos: com conta vinculada, quanto o saldo dela andou nos últimos 3 meses ÷ 3; sem
// conta, a sobra média (receitas − despesas) dos 3 meses completos anteriores. null sem dado.
export function ritmoMensal(d, meta, hoje) {
  if (meta.contaId) {
    const agora = saldoDaConta(d, meta.contaId, hoje), antes = saldoDaConta(d, meta.contaId, somarDias(hoje, -91));
    if (agora == null || antes == null) return null;
    const c = d.contas.find((x) => x.id === meta.contaId);
    if (c && c.dataSaldoInicial > somarDias(hoje, -91)) return null; // a conta não tem 3 meses de história
    return Math.round((agora - antes) / 3);
  }
  const ym = mesDe(hoje), sobras = [];
  for (let k = 1; k <= 3; k++) { const m = somarMeses(ym, -k), r = receitasDoMes(d.lancamentos, m); if (r > 0) sobras.push(r - despesasDoMes(d.lancamentos, m)); }
  return sobras.length ? Math.round(sobras.reduce((s, v) => s + v, 0) / sobras.length) : null;
}

// Projeção: meses até o alvo no ritmo atual e o mês de chegada. null se o ritmo não leva lá (≤ 0) ou passa de 50 anos.
export function projecaoMeses(faltaCentavos, ritmoCentavos, ymHoje) {
  if (faltaCentavos <= 0) return { meses: 0, ym: ymHoje };
  if (ritmoCentavos == null || ritmoCentavos <= 0) return null;
  const meses = Math.ceil(faltaCentavos / ritmoCentavos);
  return meses > 600 ? null : { meses, ym: somarMeses(ymHoje, meses) };
}

// "X dos últimos N meses na meta de poupança" (o corrente é o último). Mês sem receita não conta de nenhum lado.
export function mesesNaMetaPoupanca(lancamentos, ymHoje, metaBp, n = 6) {
  const meses = [];
  for (let k = n - 1; k >= 0; k--) { const ym = somarMeses(ymHoje, -k), bp = taxaPoupancaBp(lancamentos, ym); meses.push({ ym, bp, naMeta: bp == null ? null : bp >= metaBp }); }
  const comDado = meses.filter((m) => m.naMeta != null);
  return { naMeta: comDado.filter((m) => m.naMeta).length, de: comDado.length, meses };
}

// Semanas de treino no formato da grade (inicio, naMeta), vindas do motor.
export const semanasTreino = (treinos, hoje, alvo) => semanasNaMeta({ treinos, hoje, metaTreinosSemana: alvo, n: 8 });

// Peso: média de 7 dias de hoje, ritmo e semanas até a meta.
export function resumoPeso(pesos, alvoKg, hoje) {
  const ate = pesos.filter((p) => p.data <= hoje);
  if (!ate.length) return { atualKg: null, ritmo: null, semanas: null };
  const mm = mediaMovel(ate, 7), atualKg = mm[mm.length - 1].kg, ritmo = tendencia(ate, hoje);
  return { atualKg, ritmo, semanas: ritmo ? projecaoMeta(atualKg, alvoKg, ritmo.kgPorSemana) : null };
}

// Alvo da reserva a partir de meses de cobertura e despesa essencial média; null sem despesa.
export const alvoReserva = (despesaEssencial, meses) => (despesaEssencial && meses >= 1 ? reservaEmergencia({ despesaEssencialMensalCentavos: despesaEssencial, mesesCobertura: meses }).alvoCentavos : null);

// ---------- tela ----------
export const tela = {
  id: "metas", titulo: "metas.titulo", icone: "flag", grupo: "principal", ordem: 30,
  css: ["/css/_telas.css", "/css/metas.css"], i18n: "/js/v2/ui/telas/metas.i18n.mjs",
  montar(ctx) {
    const { h, t, fmt } = ctx;
    const raiz = h("div", { class: "tela-metas" });
    const ui = { editando: null, nova: false, tipoForm: "objetivo", msg: null };
    const render = () => { ctx.limpar(raiz); raiz.append(...conteudo()); };
    const salvar = (fn) => ctx.mudar(fn).then(() => { ui.msg = null; }).catch((e) => { ui.msg = t("metas.erro", { codigo: (e?.erros ?? []).map((x) => x.codigo).join(", ") || String(e?.message ?? e) }); render(); });
    const mesAno = (ym) => fmt.mes(ym);

    function conteudo() {
      const d = ctx.estado(), hoje = ctx.hoje();
      const partes = [];
      if (ui.msg) partes.push(aviso(h, ui.msg));
      const cards = d.metas.map((m) => cartao(d, m, hoje));
      const form = formMeta(d, ui.editando ? d.metas.find((m) => m.id === ui.editando) : null, hoje);
      const abrir = alternador(h, { texto: t("metas.nova"), alvo: form, aberto: ui.nova || ui.editando != null });
      if (!d.metas.length) abrir.classList.remove("peq");
      partes.push(h("section", { class: "cartao sec-metas" }, h("h2", null, t("metas.titulo")), cards.length ? h("div", { class: "cards" }, cards) : ctx.estadoVazio({ icone: "metas", titulo: t("vazio.metas.titulo"), texto: t("vazio.metas.texto") }), h("div", { class: "botoes" }, abrir), form));
      partes.push(nota(h, t("metas.rodape")));
      return partes;
    }

    function cabecalho(m, valorTexto, acoes = true) {
      return h("header", { class: "meta-cab" }, h("div", null, h("span", { class: "meta-tipo" }, t(`metas.tipo.${m.tipo}`)), h("h3", null, m.nome)), h("b", { class: "meta-valor" }, valorTexto),
        acoes ? h("div", { class: "acoes" }, h("button", { type: "button", class: "peq", "aria-label": t("metas.editarX", { nome: m.nome }), onclick: () => { ui.editando = m.id; ui.tipoForm = m.tipo; render(); raiz.querySelector("#form-meta input")?.focus(); } }, t("metas.editar")),
          h("button", { type: "button", class: "peq", "aria-label": t("metas.apagarX", { nome: m.nome }), onclick: async () => { if (await confirmar(h, raiz, { titulo: t("metas.apagarMeta"), texto: m.nome, ok: t("metas.apagar"), cancelar: t("metas.cancelar") })) salvar((x) => remover(x, "metas", m.id, { agora: ctx.agora })); } }, t("metas.apagar"))) : null);
    }

    function cartao(d, m, hoje) {
      const ym = mesDe(hoje);
      switch (m.tipo) {
        case "treino": {
          const s = semanasTreino(d.treinos, hoje, m.alvo), atual = s.semanas[s.semanas.length - 1];
          return h("article", { class: "meta" }, cabecalho(m, t("metas.porSemana", { n: m.alvo })),
            estado(h, { codigo: atual.naMeta ? "ok" : "info", texto: t("metas.semanaAtual", { feitos: atual.total, alvo: m.alvo }) }),
            h("p", { class: "meta-frase" }, t("metas.semanasNaMeta", { x: s.naMeta, n: s.de })), semanasGrade(h, { semanas: s.semanas, rotulo: t("metas.semanasNaMeta", { x: s.naMeta, n: s.de }) }));
        }
        case "peso": {
          const r = resumoPeso(d.pesos, m.alvo, hoje);
          const frase = r.atualKg == null ? t("metas.pesoSemPesagem") : r.semanas === 0 ? t("metas.pesoAtingida") : r.semanas ? t("metas.pesoProjecao", { semanas: r.semanas, ritmo: `${r.ritmo.kgPorSemana > 0 ? "+" : ""}${fmt.numero(r.ritmo.kgPorSemana, 2)}` }) : r.ritmo ? t("metas.pesoSemProjecao") : t("metas.pesoPoucoDado");
          return h("article", { class: "meta" }, cabecalho(m, `${fmt.numero(m.alvo, 1)} kg`),
            r.atualKg != null ? h("div", { class: "grade" }, stat(h, { rotulo: t("metas.media7"), valor: `${fmt.numero(r.atualKg, 1)} kg` }), stat(h, { rotulo: t("metas.falta"), valor: `${fmt.numero(Math.abs(m.alvo - r.atualKg), 1)} kg` })) : null,
            h("p", { class: "meta-frase" }, frase));
        }
        case "poupanca": {
          const metaBp = Math.round(m.alvo * 100), p = mesesNaMetaPoupanca(d.lancamentos, ym, metaBp), atual = p.meses[p.meses.length - 1];
          return h("article", { class: "meta" }, cabecalho(m, fmt.percentualBp(metaBp, 0)),
            atual.bp == null ? estado(h, { codigo: "info", texto: t("metas.poupancaSemReceita") }) : estado(h, { codigo: atual.naMeta ? "ok" : "info", texto: t("metas.poupancaMes", { pct: fmt.percentualBp(atual.bp), alvo: fmt.percentualBp(metaBp, 0) }) }),
            barra(h, { fracao: atual.bp == null ? 0 : atual.bp / metaBp, rotulo: t("metas.poupancaMes", { pct: fmt.percentualBp(atual.bp ?? 0), alvo: fmt.percentualBp(metaBp, 0) }), classe: "barra-s3" }),
            h("p", { class: "meta-frase" }, t("metas.mesesNaMeta", { x: p.naMeta, n: p.de })));
        }
        case "independencia": {
          const ext = dadosExternos(d, hoje), liq = patrimonioLiquido(d, ext).liquido;
          const r = independenciaFinanceira({ despesaMensalCentavos: m.alvo, patrimonioCentavos: Math.max(0, liq) });
          return h("article", { class: "meta" }, cabecalho(m, t("metas.porMes", { valor: fmt.moeda(m.alvo) })),
            h("p", { class: "meta-frase" }, t("metas.indFaixa", { de: fmt.moeda(r.faixa.taxa400Bp), ate: fmt.moeda(r.faixa.taxa350Bp) })),
            barra(h, { fracao: (r.progressoBp ?? 0) / 10000, rotulo: t("metas.indProgresso", { pct: fmt.percentualBp(r.progressoBp ?? 0) }) }),
            h("p", { class: "meta-frase" }, t("metas.indProgresso", { pct: fmt.percentualBp(r.progressoBp ?? 0) })),
            nota(h, t("metas.indAviso")));
        }
        default: { // reserva, objetivo, sinking: dinheiro
          const atual = atualDaMeta(d, m, hoje), pr = progressoMeta(m, { atualCentavos: atual, hoje });
          const ritmo = ritmoMensal(d, m, hoje), proj = projecaoMeses(pr.faltaCentavos, ritmo, ym);
          const partes = [cabecalho(m, t("metas.deAte", { atual: fmt.moeda(atual), alvo: fmt.moeda(m.alvo) })), barra(h, { fracao: (pr.progressoBp ?? 0) / 10000, rotulo: t("metas.deAte", { atual: fmt.moeda(atual), alvo: fmt.moeda(m.alvo) }), classe: m.tipo === "reserva" ? "barra-s3" : null })];
          if (pr.codigo === "atingida") partes.push(estado(h, { codigo: "ok", texto: t("metas.atingida") }));
          else if (proj) partes.push(h("p", { class: "meta-frase" }, t("metas.projecao", { meses: proj.meses, mes: mesAno(proj.ym), ritmo: fmt.moeda(ritmo) })));
          else partes.push(h("p", { class: "meta-frase" }, t(ritmo == null ? "metas.semRitmo" : "metas.ritmoNaoLeva")));
          if (m.tipo === "reserva") {
            const ess = despesaEssencialMedia(d.lancamentos, d.categorias, ym);
            if (ess) { const re = reservaEmergencia({ despesaEssencialMensalCentavos: ess, mesesCobertura: Math.max(1, Math.round(m.alvo / ess)), atualCentavos: atual }); partes.push(nota(h, t("metas.reservaCobre", { meses: re.mesesCobertos ?? 0, despesa: fmt.moeda(ess) }))); }
            else partes.push(nota(h, t("metas.reservaSemDespesa")));
          }
          if (pr.mesesRestantes != null) {
            const real = aporteMensalReal({ alvoCentavosHoje: m.alvo, atualCentavos: atual, meses: pr.mesesRestantes, nominalAaBp: m.taxaBp ?? ctx.indices.cdiBp, inflacaoAaBp: m.inflacaoBp ?? ctx.indices.ipca12Bp });
            partes.push(h("div", { class: "grade" }, stat(h, { rotulo: t("metas.prazo"), valor: fmt.data(m.prazo), sub: t("metas.mesesRestantes", { n: pr.mesesRestantes }) }),
              stat(h, { rotulo: t("metas.aporteNominal"), valor: fmt.moeda(pr.aporteMensalCentavos), sub: t("metas.aporteNominalSub", { taxa: fmt.percentualBp(m.taxaBp ?? 0, 2) }) }),
              stat(h, { rotulo: t("metas.aporteReal"), valor: fmt.moeda(real.aporteCentavos), sub: t(real.avisos.includes("juro_real_negativo_tratado_como_zero") ? "metas.aporteRealNegativo" : "metas.aporteRealSub", { inflacao: fmt.percentualBp(m.inflacaoBp ?? ctx.indices.ipca12Bp, 2) }) })));
          } else if (pr.codigo === "prazo_vencido") partes.push(estado(h, { codigo: "info", texto: t("metas.prazoPassou", { data: fmt.data(m.prazo) }) }));
          return h("article", { class: "meta" }, partes);
        }
      }
    }

    function formMeta(d, m, hoje) {
      const tipoAtual = m?.tipo ?? ui.tipoForm;
      const tipo = selecionar(h, { rotulo: t("metas.tipoCol"), nome: "tipo", valor: tipoAtual, opcoes: TIPOS_META.map((v) => ({ valor: v, texto: t(`metas.tipo.${v}`) })) });
      tipo.input.disabled = Boolean(m);
      tipo.input.addEventListener("change", () => { ui.tipoForm = tipo.input.value; ui.nova = true; render(); raiz.querySelector("#form-meta select")?.focus(); });
      const nome = campo(h, { rotulo: t("metas.nome"), nome: "nome", valor: m?.nome ?? "", attrs: { required: true, maxlength: 60 } });
      const campos = [tipo, nome];
      const ess = despesaEssencialMedia(d.lancamentos, d.categorias, mesDe(hoje));
      let alvo, meses, prazo, conta, atual, taxa, inflacao;
      if (tipoAtual === "reserva") {
        meses = campo(h, { rotulo: t("metas.mesesCobertura"), nome: "meses", valor: m && ess ? String(Math.max(1, Math.round(m.alvo / ess))) : "6", attrs: { inputmode: "numeric" }, ajuda: ess ? t("metas.mesesAjuda", { despesa: fmt.moeda(ess) }) : t("metas.mesesSemDespesa") });
        alvo = campo(h, { rotulo: t("metas.alvoValor"), nome: "alvo", valor: m ? textoDeCentavos(m.alvo, ctx.idioma()) : "", attrs: { inputmode: "decimal" }, ajuda: t("metas.alvoOuMeses") });
        campos.push(meses, alvo);
      } else if (tipoAtual === "independencia") { alvo = campo(h, { rotulo: t("metas.despesaMensal"), nome: "alvo", valor: m ? textoDeCentavos(m.alvo, ctx.idioma()) : "", attrs: { inputmode: "decimal", required: true }, ajuda: t("metas.despesaMensalAjuda") }); campos.push(alvo); }
      else if (tipoAtual === "poupanca") { alvo = campo(h, { rotulo: t("metas.alvoPct"), nome: "alvo", valor: m ? String(m.alvo) : "20", attrs: { inputmode: "decimal", required: true } }); campos.push(alvo); }
      else if (tipoAtual === "treino") { alvo = campo(h, { rotulo: t("metas.alvoTreinos"), nome: "alvo", valor: m ? String(m.alvo) : "3", attrs: { inputmode: "numeric", required: true, min: 1, max: 14 } }); campos.push(alvo); }
      else if (tipoAtual === "peso") { alvo = campo(h, { rotulo: t("metas.alvoKg"), nome: "alvo", valor: m ? String(m.alvo) : "", attrs: { inputmode: "decimal", required: true } }); campos.push(alvo); }
      else { alvo = campo(h, { rotulo: t("metas.alvoValor"), nome: "alvo", valor: m ? textoDeCentavos(m.alvo, ctx.idioma()) : "", attrs: { inputmode: "decimal", required: true } }); campos.push(alvo); }
      if (TIPOS_DINHEIRO.includes(tipoAtual)) {
        conta = selecionar(h, { rotulo: t("metas.contaVinculada"), nome: "conta", valor: m?.contaId ?? "", opcoes: [{ valor: "", texto: t("metas.semConta") }, ...d.contas.filter((c) => !c.arquivada).map((c) => ({ valor: c.id, texto: c.nome }))] });
        atual = campo(h, { rotulo: t("metas.atualDigitado"), nome: "atual", valor: m?.atual != null ? textoDeCentavos(m.atual, ctx.idioma()) : "", attrs: { inputmode: "decimal" }, ajuda: t("metas.atualAjuda") });
        campos.push(conta, atual);
      }
      if (tipoAtual === "objetivo" || tipoAtual === "sinking") {
        prazo = campo(h, { rotulo: t("metas.prazo"), nome: "prazo", tipo: "date", valor: m?.prazo ?? "" });
        taxa = campo(h, { rotulo: t("metas.taxaAa"), nome: "taxa", valor: m?.taxaBp != null ? String(m.taxaBp / 100) : String(ctx.indices.cdiBp / 100), attrs: { inputmode: "decimal" }, ajuda: t("metas.taxaAjuda") });
        inflacao = campo(h, { rotulo: t("metas.inflacaoAa"), nome: "inflacao", valor: m?.inflacaoBp != null ? String(m.inflacaoBp / 100) : String(ctx.indices.ipca12Bp / 100), attrs: { inputmode: "decimal" }, ajuda: t("metas.inflacaoAjuda") });
        campos.push(prazo, taxa, inflacao);
      }
      return h("form", { id: "form-meta", class: "form-meta", onsubmit: (e) => {
        e.preventDefault();
        let alvoV;
        if (tipoAtual === "reserva") { const n = Number(meses.input.value); alvoV = alvo.input.value.trim() ? centavosDeTexto(alvo.input.value) : alvoReserva(ess, Number.isInteger(n) ? n : 0); }
        else if (tipoAtual === "poupanca" || tipoAtual === "peso") alvoV = numeroDeTexto(alvo.input.value);
        else if (tipoAtual === "treino") alvoV = Number(alvo.input.value);
        else alvoV = centavosDeTexto(alvo.input.value);
        if (alvoV == null || Number.isNaN(alvoV)) { ui.msg = t("metas.valorInvalido"); return render(); }
        const item = { nome: nome.input.value.trim(), tipo: tipoAtual, alvo: alvoV };
        if (conta) { item.contaId = conta.input.value || null; const a = atual.input.value.trim() ? centavosDeTexto(atual.input.value) : null; if (atual.input.value.trim() && a == null) { ui.msg = t("metas.valorInvalido"); return render(); } item.atual = a; }
        if (prazo) { item.prazo = prazo.input.value || null; item.taxaBp = taxa.input.value.trim() ? Math.round(numeroDeTexto(taxa.input.value) * 100) : null; item.inflacaoBp = inflacao.input.value.trim() ? Math.round(numeroDeTexto(inflacao.input.value) * 100) : null; }
        salvar((x) => (m ? editar(x, "metas", m.id, item, { agora: ctx.agora }) : adicionar(x, "metas", item, { novoId: ctx.novoId, agora: ctx.agora })));
        ui.editando = null; ui.nova = false;
      } }, h("h3", null, m ? t("metas.editarMeta") : t("metas.nova")), campos,
        h("div", { class: "botoes" }, h("button", { type: "submit" }, t("metas.salvar")), h("button", { type: "button", class: "peq", onclick: () => { ui.editando = null; ui.nova = false; render(); } }, t("metas.cancelar"))));
    }

    render();
    return { elemento: raiz, atualizar: render };
  },
};
