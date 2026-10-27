// Tela "Regras": as regras de categoria à vista, editáveis e explicáveis. Nada de modelo opaco: toda sugestão
// aponta para uma regra que a pessoa lê, edita ou apaga. As regras da BASE (categorias-br.json) vivem em memória
// e não são gravadas (o esquema exige `categoriaId` em `regras`, e metade da base não tem par nas categorias
// da pessoa); as regras do usuário e as aprendidas ficam em `dados.regras`.
import { ordenar } from "../../esquema.mjs";
import { LIMITE_REGEX, categorizar, compararRegras, criarRegra, editarRegra, normalizarDescricao, regraCasa, regrasDaBase, removerRegra, validarRegex } from "../../categorizar/regras.mjs";
import { aprender } from "../../categorizar/aprender.mjs";
import BASE from "../../categorizar/categorias-br.mjs";

// Mesmo mapa da tela Importar (as duas precisam resolver "Restaurante e delivery" → "Delivery e restaurante").
export const ALIASES_BASE = { "Restaurante e delivery": "Delivery e restaurante", Pets: "Pet", Impostos: "Impostos e taxas", "Tarifas e juros": "Impostos e taxas", "Saúde": "Saúde e fitness" };
export const categoriasParaBase = (categorias) => [...categorias, ...Object.entries(ALIASES_BASE).map(([nomeBase, nomeNucleo]) => ({ nome: nomeBase, id: categorias.find((c) => c.nome === nomeNucleo)?.id })).filter((c) => c.id)];
export const regrasBase = (dados) => regrasDaBase(BASE, categoriasParaBase(dados.categorias));
export const LIMITE_LISTA = 100;
export const todasAsRegras = (dados) => [...(dados.regras ?? []), ...regrasBase(dados)];

// "Por que esta regra casou": a descrição normalizada, a regra vencedora e as que perderam (em ordem de decisão).
export function explicar(descricao, regras) {
  const normalizada = normalizarDescricao(descricao);
  const candidatas = regras.filter((r) => r.ativa !== false && regraCasa(r, normalizada)).sort(compararRegras);
  return { normalizada, vencedora: candidatas[0] ?? null, perderam: candidatas.slice(1, 6), resultado: categorizar(descricao, regras) };
}

// Filtro e ordem da lista: origem ("minhas" = usuario+aprendida, o padrão: a base tem ~650 regras e afogaria a lista;
// todas/usuario/aprendida/base) e busca sem acento no padrão ou no nome da categoria. Buscar abre a base também.
export function filtrarRegras(regras, { origem = "minhas", busca = "" } = {}, nomeCategoria = () => null) {
  const q = normalizarDescricao(busca);
  const casaOrigem = (r) => origem === "todas" || (origem === "minhas" ? r.origem !== "base" || q.length > 0 : r.origem === origem);
  return regras.filter((r) => casaOrigem(r) && (!q || normalizarDescricao(r.padrao).includes(q) || normalizarDescricao(nomeCategoria(r.categoriaId) ?? r.categoriaNome ?? "").includes(q))).sort(compararRegras);
}

// Lançamentos importados mais recentes (os que uma regra pode explicar), mais novos primeiro.
export const importadosRecentes = (dados, n = 20) => [...dados.lancamentos.filter((l) => l.origem === "importacao" && l.tipo !== "transferencia")].sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0)).slice(0, n);

