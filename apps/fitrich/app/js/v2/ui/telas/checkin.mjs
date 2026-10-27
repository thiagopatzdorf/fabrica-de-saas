// Check-in semanal: 5 minutos, 5 passos com barra de progresso. 1/5 Corpo (peso de hoje, cintura opcional),
// 2/5 Treinos (faltou algum?), 3/5 Dinheiro (lançamentos importados sem categoria), 4/5 Saldos (reserva e
// contas), 5/5 Resumo (1 frase, 1 gráfico, cartão compartilhável SÓ com percentuais, exportar backup).
// Termina com "volte semana que vem"; nunca sequência. Segunda-feira e dia 1 trazem mensagem de recomeço.
import { TIPOS_TREINO, adicionar, editar, exportarJSON, saldoDaConta } from "../../esquema.mjs";
import { taxaPoupancaBp } from "../../lancamentos-soma.mjs";
import { patrimonioLiquido } from "../../patrimonio.mjs";
import { semanasNaMeta } from "../../shape-financas.mjs";
import { bemestarDoDia, salvarBemestar } from "../../corpo/bemestar.mjs";
import { mediaMovel, treinosNaSemana, treinosPorSemana } from "../../../shape.mjs";
import { mesDe, somarDias, somarMeses } from "../../../datas.mjs";
import { graficoColunas } from "../graficos-patrimonio.mjs";
import { aviso, baixar, campo, centavosDeTexto, dadosExternos, estado, gravarSnapshot, larguraGrafico, nota, numeroDeTexto, reconciliarConta, selecionar, textoDeCentavos } from "./_comum.mjs";

export const PASSOS = ["corpo", "treinos", "dinheiro", "saldos", "resumo"];

// ---------- lógica de apresentação pura (testada em Node) ----------
// Recomeço temporal: segunda-feira ou primeiro dia do mês. Mensagem de página nova, nunca "você quebrou".
export const ehRecomeco = (hoje) => new Date(hoje + "T00:00:00Z").getUTCDay() === 1 || hoje.slice(8, 10) === "01";

// Lançamentos importados que chegaram sem categoria (o check-in é onde se classificam).
export const semCategoria = (d) => d.lancamentos.filter((l) => l.categoriaId == null && (l.tipo === "despesa" || l.tipo === "receita") && l.status !== "cancelado");

// Os 7 dias até hoje (inclusive), do mais antigo ao mais novo, para "faltou algum treino?".
export const ultimos7Dias = (hoje) => Array.from({ length: 7 }, (_, i) => somarDias(hoje, i - 6));

// Números do resumo e do cartão: só proporções e kg, nenhum valor em dinheiro sai daqui para o cartão.
export function dadosDoResumo(d, hoje) {
  const ym = mesDe(hoje), metaTreino = d.metas.find((m) => m.tipo === "treino")?.alvo ?? null;
  const treinosSemana = treinosNaSemana(d.treinos, hoje).length;
  const semanas = metaTreino ? semanasNaMeta({ treinos: d.treinos, hoje, metaTreinosSemana: metaTreino, n: 8 }) : null;
  const pesos = d.pesos.filter((p) => p.data <= hoje), mm = mediaMovel(pesos, 7);
  const mediaHoje = mm.length ? mm[mm.length - 1].kg : null;
  const semanaPassada = mm.filter((p) => p.data <= somarDias(hoje, -7));
  const mediaAnterior = semanaPassada.length ? semanaPassada[semanaPassada.length - 1].kg : null;
  const poupancaBp = taxaPoupancaBp(d.lancamentos, ym);
  const liquido = patrimonioLiquido(d, dadosExternos(d, hoje)).liquido, ant = d.snapshots.find((s) => s.ym === somarMeses(ym, -1));
  const variacaoPatrimonioBp = ant && ant.patrimonioCentavos > 0 ? Math.round(((liquido - ant.patrimonioCentavos) / ant.patrimonioCentavos) * 10000) : null;
  return { ym, treinosSemana, metaTreino, semanasNaMeta: semanas ? semanas.naMeta : null, semanasDe: semanas ? semanas.de : null, mediaHoje, deltaKg: mediaHoje != null && mediaAnterior != null ? Math.round((mediaHoje - mediaAnterior) * 10) / 10 : null, poupancaBp, variacaoPatrimonioBp };
}

