// Folha "Lançar": o caminho comum é valor → categoria → salvar (3 toques), com teclado numérico aberto,
// data = hoje e tipo = despesa por padrão. Texto livre opcional passa pelo parser local
// ("almoço 32 mercado"). Cartão com parcelas usa `gerarParcelas` (motor v2). Depois de salvar: Desfazer
// por 5 s (restaura o estado anterior, validado pelo `mudar`), "repetir todo mês?" cria uma recorrência,
// e os últimos 3 lançamentos ficam à vista. Nenhuma frase literal: tudo por t().
import { somarDias } from "../../../datas.mjs";
import { faturaDaCompra } from "../../cartao.mjs";
import { adicionar, editar } from "../../esquema.mjs";
import { gerarParcelas } from "../../parcelas.mjs";
import { contaSugerida, garantirConta } from "../conta-padrao.mjs";
import { icone } from "../icones.mjs";
import { analisar, lerValor } from "../parser-lancamento.mjs";

const SEGUNDOS_DESFAZER = 5;
const MAX_CHIPS = 8;

export const folha = {
  id: "lancar",
  css: "/css/lancar.css",
  i18n: "/js/v2/ui/telas/lancar.i18n.mjs",
  montar(ctx) {
    const { h, limpar, t, fmt } = ctx;
    const idioma = ctx.idioma();
    let tipo = "despesa", data = null, mostrarTodas = false, ultima = null, relogio = null, categoriaEscolhida = null, tocadoPeloParser = { valor: false, descricao: false };
    const nomeCat = (c) => (c.id.startsWith("cat-") ? t(`cat.${c.id}`) : c.nome);

    // ---- elementos fixos ----
    const dlg = h("dialog", { class: "folha lancar", "aria-labelledby": "lancar-h", onclick: (e) => { if (e.target === dlg) dlg.close(); } });
    const btnDespesa = h("button", { type: "button", class: "seg", "aria-pressed": "true", onclick: () => definirTipo("despesa") }, t("lancar.despesa"));
    const btnReceita = h("button", { type: "button", class: "seg", "aria-pressed": "false", onclick: () => definirTipo("receita") }, t("lancar.receita"));
    const valor = h("input", { id: "l-valor", class: "valor-input num", type: "text", inputmode: "decimal", autocomplete: "off", autofocus: true, placeholder: idioma === "en" ? "0.00" : "0,00", "aria-describedby": "l-erro", oninput: () => { tocadoPeloParser.valor = false; } });
    const texto = h("input", { id: "l-texto", type: "text", autocomplete: "off", placeholder: t("lancar.texto_exemplo"), oninput: aoDigitarTexto });
    const chips = h("div", { class: "chips", role: "radiogroup", "aria-labelledby": "l-cat-h" });
    const descricao = h("input", { id: "l-desc", type: "text", maxlength: "200", autocomplete: "off", oninput: () => { tocadoPeloParser.descricao = false; } });
    const dataInput = h("input", { id: "l-data", type: "date", onchange: () => { data = dataInput.value || ctx.hoje(); renderData(); } });
    const dataChips = h("div", { class: "chips data-chips" });
    const pagarCom = h("select", { id: "l-pagar", onchange: renderParcelas });
    const parcelas = h("select", { id: "l-parc" });
    const campoParcelas = h("label", { class: "campo", hidden: true }, h("span", null, t("lancar.parcelas")), parcelas);
    const erro = h("p", { id: "l-erro", class: "erro", role: "alert", hidden: true });
    const feito = h("section", { class: "feito", hidden: true, "aria-live": "polite" });
    const ultimos = h("ul", { class: "lista ultimos" });
    const detalhes = h("details", { class: "mais-opcoes" }, h("summary", null, icone("seta"), t("lancar.mais_opcoes")),
      h("div", { class: "campo" }, h("span", { id: "l-data-h" }, t("lancar.data")), dataChips),
      h("label", { class: "campo" }, h("span", null, t("lancar.pagar_com")), pagarCom),
      campoParcelas,
      h("label", { class: "campo" }, h("span", null, t("lancar.descricao")), descricao));
    const form = h("form", { class: "form-lancar", novalidate: true, onsubmit: salvar },
      h("label", { class: "campo valor" }, h("span", null, t("lancar.valor")), h("div", { class: "valor-campo" }, h("span", { class: "moeda", "aria-hidden": "true" }, fmt.moeda(0).replace(/[\d.,\s]/g, "")), valor)),
      h("label", { class: "campo texto" }, h("span", null, t("lancar.texto_rotulo")), texto),
      h("div", { class: "campo" }, h("span", { id: "l-cat-h" }, t("lancar.categoria")), chips),
      detalhes, erro,
      h("button", { type: "submit", class: "botao salvar" }, t("lancar.salvar")));
    dlg.append(h("div", { class: "folha-puxador" }),
      h("div", { class: "folha-cabeca" }, h("h2", { id: "lancar-h" }, t("lancar.titulo")), h("div", { class: "segmentos", role: "group", "aria-label": t("lancar.tipo") }, btnDespesa, btnReceita), h("button", { type: "button", class: "icone-btn", "aria-label": t("app.fechar"), onclick: () => dlg.close() }, icone("fechar"))),
      feito, form, h("section", { class: "ultimos-sec" }, h("h3", null, t("lancar.ultimos")), ultimos));
    dlg.addEventListener("close", () => { if (relogio) { clearInterval(relogio); relogio = null; } });

    // ---- categorias por uso recente ----
    function categoriasOrdenadas(d) {
      const uso = new Map();
      for (const l of d.lancamentos) if (l.categoriaId && l.origem !== "importacao") { const u = uso.get(l.categoriaId) ?? { ultima: "", n: 0 }; u.n++; if (l.data > u.ultima) u.ultima = l.data; uso.set(l.categoriaId, u); }
      return d.categorias.filter((c) => c.tipo === tipo).sort((a, b) => { const ua = uso.get(a.id), ub = uso.get(b.id); if (!!ua !== !!ub) return ua ? -1 : 1; if (ua && ub && ua.ultima !== ub.ultima) return ua.ultima < ub.ultima ? 1 : -1; return (ub?.n ?? 0) - (ua?.n ?? 0); });
    }
    function renderChips() {
      const d = ctx.estado(), todas = categoriasOrdenadas(d);
      const visiveis = mostrarTodas || todas.length <= MAX_CHIPS ? todas : todas.slice(0, MAX_CHIPS);
      if (categoriaEscolhida && !visiveis.some((c) => c.id === categoriaEscolhida)) { const c = todas.find((x) => x.id === categoriaEscolhida); if (c) visiveis.push(c); }
      limpar(chips);
      for (const c of visiveis) {
        const marcado = c.id === categoriaEscolhida;
        chips.append(h("label", { class: ["chip", marcado && "marcado"] },
          h("input", { type: "radio", name: "categoria", value: c.id, checked: marcado, onchange: () => { categoriaEscolhida = c.id; renderChips(); } }), h("span", null, nomeCat(c))));
      }
      if (!mostrarTodas && todas.length > MAX_CHIPS) chips.append(h("button", { type: "button", class: "chip mais", onclick: () => { mostrarTodas = true; renderChips(); } }, t("lancar.mais_categorias", { n: todas.length - MAX_CHIPS })));
    }
    function definirTipo(novo) {
      tipo = novo; categoriaEscolhida = null;
      btnDespesa.setAttribute("aria-pressed", String(tipo === "despesa")); btnReceita.setAttribute("aria-pressed", String(tipo === "receita"));
      dlg.classList.toggle("receita", tipo === "receita");
      renderChips(); renderPagarCom();
    }
    function renderData() {
      const hoje = ctx.hoje(), ontem = somarDias(hoje, -1);
      limpar(dataChips);
      const chip = (rot, iso) => h("button", { type: "button", class: ["chip", data === iso && "marcado"], "aria-pressed": String(data === iso), onclick: () => { data = iso; dataInput.value = iso; renderData(); } }, rot);
      dataInput.value = data; dataInput.max = hoje;
      dataChips.append(chip(t("lancar.hoje"), hoje), chip(t("lancar.ontem"), ontem), h("label", { class: ["chip", "chip-data", data !== hoje && data !== ontem && "marcado"] }, h("span", null, data !== hoje && data !== ontem ? fmt.data(data) : t("lancar.outra_data")), dataInput));
    }
    function renderPagarCom() {
      const d = ctx.estado(), atual = pagarCom.value, sugerida = contaSugerida(d);
      limpar(pagarCom);
      const contas = d.contas.filter((c) => !c.arquivada);
      if (!contas.length) pagarCom.append(h("option", { value: "conta:nova" }, t("conta.carteira")));
      for (const c of contas) pagarCom.append(h("option", { value: `conta:${c.id}`, selected: c.id === sugerida?.id }, c.nome));
      if (tipo === "despesa") for (const c of d.cartoes) pagarCom.append(h("option", { value: `cartao:${c.id}` }, `${c.nome} · ${t("lancar.cartao")}`));
      if ([...pagarCom.options].some((o) => o.value === atual)) pagarCom.value = atual;
      renderParcelas();
    }
    function renderParcelas() {
      const ehCartao = pagarCom.value.startsWith("cartao:");
      campoParcelas.hidden = !ehCartao;
      const cent = lerValor(valor.value, idioma);
      const n = Number(parcelas.value) || 1;
      limpar(parcelas);
      for (let k = 1; k <= 12; k++) parcelas.append(h("option", { value: String(k), selected: k === n }, k === 1 ? t("lancar.a_vista") : t("lancar.parcelas_opcao", { n: k, valor: cent ? fmt.moeda(Math.ceil(cent / k)) : "…" })));
    }
    function aoDigitarTexto() {
      const d = ctx.estado();
      const categorias = d.categorias.map((c) => ({ id: c.id, tipo: c.tipo, nomes: [c.nome, nomeCat(c)] }));
      const r = analisar(texto.value, { categorias, hoje: ctx.hoje(), idioma });
      if (r.tipo && r.tipo !== tipo && (r.categoriaId || r.tipo === "receita")) definirTipo(r.tipo);
      if (r.centavos != null && (!valor.value || tocadoPeloParser.valor)) { valor.value = fmt.numero(r.centavos / 100, 2); tocadoPeloParser.valor = true; renderParcelas(); }
      if (r.categoriaId && d.categorias.some((c) => c.id === r.categoriaId && c.tipo === tipo)) { categoriaEscolhida = r.categoriaId; renderChips(); }
      if (r.data && r.data !== data) { data = r.data; renderData(); }
      if (!descricao.value || tocadoPeloParser.descricao) { descricao.value = r.descricao; tocadoPeloParser.descricao = true; }
    }

    // ---- salvar / desfazer / repetir ----
    function mostrarErro(msg) { erro.textContent = msg; erro.hidden = !msg; }
    async function salvar(e) {
      e.preventDefault();
      mostrarErro("");
      const centavos = lerValor(valor.value, idioma);
      if (!centavos) { mostrarErro(t("lancar.erro_valor")); valor.focus(); return; }
      if (!categoriaEscolhida) { mostrarErro(t("lancar.erro_categoria")); return; }
      const [modo, idPag] = pagarCom.value.split(":");
      const n = modo === "cartao" ? Number(parcelas.value) || 1 : 1;
      const antes = ctx.estado(), hoje = ctx.hoje(), agora = ctx.agora;
      const base = { data, tipo, centavos, categoriaId: categoriaEscolhida, descricao: descricao.value.trim(), moeda: antes.perfil.moedaPadrao ?? "BRL", status: "efetivado", origem: "manual" };
      const ids = [];
      try {
        await ctx.mudar((d0) => {
          let d = garantirConta(d0, { nome: t("conta.carteira"), hoje, agora });
          if (modo === "cartao") {
            const cartao = d.cartoes.find((c) => c.id === idPag);
            if (n > 1) { for (const p of gerarParcelas({ compra: { ...base, id: ctx.novoId() }, cartao, n, novoId: ctx.novoId })) { ids.push(p.id); d = adicionar(d, "lancamentos", p, { agora }); } }
            else { const id = ctx.novoId(); ids.push(id); d = adicionar(d, "lancamentos", { ...base, id, cartaoId: cartao.id, meio: "credito", fatura: faturaDaCompra(cartao, data) }, { agora }); }
          } else {
            const contaId = idPag === "nova" || !d.contas.some((c) => c.id === idPag) ? contaSugerida(d).id : idPag;
            const id = ctx.novoId(); ids.push(id);
            d = adicionar(d, "lancamentos", { ...base, id, contaId, meio: "outro" }, { agora });
          }
          return d;
        });
      } catch (err) {
        mostrarErro(t("lancar.erro", { codigo: err?.erros?.[0]?.codigo ?? String(err?.message ?? err) }));
        return;
      }
      const cat = antes.categorias.find((c) => c.id === categoriaEscolhida);
      ultima = { antes, ids, centavos, n, categoriaId: categoriaEscolhida, tipo, data, descricao: base.descricao, modo, idPag, cartaoNome: antes.cartoes.find((c) => c.id === idPag)?.nome ?? "", nome: cat ? nomeCat(cat) : "" };
      limparForm();
      renderFeito();
      renderUltimos();
    }
    function limparForm() { valor.value = ""; texto.value = ""; descricao.value = ""; categoriaEscolhida = null; data = ctx.hoje(); tocadoPeloParser = { valor: false, descricao: false }; renderChips(); renderData(); renderParcelas(); }
    function renderFeito() {
      limpar(feito);
      if (!ultima) { feito.hidden = true; return; }
      feito.hidden = false;
      let restante = SEGUNDOS_DESFAZER;
      const btnDesfazer = h("button", { type: "button", class: "botao leve", onclick: desfazer }, icone("desfazer"), t("lancar.desfazer_s", { s: restante }));
      const resumo = ultima.n > 1 ? t("lancar.feito_parcelas", { valor: fmt.moeda(ultima.centavos), n: ultima.n, cartao: ultima.cartaoNome }) : t("lancar.feito", { valor: fmt.moeda(ultima.centavos), categoria: ultima.nome });
      const podeRepetir = ultima.n === 1;
      const btnRepetir = podeRepetir ? h("button", { type: "button", class: "botao leve", onclick: repetir }, t("lancar.repetir_sim", { dia: Number(ultima.data.slice(8, 10)) })) : null;
      feito.append(h("div", { class: "feito-linha" }, icone("ok"), h("p", null, resumo)),
        podeRepetir ? h("p", { class: "nota" }, t("lancar.repetir")) : null,
        h("div", { class: "acoes" }, btnDesfazer, btnRepetir, h("button", { type: "button", class: "botao fino", onclick: () => { ultima = null; renderFeito(); renderUltimos(); valor.focus(); } }, t("lancar.outro"))));
      if (relogio) clearInterval(relogio);
      relogio = setInterval(() => {
        restante -= 1;
        if (restante <= 0) { clearInterval(relogio); relogio = null; btnDesfazer.remove(); if (ultima) ultima.ids = []; renderUltimos(); return; }
        limpar(btnDesfazer).append(icone("desfazer"), t("lancar.desfazer_s", { s: restante }));
      }, 1000);
    }
    async function desfazer() {
      if (!ultima) return;
      const { antes } = ultima;
      if (relogio) { clearInterval(relogio); relogio = null; }
      try { await ctx.mudar(() => antes); } catch (err) { mostrarErro(t("lancar.erro", { codigo: err?.erros?.[0]?.codigo ?? "desfazer" })); return; }
      ultima = null;
      limpar(feito).append(h("div", { class: "feito-linha" }, icone("desfazer"), h("p", null, t("lancar.desfeito"))));
      renderUltimos();
      valor.focus();
    }
    async function repetir() {
      if (!ultima || ultima.n !== 1) return;
      const u = ultima, agora = ctx.agora;
      try {
        // O lançamento que acabou de ser salvo passa a ser a 1ª ocorrência (recorrenciaId + dataPrevista):
        // sem isso, o mesmo dia apareceria de novo como "próximo vencimento" pendente.
        await ctx.mudar((d0) => {
          const recId = ctx.novoId();
          const d = adicionar(d0, "recorrencias", { id: recId, nome: u.descricao || u.nome, tipo: u.tipo, centavos: u.centavos, categoriaId: u.categoriaId, ...(u.modo === "cartao" ? { cartaoId: u.idPag } : { contaId: d0.lancamentos.find((l) => l.id === u.ids[0])?.contaId ?? contaSugerida(d0).id }), freq: "mensal", intervalo: 1, diaDoMes: Number(u.data.slice(8, 10)), inicio: u.data, ativa: true }, { agora });
          return editar(d, "lancamentos", u.ids[0], { recorrenciaId: recId, dataPrevista: u.data }, { agora });
        });
      } catch (err) { mostrarErro(t("lancar.erro", { codigo: err?.erros?.[0]?.codigo ?? "repetir" })); return; }
      const aviso = h("p", { class: "nota repetido" }, icone("ok"), t("lancar.repetido"));
      feito.querySelector(".acoes")?.replaceWith(aviso);
    }
    function renderUltimos() {
      const d = ctx.estado();
      const lista = [...d.lancamentos].filter((l) => l.origem === "manual" && l.status !== "cancelado" && (l.tipo === "despesa" || l.tipo === "receita")).sort((a, b) => (a.atualizadoEm < b.atualizadoEm ? 1 : -1)).slice(0, 3);
      limpar(ultimos);
      if (!lista.length) { ultimos.append(h("li", { class: "nota" }, t("lancar.vazio_ultimos"))); return; }
      for (const l of lista) {
        const c = d.categorias.find((x) => x.id === l.categoriaId), nome = c ? nomeCat(c) : t("cat.sem-categoria");
        const desc = l.descricao && l.descricao.toLowerCase() !== nome.toLowerCase() && l.descricao.toLowerCase() !== (c?.nome ?? "").toLowerCase() ? l.descricao : "";
        ultimos.append(h("li", null,
          h("span", null, h("b", null, nome), desc ? ` · ${desc}` : "", l.parcela ? ` · ${l.parcela.n}/${l.parcela.de}` : "", h("small", null, ` ${fmt.dataCurta(l.data)}`)),
          h("span", { class: ["num", l.tipo === "receita" ? "pos" : "neg"] }, fmt.moeda(l.tipo === "receita" ? l.centavos : -l.centavos))));
      }
    }

    function abrir(params = {}) {
      definirTipo(params?.tipo === "receita" ? "receita" : "despesa");
      data = ctx.hoje(); renderData(); renderPagarCom(); renderUltimos();
      mostrarErro("");
      if (!dlg.open) dlg.showModal();
      valor.focus();
    }
    return { elemento: dlg, abrir, atualizar: () => { if (dlg.open) { renderChips(); renderPagarCom(); renderUltimos(); } }, destruir: () => { if (relogio) clearInterval(relogio); dlg.remove(); } };
  },
};