export const tela = {
  id: "regras", titulo: "regras.titulo", icone: "rules", grupo: "mais", ordem: 71,
  css: "/css/regras.css", i18n: "/js/v2/ui/telas/regras.i18n.mjs",
  montar(ctx) {
    const { h, t, fmt, limpar } = ctx;
    const raiz = h("section", { class: "fr", "aria-labelledby": "fr-titulo" });
    const st = { origem: "minhas", busca: "", editando: null, teste: "", explicando: null, aviso: null, aprendido: null };
    const nomeCategoria = (id) => ctx.estado().categorias.find((c) => c.id === id)?.nome ?? null;

    const dialogo = ({ titulo, texto, ok, perigo = false }) => new Promise((resolve) => {
      const fecha = (v) => { dlg.close(); dlg.remove(); resolve(v); };
      const dlg = h("dialog", { class: "fr-dialogo", "aria-labelledby": "fr-dlg-t", onclose: () => { dlg.remove(); resolve(false); } },
        h("h3", { id: "fr-dlg-t" }, titulo), h("p", null, texto),
        h("div", { class: "fr-acoes" }, h("button", { type: "button", class: "fr-btn", onclick: () => fecha(false) }, t("regras.cancelar")), h("button", { type: "button", class: ["fr-btn", perigo ? "fr-perigo" : "fr-primario"], onclick: () => fecha(true) }, ok)));
      raiz.append(dlg); dlg.showModal();
    });
    const gravar = async (fn, avisoOk) => { try { await ctx.mudar(fn); st.aviso = avisoOk ?? null; } catch (e) { st.aviso = t("regras.falhouGravar", { motivo: e?.erros?.map((x) => x.codigo).join(", ") ?? e?.message ?? "" }); } render(); };

    function render() {
      limpar(raiz);
      const d = ctx.estado();
      raiz.append(h("h2", { id: "fr-titulo" }, t("regras.titulo")), h("p", { class: "fr-sub" }, t("regras.subtitulo")));
      if (st.aviso) raiz.append(h("p", { class: "fr-aviso", role: "status", "aria-live": "polite" }, st.aviso));
      if (st.aprendido) raiz.append(renderAprendido());
      raiz.append(renderTestar(d));
      raiz.append(renderLista(d));
      raiz.append(renderRecentes(d));
      raiz.append(h("div", { class: "fr-cartao" }, h("h3", null, t("regras.restaurar.titulo")), h("p", null, t("regras.restaurar.explica", { n: (d.regras ?? []).length })), h("button", { type: "button", class: "fr-btn", disabled: !(d.regras ?? []).length, onclick: restaurar }, t("regras.restaurar.botao"))));
    }

    // ---- testar uma descrição ----
    function renderTestar(d) {
      const entrada = h("input", { id: "fr-teste", class: "fr-campo", type: "text", maxlength: 200, value: st.teste, placeholder: t("regras.testar.exemplo"), autocomplete: "off", oninput: (e) => { st.teste = e.target.value; limpar(saida); saida.append(...explicacao(st.teste, d)); } });
      const saida = h("div", { class: "fr-explica", role: "status", "aria-live": "polite" }, ...explicacao(st.teste, d));
      return h("div", { class: "fr-cartao" }, h("h3", null, t("regras.testar.titulo")), h("label", { for: "fr-teste" }, t("regras.testar.rotulo")), entrada, saida);
    }
    function explicacao(descricao, d) {
      if (!String(descricao).trim()) return [];
      const ex = explicar(descricao, todasAsRegras(d));
      const nome = (r) => nomeCategoria(r.categoriaId) ?? r.categoriaNome ?? t("regras.semCategoria");
      const partes = [h("p", { class: "fr-mudo" }, t("regras.testar.normalizada"), " ", h("code", null, ex.normalizada || "∅"))];
      if (!ex.vencedora) partes.push(h("p", null, t("regras.testar.nenhuma")));
      else {
        partes.push(h("p", null, t("regras.testar.vencedora", { categoria: nome(ex.vencedora) }), " ", h("code", null, ex.vencedora.padrao), " ", h("span", { class: ["fr-origem", `fr-origem-${ex.vencedora.origem}`] }, t(`regras.origem.${ex.vencedora.origem}`)), " ", h("span", { class: "fr-mudo" }, t(`regras.testar.porque.${ex.vencedora.tipo}`))));
        if (!ex.vencedora.categoriaId) partes.push(h("p", { class: "fr-mudo" }, t("regras.testar.semId", { nome: ex.vencedora.categoriaNome ?? "?" })));
        if (ex.perderam.length) partes.push(h("p", { class: "fr-mudo" }, t("regras.testar.perderam", { n: ex.perderam.length }), " ", ...ex.perderam.flatMap((r, i) => [i ? ", " : "", h("code", null, r.padrao), ` (${t(`regras.origem.${r.origem}`)} → ${nome(r)})`])));
      }
      return partes;
    }

    // ---- lista + formulário ----
    function renderLista(d) {
      const todas = todasAsRegras(d);
      const lista = filtrarRegras(todas, { origem: st.origem, busca: st.busca }, nomeCategoria);
      const busca = h("input", { id: "fr-busca", class: "fr-campo", type: "search", value: st.busca, placeholder: t("regras.lista.buscaExemplo"), oninput: (e) => { st.busca = e.target.value; render(); } });
      const filtro = h("select", { id: "fr-origem", class: "fr-campo", onchange: (e) => { st.origem = e.target.value; render(); } }, ...["minhas", "todas", "usuario", "aprendida", "base"].map((o) => h("option", { value: o, selected: st.origem === o }, t(`regras.filtro.${o}`))));
      const contagem = { usuario: 0, aprendida: 0, base: 0 };
      for (const r of todas) contagem[r.origem] = (contagem[r.origem] ?? 0) + 1;
      const cab = h("div", { class: "fr-cartao" }, h("div", { class: "fr-topo" }, h("h3", null, t("regras.lista.titulo")), h("button", { type: "button", class: "fr-btn fr-primario", onclick: () => { st.editando = { nova: true, tipo: "contem", padrao: "", categoriaId: "", prioridade: 0 }; render(); } }, t("regras.nova"))),
        h("p", { class: "fr-mudo" }, t("regras.lista.contagem", { usuario: contagem.usuario, aprendida: contagem.aprendida, base: contagem.base })),
        h("div", { class: "fr-filtros" }, h("div", { class: "fr-campo-bloco" }, h("label", { for: "fr-busca" }, t("regras.lista.busca")), busca), h("div", { class: "fr-campo-bloco" }, h("label", { for: "fr-origem" }, t("regras.lista.origem")), filtro)));
      if (st.editando) cab.append(renderForm(d));
      const ul = h("ul", { class: "fr-lista" });
      for (const r of lista.slice(0, LIMITE_LISTA)) {
        const nome = nomeCategoria(r.categoriaId) ?? (r.categoriaNome ? t("regras.semIdCurto", { nome: r.categoriaNome }) : t("regras.semCategoria"));
        const guardada = r.origem !== "base";
        ul.append(h("li", { class: "fr-regra" },
          h("div", { class: "fr-regra-topo" }, h("code", { class: "fr-padrao" }, r.padrao), h("span", { class: "fr-tipo" }, t(`regras.tipo.${r.tipo}`)), h("span", { class: ["fr-origem", `fr-origem-${r.origem}`] }, t(`regras.origem.${r.origem}`))),
          h("div", { class: "fr-regra-base" }, h("span", null, "→ ", h("b", null, nome)), h("span", { class: "fr-mudo" }, t("regras.prioridade", { n: r.prioridade ?? 0 })), h("span", { class: "fr-mudo" }, (r.acertos ?? 0) === 0 ? t("regras.acertosNenhum") : t("regras.acertos", { n: r.acertos })),
            guardada ? h("span", { class: "fr-regra-acoes" }, h("button", { type: "button", class: "fr-btn fr-mini", onclick: () => { st.editando = { ...r, categoriaId: r.categoriaId ?? "" }; render(); raiz.querySelector("#fr-padrao")?.focus(); } }, t("regras.editar")), h("button", { type: "button", class: "fr-btn fr-mini", onclick: () => apagar(r) }, t("regras.apagar"))) : h("span", { class: "fr-mudo" }, t("regras.baseSoLeitura")))));
      }
      if (!lista.length) ul.append(h("li", { class: "fr-mudo" }, t("regras.lista.vazia")));
      if (lista.length > LIMITE_LISTA) cab.append(h("p", { class: "fr-mudo" }, t("regras.lista.cortada", { n: lista.length, max: LIMITE_LISTA })));
      cab.append(ul);
      return cab;
    }
    function renderForm(d) {
      const e = st.editando;
      const padrao = h("input", { id: "fr-padrao", class: "fr-campo", type: "text", maxlength: 200, value: e.padrao, required: true, autocomplete: "off", oninput: () => { e.padrao = padrao.value; validar(); } });
      const tipo = h("select", { id: "fr-tipo", class: "fr-campo", onchange: () => { e.tipo = tipo.value; validar(); } }, h("option", { value: "contem", selected: e.tipo === "contem" }, t("regras.tipo.contem")), h("option", { value: "regex", selected: e.tipo === "regex" }, t("regras.tipo.regex")));
      const cat = h("select", { id: "fr-cat", class: "fr-campo", required: true, onchange: () => { e.categoriaId = cat.value; } }, h("option", { value: "", selected: !e.categoriaId }, t("regras.form.escolhaCategoria")), ...d.categorias.map((c) => h("option", { value: c.id, selected: e.categoriaId === c.id }, `${c.nome} (${t(`regras.catTipo.${c.tipo}`)})`)));
      const prio = h("input", { id: "fr-prio", class: "fr-campo", type: "number", min: -1000, max: 1000, value: e.prioridade ?? 0, inputmode: "numeric", onchange: () => { e.prioridade = Number(prio.value) || 0; } });
      const erro = h("p", { class: "fr-erro-campo", role: "alert" });
      const validar = () => { erro.textContent = ""; if (e.tipo === "regex") { const v = validarRegex(e.padrao); if (!v.ok) erro.textContent = t(`regras.regex.${v.motivo}`, { max: LIMITE_REGEX }); } return !erro.textContent; };
      return h("form", { class: "fr-form", onsubmit: async (ev) => {
        ev.preventDefault();
        if (!validar()) return;
        if (!e.categoriaId) { erro.textContent = t("regras.form.precisaCategoria"); return; }
        if (!e.padrao.trim()) { erro.textContent = t("regras.form.precisaPadrao"); return; }
        const mud = { padrao: e.padrao.trim(), tipo: e.tipo, categoriaId: e.categoriaId, categoriaNome: nomeCategoria(e.categoriaId), prioridade: e.prioridade ?? 0 };
        const salvo = e.nova ? (x) => ({ ...x, regras: criarRegra(x.regras ?? [], { ...mud, origem: "usuario" }, { novoId: ctx.novoId }) }) : (x) => ({ ...x, regras: editarRegra(x.regras ?? [], e.id, { ...mud, origem: e.origem === "aprendida" ? "usuario" : e.origem, acertos: 0 }) });
        st.editando = null;
        await gravar((x) => ({ ...salvo(x), meta: { ...x.meta, atualizadoEm: ctx.agora() } }), t(e.nova ? "regras.criada" : "regras.editada"));
      } }, h("h4", null, t(e.nova ? "regras.form.nova" : "regras.form.editar")),
        h("div", { class: "fr-grade" }, h("div", { class: "fr-campo-bloco" }, h("label", { for: "fr-padrao" }, t("regras.form.padrao")), padrao), h("div", { class: "fr-campo-bloco" }, h("label", { for: "fr-tipo" }, t("regras.form.tipo")), tipo),
          h("div", { class: "fr-campo-bloco" }, h("label", { for: "fr-cat" }, t("regras.form.categoria")), cat), h("div", { class: "fr-campo-bloco" }, h("label", { for: "fr-prio" }, t("regras.form.prioridade")), prio)),
        h("p", { class: "fr-mudo" }, t(e.tipo === "regex" ? "regras.form.dicaRegex" : "regras.form.dicaContem")), erro,
        h("div", { class: "fr-acoes" }, h("button", { type: "button", class: "fr-btn", onclick: () => { st.editando = null; render(); } }, t("regras.cancelar")), h("button", { type: "submit", class: "fr-btn fr-primario" }, t("regras.salvar"))));
    }
    async function apagar(r) {
      if (!(await dialogo({ titulo: t("regras.apagar"), texto: t("regras.apagarExplica", { padrao: r.padrao }), ok: t("regras.apagar"), perigo: true }))) return;
      await gravar((x) => ({ ...x, regras: removerRegra(x.regras ?? [], r.id), meta: { ...x.meta, atualizadoEm: ctx.agora() } }), t("regras.apagada"));
    }
    async function restaurar() {
      const n = (ctx.estado().regras ?? []).length;
      if (!(await dialogo({ titulo: t("regras.restaurar.titulo"), texto: t("regras.restaurar.confirma", { n }), ok: t("regras.restaurar.botao"), perigo: true }))) return;
      await gravar((x) => ({ ...x, regras: [], meta: { ...x.meta, atualizadoEm: ctx.agora() } }), t("regras.restaurar.feito", { n }));
    }

    // ---- lançamentos importados recentes: "por que esta regra casou" + corrigir (aprender) ----
    function renderRecentes(d) {
      const recentes = importadosRecentes(d);
      const bloco = h("div", { class: "fr-cartao" }, h("h3", null, t("regras.recentes.titulo")), h("p", { class: "fr-mudo" }, t("regras.recentes.explica")));
      if (!recentes.length) { bloco.append(h("p", { class: "fr-mudo" }, t("regras.recentes.vazio"))); return bloco; }
      const ul = h("ul", { class: "fr-lista" });
      for (const l of recentes) {
        const aberto = st.explicando === l.id;
        const li = h("li", { class: ["fr-lanc", aberto && "fr-lanc-aberto"] },
          h("button", { type: "button", class: "fr-lanc-btn", "aria-expanded": aberto ? "true" : "false", onclick: () => { st.explicando = aberto ? null : l.id; render(); } },
            h("span", { class: "fr-data" }, fmt.data(l.data)), h("span", { class: "fr-desc" }, l.descricao || t("regras.semDescricao")), h("span", { class: "fr-num" }, fmt.moeda(l.tipo === "despesa" ? -l.centavos : l.centavos, "BRL", { sinal: true })), h("span", { class: "fr-cat" }, l.categoriaId ? nomeCategoria(l.categoriaId) : t("regras.semCategoria"))));
        if (aberto) {
          const sel = h("select", { id: `fr-corrigir-${l.id}`, class: "fr-campo" }, h("option", { value: "" }, t("regras.form.escolhaCategoria")), ...d.categorias.filter((c) => c.tipo === l.tipo).map((c) => h("option", { value: c.id, selected: l.categoriaId === c.id }, c.nome)));
          li.append(h("div", { class: "fr-explica" }, ...explicacao(l.descricao, d),
            l.categoriaSugerida ? h("p", { class: "fr-mudo" }, t("regras.recentes.sugeridaNaHora", { origem: t(`regras.origem.${l.categoriaSugerida.origem}`) })) : null,
            h("div", { class: "fr-corrigir" }, h("label", { for: `fr-corrigir-${l.id}` }, t("regras.recentes.corrigir")), sel, h("button", { type: "button", class: "fr-btn fr-primario", onclick: () => corrigir(l, sel.value) }, t("regras.recentes.aplicar")))));
        }
        ul.append(li);
      }
      bloco.append(ul);
      return bloco;
    }
    async function corrigir(l, categoriaId) {
      if (!categoriaId) return;
      const nome = nomeCategoria(categoriaId);
      const regrasAntes = ctx.estado().regras ?? [];
      let aprendida = null;
      await gravar((x) => {
        const r = aprender(x.regras ?? [], { descricao: l.descricao, categoriaId, categoriaNome: nome }, { novoId: ctx.novoId });
        aprendida = r;
        return { ...x, regras: r.regras, lancamentos: ordenar("lancamentos", x.lancamentos.map((y) => (y.id === l.id ? { ...y, categoriaId, atualizadoEm: ctx.agora() } : y))), meta: { ...x.meta, atualizadoEm: ctx.agora() } };
      });
      if (aprendida?.regra) st.aprendido = { regraId: aprendida.regra.id, padrao: aprendida.padrao, categoria: nome, lancamentoId: l.id, categoriaAntes: l.categoriaId, regrasAntes };
      st.explicando = null; render();
    }
    function renderAprendido() {
      const a = st.aprendido;
      return h("div", { class: "fr-aprendi", role: "status", "aria-live": "polite" }, h("p", null, t("regras.aprendi", { padrao: a.padrao, categoria: a.categoria })),
        h("div", { class: "fr-acoes" }, h("button", { type: "button", class: "fr-btn", onclick: async () => {
          // Desfazer o aprendizado: as regras voltam ao que eram e o lançamento à categoria anterior.
          await gravar((x) => ({ ...x, regras: a.regrasAntes, lancamentos: x.lancamentos.map((y) => (y.id === a.lancamentoId ? { ...y, categoriaId: a.categoriaAntes, atualizadoEm: ctx.agora() } : y)), meta: { ...x.meta, atualizadoEm: ctx.agora() } }), t("regras.aprendiDesfeito"));
          st.aprendido = null; render();
        } }, t("regras.desfazer")), h("button", { type: "button", class: "fr-btn fr-mini", onclick: () => { st.aprendido = null; render(); } }, t("regras.ok"))));
    }

    render();
    return { elemento: raiz, atualizar() { if (!st.editando) render(); }, destruir() { limpar(raiz); } };
  },
};