// Linhas do cartão compartilhável (texto já traduzido entra por `t`): percentuais e contagens, nunca R$.
export function linhasDoCartao(r, t, fmt) {
  const linhas = [];
  if (r.metaTreino) linhas.push(t("checkin.cartaoTreino", { x: r.semanasNaMeta, n: r.semanasDe }));
  else linhas.push(t("checkin.cartaoTreinosSemana", { n: r.treinosSemana }));
  if (r.poupancaBp != null) linhas.push(t("checkin.cartaoPoupanca", { pct: fmt.percentualBp(r.poupancaBp, 0) }));
  if (r.variacaoPatrimonioBp != null) linhas.push(t("checkin.cartaoPatrimonio", { pct: `${r.variacaoPatrimonioBp > 0 ? "+" : ""}${fmt.percentualBp(r.variacaoPatrimonioBp)}` }));
  if (r.deltaKg != null) linhas.push(t("checkin.cartaoPeso", { delta: `${r.deltaKg > 0 ? "+" : ""}${fmt.numero(r.deltaKg, 1)}` }));
  return linhas;
}

// ---------- tela ----------
export const tela = {
  id: "checkin", titulo: "checkin.titulo", icone: "check", grupo: "principal", ordem: 15,
  css: ["/css/_telas.css", "/css/checkin.css"], i18n: "/js/v2/ui/telas/checkin.i18n.mjs",
  montar(ctx) {
    const { h, hs, t, fmt } = ctx;
    const raiz = h("div", { class: "tela-checkin" });
    const ui = { passo: 0, msg: null, feito: { corpo: false, treinos: false, dinheiro: false, saldos: false }, backupFeito: false };
    const render = () => { ctx.limpar(raiz); raiz.append(...conteudo()); };
    const ir = (n) => { ui.passo = Math.max(0, Math.min(PASSOS.length - 1, n)); render(); raiz.querySelector("h2")?.focus(); };
    const salvar = (fn) => ctx.mudar(fn).then(() => { ui.msg = null; }).catch((e) => { ui.msg = t("checkin.erro", { codigo: (e?.erros ?? []).map((x) => x.codigo).join(", ") || String(e?.message ?? e) }); render(); });

    function conteudo() {
      const d = ctx.estado(), hoje = ctx.hoje(), passo = PASSOS[ui.passo];
      const partes = [cabecalho(hoje)];
      if (ui.msg) partes.push(aviso(h, ui.msg));
      partes.push({ corpo: corpo, treinos: treinos, dinheiro: dinheiro, saldos: saldos, resumo: resumo }[passo](d, hoje));
      return partes;
    }

    function cabecalho(hoje) {
      return h("header", { class: "chk-cab" },
        h("div", { class: "chk-prog" }, h("progress", { max: PASSOS.length, value: ui.passo + 1, "aria-label": t("checkin.passoDe", { n: ui.passo + 1, total: PASSOS.length, nome: t(`checkin.passo.${PASSOS[ui.passo]}`) }) }), h("span", null, t("checkin.passoDe", { n: ui.passo + 1, total: PASSOS.length, nome: t(`checkin.passo.${PASSOS[ui.passo]}`) }))),
        ui.passo === 0 ? h("p", { class: "leg" }, t(ehRecomeco(hoje) ? "checkin.recomeco" : "checkin.intro", { data: fmt.dataLonga(hoje) })) : null);
    }
    const navegacao = (avancar, { podeVoltar = true, textoAvancar = t("checkin.continuar") } = {}) => h("div", { class: "botoes chk-nav" }, podeVoltar && ui.passo > 0 ? h("button", { type: "button", class: "peq", onclick: () => ir(ui.passo - 1) }, t("checkin.voltar")) : null, avancar === "pular" ? h("button", { type: "button", class: "peq", onclick: () => ir(ui.passo + 1) }, t("checkin.pular")) : null, avancar === "submit" ? h("button", { type: "submit" }, textoAvancar) : avancar === "proximo" ? h("button", { type: "button", onclick: () => ir(ui.passo + 1) }, textoAvancar) : null);
    const titulo = (texto) => h("h2", { tabindex: "-1" }, texto);

    // 1/5 Corpo
    function corpo(d, hoje) {
      const deHoje = d.pesos.find((p) => p.data === hoje);
      const peso = campo(h, { rotulo: t("checkin.pesoHoje"), nome: "ckg", valor: deHoje ? String(deHoje.kg) : "", attrs: { inputmode: "decimal", placeholder: "80,5", autofocus: true } });
      const cintura = campo(h, { rotulo: t("checkin.cinturaOpcional"), nome: "ccint", valor: "", attrs: { inputmode: "decimal" } });
      // Sono e energia da tela Corpo: o mesmo registro do dia (`bemestar`), sem duplicar a conta nem a tela.
      const bem = bemestarDoDia(d, hoje);
      const sono = campo(h, { rotulo: t("checkin.sonoOpcional"), nome: "csono", valor: bem?.sonoHoras != null ? String(bem.sonoHoras).replace(".", ctx.idioma() === "en" ? "." : ",") : "", attrs: { inputmode: "decimal", placeholder: "7,5" } });
      const energia = selecionar(h, { rotulo: t("checkin.energiaOpcional"), nome: "cener", valor: bem?.energia ?? "", opcoes: [{ valor: "", texto: t("checkin.pular") }, ...[1, 2, 3, 4, 5].map((n) => ({ valor: String(n), texto: String(n) }))] });
      const form = h("form", { class: "chk-form", onsubmit: (e) => {
        e.preventDefault();
        const kg = peso.input.value.trim() ? numeroDeTexto(peso.input.value) : null, cm = cintura.input.value.trim() ? numeroDeTexto(cintura.input.value) : null;
        const horas = sono.input.value.trim() ? numeroDeTexto(sono.input.value) : null, en = energia.input.value ? Number(energia.input.value) : null;
        if ((peso.input.value.trim() && (kg == null || kg < 20 || kg > 500)) || (cintura.input.value.trim() && cm == null) || (sono.input.value.trim() && (horas == null || horas < 0 || horas > 24))) { ui.msg = t("checkin.valorInvalido"); return render(); }
        if (kg == null && cm == null && horas == null && en == null) return ir(1);
        ui.feito.corpo = true; ui.passo = 1;
        salvar((x) => { let n = x; if (kg != null) n = deHoje ? editar(n, "pesos", deHoje.id, { kg }, { agora: ctx.agora }) : adicionar(n, "pesos", { data: hoje, kg }, { novoId: ctx.novoId, agora: ctx.agora }); if (cm != null) n = adicionar(n, "medidas", { data: hoje, cinturaCm: cm }, { novoId: ctx.novoId, agora: ctx.agora }); if (horas != null || en != null) n = salvarBemestar(n, hoje, { ...(horas != null ? { sonoHoras: horas } : {}), ...(en != null ? { energia: en } : {}) }, { novoId: ctx.novoId, agora: ctx.agora }); return n; }).then(() => raiz.querySelector("h2")?.focus());
      } }, peso, cintura, sono, energia, deHoje ? nota(h, t("checkin.pesoJaRegistrado", { kg: fmt.numero(deHoje.kg, 1) })) : null, navegacao("submit"), h("div", { class: "botoes" }, h("button", { type: "button", class: "peq", onclick: () => ir(1) }, t("checkin.pular")), h("button", { type: "button", class: "peq", onclick: () => ctx.navegar("corpo") }, t("checkin.abrirCorpo"))));
      return h("section", { class: "cartao chk-passo" }, titulo(t("checkin.corpo")), nota(h, t("checkin.corpoComo")), form);
    }

    // 2/5 Treinos
    function treinos(d, hoje) {
      const dias = ultimos7Dias(hoje), feitos = d.treinos.filter((x) => x.data >= dias[0] && x.data <= hoje);
      const lista = h("ul", { class: "chk-dias" }, dias.map((dia) => { const n = feitos.filter((x) => x.data === dia).length; return h("li", { class: n ? "dia-ok" : null }, h("span", { class: "dia-nome" }, `${fmt.diaDaSemana(dia)} ${fmt.dataCurta(dia)}`), estado(h, { codigo: n ? "ok" : "info", texto: n ? t("checkin.treinosNoDia", { n }) : t("checkin.semTreino") })); }));
      const data = selecionar(h, { rotulo: t("checkin.dia"), nome: "tdia", valor: hoje, opcoes: dias.map((x) => ({ valor: x, texto: `${fmt.diaDaSemana(x)} ${fmt.dataCurta(x)}` })) });
      const tipo = selecionar(h, { rotulo: t("checkin.tipo"), nome: "ttipo", valor: TIPOS_TREINO[0], opcoes: TIPOS_TREINO.map((v) => ({ valor: v, texto: t(`checkin.tipoTreino.${v}`) })) });
      const min = campo(h, { rotulo: t("checkin.minutos"), nome: "tmin", valor: "45", attrs: { inputmode: "numeric", required: true } });
      const form = h("form", { class: "chk-form", onsubmit: (e) => { e.preventDefault(); const m = Number(min.input.value); if (!Number.isInteger(m) || m < 1) { ui.msg = t("checkin.valorInvalido"); return render(); } ui.feito.treinos = true; salvar((x) => adicionar(x, "treinos", { data: data.input.value, tipo: tipo.input.value, minutos: m, esforco: 3 }, { novoId: ctx.novoId, agora: ctx.agora })); } },
        h("h3", null, t("checkin.faltouAlgum")), data, tipo, min, h("div", { class: "botoes" }, h("button", { type: "submit", class: "peq" }, t("checkin.adicionarTreino"))));
      return h("section", { class: "cartao chk-passo" }, titulo(t("checkin.treinos")), h("p", { class: "leg" }, t("checkin.treinosSemana", { n: feitos.length })), lista, form, navegacao("proximo"));
    }

    // 3/5 Dinheiro: classificar o que chegou sem categoria.
    function dinheiro(d, hoje) {
      const pend = semCategoria(d);
      const itens = pend.map((l) => {
        const cats = d.categorias.filter((c) => c.tipo === l.tipo);
        const sel = selecionar(h, { rotulo: t("checkin.categoriaPara", { desc: l.descricao || t("checkin.semDescricao") }), nome: `cat-${l.id}`, valor: "", opcoes: [{ valor: "", texto: t("checkin.escolher") }, ...cats.map((c) => ({ valor: c.id, texto: c.nome }))] });
        sel.input.addEventListener("change", () => { if (sel.input.value) { ui.feito.dinheiro = true; salvar((x) => editar(x, "lancamentos", l.id, { categoriaId: sel.input.value }, { agora: ctx.agora })); } });
        return h("li", null, h("div", { class: "lanc" }, h("b", null, `${l.tipo === "despesa" ? "−" : "+"}${fmt.moeda(l.centavos, l.moeda)}`), h("small", null, `${fmt.data(l.data)} · ${l.descricao || t("checkin.semDescricao")}`)), sel);
      });
      return h("section", { class: "cartao chk-passo" }, titulo(t("checkin.dinheiro")),
        pend.length ? h("p", { class: "leg" }, t("checkin.semCategoria", { n: pend.length })) : estado(h, { codigo: "ok", texto: t("checkin.tudoClassificado") }),
        pend.length ? h("ul", { class: "chk-lancs" }, itens) : null, nota(h, t("checkin.dinheiroComo")), navegacao("proximo"));
    }

    // 4/5 Saldos: reserva e contas; cartões só leitura (a fatura vem dos lançamentos).
    function saldos(d, hoje) {
      const contas = d.contas.filter((c) => !c.arquivada && !(c.tipo === "investimento" && d.investimentos.some((i) => i.contaId === c.id)));
      const ordem = [...contas].sort((a, b) => (a.tipo === "poupanca" ? -1 : b.tipo === "poupanca" ? 1 : 0));
      const campos = ordem.map((c) => campo(h, { rotulo: `${c.nome} · ${t(`checkin.tipo.${c.tipo}`)}`, nome: `s-${c.id}`, valor: textoDeCentavos(saldoDaConta(d, c.id, hoje), ctx.idioma()), attrs: { inputmode: "decimal" } }));
      const invs = d.investimentos.map((i) => campo(h, { rotulo: i.nome, nome: `i-${i.id}`, valor: textoDeCentavos(i.saldoInformadoCentavos ?? i.aporteCentavos, ctx.idioma()), attrs: { inputmode: "decimal" } }));
      const faturas = dadosExternos(d, hoje).faturasEmAberto.map((f) => { const c = d.cartoes.find((x) => x.id === f.cartaoId); return h("li", null, h("span", null, c?.nome ?? f.cartaoId), h("b", null, fmt.moeda(f.centavos))); });
      const form = h("form", { class: "chk-form", onsubmit: (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        ui.feito.saldos = true; ui.passo = 4;
        salvar((x) => {
          let n = x;
          for (const c of ordem) { const v = centavosDeTexto(fd.get(`s-${c.id}`)); if (v == null) throw new Error("valor_invalido"); if (v !== saldoDaConta(n, c.id, hoje)) n = reconciliarConta(n, c.id, v, hoje, { agora: ctx.agora }); }
          for (const i of d.investimentos) { const v = centavosDeTexto(fd.get(`i-${i.id}`)); if (v == null) throw new Error("valor_invalido"); if (v !== (i.saldoInformadoCentavos ?? i.aporteCentavos)) n = editar(n, "investimentos", i.id, { saldoInformadoCentavos: v, dataSaldo: hoje }, { agora: ctx.agora }); }
          return gravarSnapshot(n, hoje, ctx.agora);
        }).then(() => raiz.querySelector("h2")?.focus());
      } }, campos.length || invs.length ? [campos, invs] : ctx.estadoVazio({ icone: "patrimonio", titulo: t("vazio.checkin_sem_contas.titulo"), texto: t("vazio.checkin_sem_contas.texto") }), faturas.length ? h("div", { class: "chk-faturas" }, h("h3", null, t("checkin.faturasAbertas")), h("ul", { class: "lista-simples" }, faturas), nota(h, t("checkin.faturasComo"))) : null,
        nota(h, t("checkin.saldosComo")), navegacao(campos.length || invs.length ? "submit" : "proximo", { textoAvancar: t("checkin.gravarSaldos") }), h("div", { class: "botoes" }, h("button", { type: "button", class: "peq", onclick: () => ir(4) }, t("checkin.pular"))));
      return h("section", { class: "cartao chk-passo" }, titulo(t("checkin.saldos")), form);
    }

    // 5/5 Resumo: 1 frase, 1 gráfico, cartão compartilhável sem R$, exportar backup, "volte semana que vem".
    function resumo(d, hoje) {
      const r = dadosDoResumo(d, hoje);
      const frase = t("checkin.frase", { treinos: r.metaTreino ? t("checkin.fraseTreinoMeta", { x: r.treinosSemana, alvo: r.metaTreino }) : t("checkin.fraseTreinos", { n: r.treinosSemana }), peso: r.mediaHoje != null ? t("checkin.frasePeso", { kg: fmt.numero(r.mediaHoje, 1), delta: r.deltaKg == null ? "" : ` (${r.deltaKg > 0 ? "+" : ""}${fmt.numero(r.deltaKg, 1)} kg)` }) : t("checkin.frasePesoSem"), dinheiro: r.poupancaBp != null ? t("checkin.frasePoupanca", { pct: fmt.percentualBp(r.poupancaBp, 0) }) : t("checkin.frasePoupancaSem") });
      const semanas = treinosPorSemana(d.treinos, hoje, 8);
      const svg = graficoColunas({ hs, largura: larguraGrafico(), titulo: t("checkin.grafico"), desc: t("checkin.graficoDesc"), grupos: semanas.map((s) => ({ rotulo: fmt.dataCurta(s.inicio), valor: s.total, tip: `${fmt.data(s.inicio)}: ${s.total}` })), meta: r.metaTreino, rotuloMeta: r.metaTreino ? t("checkin.metaN", { n: r.metaTreino }) : "", fmtY: (v) => fmt.numero(v) });
      const linhas = linhasDoCartao(r, t, fmt);
      const canvas = h("canvas", { width: 1080, height: 1080, class: "chk-canvas", role: "img", "aria-label": `${t("checkin.cartaoTitulo", { data: fmt.dataCurta(hoje) })}. ${linhas.join(". ")}` });
      queueMicrotask(() => desenharCartao(canvas, linhas, hoje));
      const compartilhar = h("button", { type: "button", onclick: () => compartilharCartao(canvas, hoje) }, t("checkin.compartilhar"));
      const baixarImg = h("button", { type: "button", class: "peq", onclick: () => canvas.toBlob((b) => baixar(document, `fitrich-semana-${hoje}.png`, b, "image/png")) }, t("checkin.baixarImagem"));
      const backup = h("button", { type: "button", class: "peq", onclick: () => { baixar(document, `fitrich-${hoje}.json`, exportarJSON(d), "application/json"); ui.backupFeito = true; salvar((x) => ({ ...x, meta: { ...x.meta, ultimoBackupEm: ctx.agora(), atualizadoEm: ctx.agora() } })); } }, t("checkin.exportarBackup"));
      const feitos = Object.values(ui.feito).filter(Boolean).length;
      return h("section", { class: "cartao chk-passo chk-resumo" }, titulo(t("checkin.resumo")),
        h("p", { class: "chk-frase" }, frase),
        h("div", { class: "graf" }, svg),
        h("h3", null, t("checkin.cartao")), nota(h, t("checkin.cartaoComo")), h("div", { class: "chk-cartao" }, canvas), h("ul", { class: "chk-linhas" }, linhas.map((l) => h("li", null, l))),
        h("div", { class: "botoes" }, compartilhar, baixarImg),
        h("h3", null, t("checkin.backup")), nota(h, d.meta.ultimoBackupEm ? t("checkin.ultimoBackup", { data: fmt.data(d.meta.ultimoBackupEm.slice(0, 10)) }) : t("checkin.semBackup")), h("div", { class: "botoes" }, backup, ui.backupFeito ? estado(h, { codigo: "ok", texto: t("checkin.backupFeito") }) : null),
        h("p", { class: "chk-fim" }, estado(h, { codigo: "ok", texto: t("checkin.fim", { n: feitos }) })), h("p", { class: "leg" }, t("checkin.volte")),
        navegacao(null));
    }

    // Cartão em <canvas>: cores lidas dos tokens do tema; só percentuais e contagens, nenhum valor em dinheiro.
    function desenharCartao(canvas, linhas, hoje) {
      const g = canvas.getContext("2d"); if (!g) return;
      const cs = getComputedStyle(document.documentElement), cor = (n, pad) => (cs.getPropertyValue(n).trim() || pad);
      const sup = cor("--sup", "#1a1a19"), ink = cor("--ink", "#ffffff"), ink2 = cor("--ink2", "#c3c2b7"), s1 = cor("--s1", "#3987e5"), s3 = cor("--s3", "#1b9e8a");
      g.fillStyle = sup; g.fillRect(0, 0, 1080, 1080);
      g.fillStyle = s1; g.fillRect(0, 0, 1080, 18);
      g.fillStyle = ink2; g.font = "600 36px Sora, system-ui, sans-serif"; g.fillText("FITRICH", 80, 130);
      g.fillStyle = ink; g.font = "700 64px Sora, system-ui, sans-serif"; g.fillText(t("checkin.cartaoTitulo", { data: fmt.dataCurta(hoje) }), 80, 230);
      g.font = "500 44px Manrope, system-ui, sans-serif";
      linhas.forEach((l, i) => { g.fillStyle = i % 2 ? s3 : s1; g.fillRect(80, 330 + i * 130, 16, 64); g.fillStyle = ink; quebrar(g, l, 120, 380 + i * 130, 880, 56); });
      g.fillStyle = ink2; g.font = "400 30px Manrope, system-ui, sans-serif"; g.fillText(t("checkin.cartaoRodape"), 80, 1000);
    }
    function quebrar(g, texto, x, y, maxW, lh) {
      const palavras = texto.split(" "); let linha = "";
      for (const p of palavras) { const tent = linha ? `${linha} ${p}` : p; if (g.measureText(tent).width > maxW && linha) { g.fillText(linha, x, y); y += lh; linha = p; } else linha = tent; }
      g.fillText(linha, x, y);
    }
    async function compartilharCartao(canvas, hoje) {
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      const arquivo = typeof File === "function" && blob ? new File([blob], `fitrich-semana-${hoje}.png`, { type: "image/png" }) : null;
      try {
        if (arquivo && navigator.share && (!navigator.canShare || navigator.canShare({ files: [arquivo] }))) { await navigator.share({ files: [arquivo], title: t("checkin.cartaoTitulo", { data: fmt.dataCurta(hoje) }) }); return; }
      } catch (e) { if (e?.name === "AbortError") return; }
      if (blob) baixar(document, `fitrich-semana-${hoje}.png`, blob, "image/png");
    }

    render();
    return { elemento: raiz, atualizar: render };
  },
};
