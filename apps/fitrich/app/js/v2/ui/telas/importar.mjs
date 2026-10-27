// Tela "Importar": extrato OFX/CSV do banco → preview → confirmar → desfazer. Toda a lógica de leitura,
// dedupe e categorização vem de `js/v2/importar/*` e `js/v2/categorizar/*`; aqui só a apresentação e a
// costura com o esquema. Regras do contrato (docs/ui-v2.md): texto só por `t()`, DOM só por `h()`
// (descrição de extrato é texto hostil), nada de rede, `<dialog>` em vez de diálogo nativo do navegador.
import { TIPOS_CONTA, adicionar, definir, ordenar } from "../../esquema.mjs";
import { charsetDeclaradoNosBytes, decodificar, lerCentavos } from "../../importar/comum.mjs";
import { lerOFX } from "../../importar/ofx.mjs";
import { LIMIAR_CONFIANCA, PERFIS_CSV_BASE, SEPARADORES, acharCabecalho, aplicarMapeamento, dividirTabela, lerCSV, salvarPerfil } from "../../importar/csv.mjs";
import { aplicarImportacao, desfazerImportacao, prepararImportacao } from "../../importar/preview.mjs";
import { regrasDaBase, registrarAcerto } from "../../categorizar/regras.mjs";
import { aprender } from "../../categorizar/aprender.mjs";
import BASE from "../../categorizar/categorias-br.mjs";

export const LIMITE_BYTES = 20 * 1024 * 1024;
export const LINHAS_PREVIA = 5;

// ---------- lógica de apresentação (pura, testada em Node) ----------

// Que tipo de arquivo chegou? Pelo conteúdo primeiro (o nome mente: há banco que exporta OFX como .txt),
// depois pela extensão. PDF é detectado para a mensagem dizer "baixe OFX/CSV" em vez de "arquivo inválido".
export function detectarTipoArquivo(nome, inicioTexto) {
  const s = String(inicioTexto ?? "");
  if (/^%PDF-/.test(s)) return "pdf";
  if (/OFXHEADER|<\?OFX|<OFX>/i.test(s)) return "ofx";
  const ext = String(nome ?? "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (ext === "ofx" || ext === "qfx") return "ofx";
  if (ext === "csv" || ext === "txt" || ext === "tsv") return "csv";
  if (/^\s*[\[{]/.test(s)) return "json";
  return SEPARADORES.some((sep) => s.includes(sep)) && s.includes("\n") ? "csv" : "desconhecido";
}

// Sugestão de categoria cujo tipo não bate com o lançamento (regra "Salário" numa despesa) seria recusada
// pelo esquema (`categoria_tipo_divergente`) e derrubaria a importação inteira: fica sem categoria.
export function sanearCategorias(lancamentos, categorias) {
  const porId = new Map(categorias.map((c) => [c.id, c]));
  return lancamentos.map((l) => {
    const c = l.categoriaId ? porId.get(l.categoriaId) : null;
    return !l.categoriaId || (c && c.tipo === l.tipo) ? l : { ...l, categoriaId: null };
  });
}

// O esquema modela transferência como UM lançamento (conta origem → `contaDestinoId`), e `confirmarTransferencia`
// de transferencias.mjs devolve duas pernas que o `validar` recusa. Aqui a perna de saída vira a transferência
// e a de entrada sai da lista. Só conta↔conta: pagamento de fatura (conta→cartão) exige `fatura` e fica para
// a tela de Cartões. Devolve o que mudou para `desfazer` restaurar o estado idêntico.
export function paresContaConta(sugestoes) {
  return sugestoes.filter((s) => s.saida?.contaId && s.entrada?.contaId && s.saida.contaId !== s.entrada.contaId);
}
export function fundirTransferencia(lancamentos, sugestao, { agora }) {
  const alterados = [], removidos = [];
  const saida = lancamentos.find((l) => l.id === sugestao.saidaId), entrada = lancamentos.find((l) => l.id === sugestao.entradaId);
  if (!saida || !entrada) return { lancamentos, alterados, removidos };
  const nova = { ...saida, tipo: "transferencia", categoriaId: null, categoriaSugerida: null, contaDestinoId: entrada.contaId, meio: saida.meio ?? "outro", atualizadoEm: agora() };
  return { lancamentos: lancamentos.filter((l) => l.id !== entrada.id).map((l) => (l.id === saida.id ? nova : l)), alterados: [saida], removidos: [entrada] };
}

// Desfaz a importação E o que ela alterou fora dos ids criados (pernas de transferência). Resultado idêntico ao
// estado anterior quando nada mais mudou (provado no teste de navegador).
export function desfazerCompleto(dados, importacaoId) {
  const reg = (dados.importacoes ?? []).find((i) => i.id === importacaoId);
  const d = desfazerImportacao(dados, importacaoId);
  const alterados = reg?.alterados ?? [], removidos = reg?.removidosExistentes ?? [];
  const ids = new Set(alterados.map((l) => l.id));
  return { ...d, lancamentos: ordenar("lancamentos", [...d.lancamentos.filter((l) => !ids.has(l.id)), ...alterados, ...removidos]) };
}

// Formato mês/dia: troca os dois primeiros grupos da célula de data ANTES de `lerDataExtrato` (que lê DD/MM).
export function trocarDiaMes(tabela, colunaData) {
  if (colunaData == null || colunaData < 0) return tabela;
  return tabela.map((l) => l.map((c, i) => (i === colunaData ? String(c).replace(/^(\d{1,2})([\/.-])(\d{1,2})([\/.-])/, "$3$2$1$4") : c)));
}

// Nomes da base de padrões que não batem com os das categorias padrão do esquema ("Restaurante e delivery" ×
// "Delivery e restaurante"): sem este mapa, metade das sugestões sairia sem id. Nome sem par fica null e a UI
// mostra "sugestão não aplicada: Compras" em vez de inventar categoria.
export const ALIASES_BASE = { "Restaurante e delivery": "Delivery e restaurante", Pets: "Pet", Impostos: "Impostos e taxas", "Tarifas e juros": "Impostos e taxas", "Saúde": "Saúde e fitness" };
export const categoriasParaBase = (categorias) => [...categorias, ...Object.entries(ALIASES_BASE).map(([nomeBase, nomeNucleo]) => ({ nome: nomeBase, id: categorias.find((c) => c.nome === nomeNucleo)?.id })).filter((c) => c.id)];
export const regrasAtivas = (dados) => [...(dados.regras ?? []), ...regrasDaBase(BASE, categoriasParaBase(dados.categorias))];
export const perfisDe = (dados) => [...PERFIS_CSV_BASE, ...(dados.perfil?.perfisCSV ?? [])];
export const totalAssinado = (lista) => lista.reduce((s, l) => s + (l.tipo === "despesa" ? -l.centavos : l.centavos), 0);

// ---------- tela ----------
export const tela = {
  id: "importar", titulo: "importar.titulo", icone: "import", grupo: "mais", ordem: 70,
  css: "/css/importar.css", i18n: "/js/v2/ui/telas/importar.i18n.mjs",
  montar(ctx) {
    const { h, t, fmt, limpar } = ctx;
    const raiz = h("section", { class: "fi", "aria-labelledby": "fi-titulo" });
    // Estado da tela (não é dado da pessoa): passo, arquivo lido, mapeamento em edição, preview preparado.
    const st = { passo: "escolher", erro: null, aviso: null, arquivo: null, csv: null, mapa: null, ofx: null, contaOfx: 0, prep: null, categoriasEscolhidas: {}, duplicatasMarcadas: new Set(), transfMarcadas: new Set(), feito: null, dono: "", criando: null };

    const dialogo = ({ titulo, texto, ok, perigo = false }) => new Promise((resolve) => {
      const fecha = (v) => { dlg.close(); dlg.remove(); resolve(v); };
      const dlg = h("dialog", { class: "fi-dialogo", "aria-labelledby": "fi-dlg-t", onclose: () => { dlg.remove(); resolve(false); } },
        h("h3", { id: "fi-dlg-t" }, titulo), h("p", null, texto),
        h("div", { class: "fi-acoes" }, h("button", { type: "button", class: "fi-btn", onclick: () => fecha(false) }, t("importar.cancelar")), h("button", { type: "button", class: ["fi-btn", perigo ? "fi-perigo" : "fi-primario"], onclick: () => fecha(true) }, ok)));
      raiz.append(dlg); dlg.showModal();
    });

    const nomeCategoria = (id) => ctx.estado().categorias.find((c) => c.id === id)?.nome ?? null;
    const donoAtual = () => { const [tipo, id] = st.dono.split(":"); return tipo === "cartao" ? { cartaoId: id } : tipo === "conta" ? { contaId: id } : null; };
    const nomeDono = (l) => { const d = ctx.estado(); return l.contaId ? d.contas.find((c) => c.id === l.contaId)?.nome : d.cartoes.find((c) => c.id === l.cartaoId)?.nome; };

    function render() {
      limpar(raiz);
      raiz.append(h("h2", { id: "fi-titulo" }, t("importar.titulo")), h("p", { class: "fi-sub" }, t("importar.subtitulo")));
      if (st.erro) raiz.append(h("div", { class: "fi-erro", role: "alert" }, h("strong", null, t(`importar.erro.${st.erro.codigo}`)), " ", t(`importar.erro.${st.erro.codigo}.proximo`)));
      if (st.aviso) raiz.append(h("p", { class: "fi-aviso", role: "status", "aria-live": "polite" }, st.aviso));
      if (st.passo === "escolher") renderEscolher();
      else if (st.passo === "ofx-conta") renderContaOFX();
      else if (st.passo === "mapear") renderMapear();
      else if (st.passo === "preview") renderPreview();
      else if (st.passo === "feito") renderFeito();
      renderHistorico();
    }

    // ---- passo 1: destino + arquivo ----
    function renderEscolher() {
      const d = ctx.estado();
      const opcoes = [h("option", { value: "" }, t("importar.destino.escolha")),
        ...d.contas.filter((c) => !c.arquivada).map((c) => h("option", { value: `conta:${c.id}`, selected: st.dono === `conta:${c.id}` }, t("importar.destino.conta", { nome: c.nome }))),
        ...d.cartoes.map((c) => h("option", { value: `cartao:${c.id}`, selected: st.dono === `cartao:${c.id}` }, t("importar.destino.cartao", { nome: c.nome }))),
        h("option", { value: "nova-conta" }, t("importar.destino.novaConta")), h("option", { value: "novo-cartao" }, t("importar.destino.novoCartao"))];
      const sel = h("select", { id: "fi-destino", class: "fi-campo", onchange: () => { if (sel.value === "nova-conta" || sel.value === "novo-cartao") { st.criando = sel.value; st.dono = ""; } else st.dono = sel.value; render(); } }, ...opcoes);
      const bloco = h("div", { class: "fi-cartao" }, h("label", { for: "fi-destino" }, t("importar.destino.rotulo")), sel);
      if (st.criando) bloco.append(renderCriar());
      raiz.append(bloco);

      const input = h("input", { type: "file", id: "fi-arquivo", accept: ".ofx,.qfx,.csv,.txt,.tsv,application/x-ofx,text/csv,text/plain", class: "fi-input-arquivo", disabled: !donoAtual(), onchange: () => input.files?.[0] && receberArquivo(input.files[0]) });
      const zona = h("label", { for: "fi-arquivo", class: ["fi-solta", !donoAtual() && "fi-solta-off"],
        ondragover: (e) => { e.preventDefault(); zona.classList.add("fi-solta-ativa"); }, ondragleave: () => zona.classList.remove("fi-solta-ativa"),
        ondrop: (e) => { e.preventDefault(); zona.classList.remove("fi-solta-ativa"); const f = e.dataTransfer?.files?.[0]; if (f && donoAtual()) receberArquivo(f); } },
        h("span", { class: "fi-solta-titulo" }, t("importar.solta.titulo")), h("span", { class: "fi-solta-sub" }, donoAtual() ? t("importar.solta.sub") : t("importar.solta.escolhaDestino")), input);
      raiz.append(zona);
      raiz.append(h("details", { class: "fi-ajuda" }, h("summary", null, t("importar.ajuda.titulo")),
        h("p", null, t("importar.ajuda.geral")), h("ul", null, h("li", null, t("importar.ajuda.ofx")), h("li", null, t("importar.ajuda.csv")), h("li", null, t("importar.ajuda.confirmados")), h("li", null, t("importar.ajuda.semPdf"))),
        h("p", { class: "fi-mudo" }, t("importar.ajuda.privacidade"))));
    }

    function renderCriar() {
      const d = ctx.estado(), ehCartao = st.criando === "novo-cartao";
      const nome = h("input", { id: "fi-novo-nome", class: "fi-campo", type: "text", maxlength: 60, required: true, autocomplete: "off" });
      const campos = [h("label", { for: "fi-novo-nome" }, t("importar.criar.nome")), nome];
      let tipo, saldo, fecha, vence, pagto;
      if (!ehCartao) {
        tipo = h("select", { id: "fi-novo-tipo", class: "fi-campo" }, ...TIPOS_CONTA.map((x) => h("option", { value: x }, t(`importar.tipoConta.${x}`))));
        saldo = h("input", { id: "fi-novo-saldo", class: "fi-campo", type: "text", inputmode: "decimal", placeholder: "0,00" });
        campos.push(h("label", { for: "fi-novo-tipo" }, t("importar.criar.tipo")), tipo, h("label", { for: "fi-novo-saldo" }, t("importar.criar.saldo")), saldo);
      } else {
        fecha = h("input", { id: "fi-novo-fecha", class: "fi-campo", type: "number", min: 1, max: 31, value: 1, inputmode: "numeric" });
        vence = h("input", { id: "fi-novo-vence", class: "fi-campo", type: "number", min: 1, max: 31, value: 10, inputmode: "numeric" });
        pagto = h("select", { id: "fi-novo-pagto", class: "fi-campo" }, ...d.contas.map((c) => h("option", { value: c.id }, c.nome)));
        campos.push(h("label", { for: "fi-novo-fecha" }, t("importar.criar.fecha")), fecha, h("label", { for: "fi-novo-vence" }, t("importar.criar.vence")), vence, h("label", { for: "fi-novo-pagto" }, t("importar.criar.contaPagamento")), pagto);
        if (!d.contas.length) campos.push(h("p", { class: "fi-aviso" }, t("importar.criar.precisaConta")));
      }
      const erro = h("p", { class: "fi-erro-campo", role: "alert" });
      const form = h("form", { class: "fi-criar", onsubmit: async (e) => {
        e.preventDefault();
        const id = ctx.novoId();
        try {
          if (ehCartao) {
            if (!d.contas.length) throw new Error("precisaConta");
            await ctx.mudar((x) => adicionar(x, "cartoes", { id, nome: nome.value.trim(), diaFechamento: Number(fecha.value), diaVencimento: Number(vence.value), fechaInclusivo: true, limiteCentavos: null, contaPagamentoId: pagto.value }, { novoId: ctx.novoId, agora: ctx.agora }));
            st.dono = `cartao:${id}`;
          } else {
            const c = lerCentavos(saldo.value || "0");
            if (c === null) throw new Error("saldo");
            await ctx.mudar((x) => adicionar(x, "contas", { id, nome: nome.value.trim(), tipo: tipo.value, moeda: "BRL", saldoInicialCentavos: c, dataSaldoInicial: ctx.hoje(), arquivada: false }, { novoId: ctx.novoId, agora: ctx.agora }));
            st.dono = `conta:${id}`;
          }
          st.criando = null; render();
        } catch (err) { erro.textContent = t("importar.criar.falhou", { motivo: err?.erros?.[0]?.codigo ?? err?.message ?? "" }); }
      } }, ...campos, erro, h("div", { class: "fi-acoes" }, h("button", { type: "button", class: "fi-btn", onclick: () => { st.criando = null; render(); } }, t("importar.cancelar")), h("button", { type: "submit", class: "fi-btn fi-primario" }, t("importar.criar.salvar"))));
      return form;
    }

    // ---- leitura do arquivo ----
    async function receberArquivo(file) {
      st.erro = null; st.aviso = null; st.feito = null; st.csv = null; st.ofx = null; st.mapa = null; st.prep = null;
      try {
        if (!file || file.size === 0) return falhar("vazio");
        if (file.size > LIMITE_BYTES) return falhar("grande");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { texto, encoding } = decodificar(bytes, { charsetDeclarado: charsetDeclaradoNosBytes(bytes) });
        const tipo = detectarTipoArquivo(file.name, texto.slice(0, 4000));
        st.arquivo = { nome: file.name, bytes, texto, encoding, tipo };
        if (tipo === "pdf") return falhar("pdf");
        if (tipo === "json") return falhar("json");
        if (tipo === "desconhecido") return falhar("formato");
        if (tipo === "ofx") {
          let lido;
          try { lido = lerOFX(bytes); } catch { return falhar("ofx_invalido"); }
          if (!lido.contas.length || !lido.contas.some((c) => c.movimentos.length)) return falhar("sem_movimentos");
          st.ofx = lido;
          if (lido.contas.filter((c) => c.movimentos.length).length > 1) { st.passo = "ofx-conta"; return render(); }
          st.contaOfx = lido.contas.findIndex((c) => c.movimentos.length);
          return preparar(lido.contas[st.contaOfx].movimentos);
        }
        const csv = lerCSV(bytes, { perfis: perfisDe(ctx.estado()) });
        st.csv = csv;
        if (csv.linhaCabecalho < 0 && !csv.tabela.some((l) => l.filter(Boolean).length >= 2)) return falhar("sem_movimentos");
        st.mapa = { ...csv.mapeamentoDetectado, colunas: { ...csv.mapeamentoDetectado.colunas }, separador: csv.separador, linhaCabecalho: Math.max(csv.linhaCabecalho, 0), formatoData: "dma", salvarPerfil: false, nomePerfil: "" };
        if (csv.confianca >= LIMIAR_CONFIANCA && csv.linhas.length) return preparar(csv.linhas);
        st.passo = "mapear"; render();
      } catch { falhar("leitura"); }
    }
    function falhar(codigo) { st.erro = { codigo }; st.passo = "escolher"; render(); }

    function renderContaOFX() {
      const sel = h("select", { id: "fi-conta-ofx", class: "fi-campo" }, ...st.ofx.contas.map((c, i) => h("option", { value: i, disabled: !c.movimentos.length }, t("importar.ofx.conta", { tipo: t(`importar.ofx.tipo.${c.tipo}`), id: c.acctid ?? "?", n: c.movimentos.length }))));
      raiz.append(h("div", { class: "fi-cartao" }, h("h3", null, t("importar.ofx.varias")), h("label", { for: "fi-conta-ofx" }, t("importar.ofx.escolha")), sel,
        h("div", { class: "fi-acoes" }, h("button", { type: "button", class: "fi-btn", onclick: voltar }, t("importar.cancelar")), h("button", { type: "button", class: "fi-btn fi-primario", onclick: () => { st.contaOfx = Number(sel.value); preparar(st.ofx.contas[st.contaOfx].movimentos); } }, t("importar.continuar")))));
    }
    function voltar() { st.passo = "escolher"; st.prep = null; st.erro = null; render(); }

    // ---- passo 2 (CSV): mapeamento manual ----
    function tabelaAtual() {
      const tab = dividirTabela(st.arquivo.texto, st.mapa.separador);
      return st.mapa.formatoData === "mda" ? trocarDiaMes(tab, st.mapa.colunas.data) : tab;
    }
    function aplicarMapa() {
      const { formatoData, salvarPerfil: s, nomePerfil, ...m } = st.mapa;
      return aplicarMapeamento(tabelaAtual(), { ...m, colunas: Object.fromEntries(Object.entries(m.colunas).filter(([, v]) => v !== undefined && v !== "")) });
    }
    function renderMapear() {
      const cab = (dividirTabela(st.arquivo.texto, st.mapa.separador)[st.mapa.linhaCabecalho] ?? []);
      const previa = h("div", { class: "fi-previa" });
      const atualizarPrevia = () => {
        limpar(previa);
        const r = aplicarMapa();
        const linhas = r.linhas.slice(0, LINHAS_PREVIA);
        previa.append(h("p", { class: "fi-mudo", role: "status", "aria-live": "polite" }, t("importar.mapa.lidas", { n: r.linhas.length, erros: r.erros.length })));
        if (linhas.length) previa.append(h("table", { class: "fi-tabela" }, h("thead", null, h("tr", null, h("th", null, t("importar.col.data")), h("th", null, t("importar.col.descricao")), h("th", { class: "fi-num" }, t("importar.col.valor")))),
          h("tbody", null, ...linhas.map((l) => h("tr", null, h("td", null, fmt.data(l.data)), h("td", null, l.descricao), h("td", { class: ["fi-num", l.valorCentavos < 0 ? "fi-saida" : "fi-entrada"] }, fmt.moeda(l.valorCentavos, "BRL", { sinal: true })))))));
        if (r.erros.length) previa.append(h("p", { class: "fi-mudo" }, t("importar.mapa.exemploErro", { linha: r.erros[0].linha, celulas: r.erros[0].celulas.slice(0, 4).join(" | ") })));
      };
      const campo = (id, rotulo, el) => h("div", { class: "fi-campo-bloco" }, h("label", { for: id }, rotulo), el);
      const selCol = (papel) => h("select", { id: `fi-col-${papel}`, class: "fi-campo", onchange: (e) => { st.mapa.colunas[papel] = e.target.value === "" ? undefined : Number(e.target.value); atualizarPrevia(); } },
        h("option", { value: "", selected: st.mapa.colunas[papel] === undefined }, t("importar.mapa.nenhuma")), ...cab.map((c, i) => h("option", { value: i, selected: st.mapa.colunas[papel] === i }, c || t("importar.mapa.colunaN", { n: i + 1 }))));
      const modoValor = st.mapa.colunas.valor !== undefined || (st.mapa.colunas.debito === undefined && st.mapa.colunas.credito === undefined) ? "unico" : "duplo";
      const blocoValor = h("div", { class: "fi-grade" });
      const renderValor = (modo) => { limpar(blocoValor); if (modo === "unico") blocoValor.append(campo("fi-col-valor", t("importar.col.valor"), selCol("valor"))); else blocoValor.append(campo("fi-col-debito", t("importar.col.debito"), selCol("debito")), campo("fi-col-credito", t("importar.col.credito"), selCol("credito"))); };
      renderValor(modoValor);
      const radio = (valor, rotulo) => h("label", { class: "fi-radio" }, h("input", { type: "radio", name: "fi-modo-valor", value: valor, checked: modoValor === valor, onchange: () => { if (valor === "unico") { delete st.mapa.colunas.debito; delete st.mapa.colunas.credito; } else delete st.mapa.colunas.valor; renderValor(valor); atualizarPrevia(); } }), rotulo);
      const nomePerfil = h("input", { id: "fi-perfil-nome", class: "fi-campo", type: "text", maxlength: 40, placeholder: t("importar.mapa.perfilExemplo"), oninput: (e) => { st.mapa.nomePerfil = e.target.value; } });
      raiz.append(h("div", { class: "fi-cartao" }, h("h3", null, t("importar.mapa.titulo")),
        h("p", null, st.csv.perfil ? t("importar.mapa.perfilReconhecido") : t("importar.mapa.explica", { confianca: Math.round((st.csv.confianca ?? 0) * 100) })),
        h("div", { class: "fi-grade" },
          campo("fi-sep", t("importar.mapa.separador"), h("select", { id: "fi-sep", class: "fi-campo", onchange: (e) => { st.mapa.separador = e.target.value === "\\t" ? "\t" : e.target.value; st.mapa.linhaCabecalho = Math.max(detectarCabecalho(), 0); render(); } }, ...SEPARADORES.map((s) => h("option", { value: s === "\t" ? "\\t" : s, selected: st.mapa.separador === s }, t(`importar.mapa.sep.${s === ";" ? "pv" : s === "," ? "v" : s === "\t" ? "tab" : "barra"}`))))),
          campo("fi-cab", t("importar.mapa.linhaCabecalho"), h("input", { id: "fi-cab", class: "fi-campo", type: "number", min: 1, max: 60, value: st.mapa.linhaCabecalho + 1, inputmode: "numeric", onchange: (e) => { st.mapa.linhaCabecalho = Math.max(0, Number(e.target.value) - 1); render(); } })),
          campo("fi-col-data", t("importar.col.data"), selCol("data")),
          campo("fi-fmt-data", t("importar.mapa.formatoData"), h("select", { id: "fi-fmt-data", class: "fi-campo", onchange: (e) => { st.mapa.formatoData = e.target.value; atualizarPrevia(); } }, h("option", { value: "dma", selected: st.mapa.formatoData === "dma" }, t("importar.mapa.dma")), h("option", { value: "mda", selected: st.mapa.formatoData === "mda" }, t("importar.mapa.mda")))),
          campo("fi-col-descricao", t("importar.col.descricao"), selCol("descricao")),
          campo("fi-col-identificador", t("importar.col.identificador"), selCol("identificador"))),
        h("fieldset", { class: "fi-fieldset" }, h("legend", null, t("importar.mapa.comoValor")), radio("unico", t("importar.mapa.valorUnico")), radio("duplo", t("importar.mapa.valorDuplo"))),
        blocoValor,
        h("label", { class: "fi-check" }, h("input", { type: "checkbox", checked: st.mapa.sinal === "cartao", onchange: (e) => { st.mapa.sinal = e.target.checked ? "cartao" : "banco"; atualizarPrevia(); } }), t("importar.mapa.sinalCartao")),
        h("h4", null, t("importar.mapa.previa", { n: LINHAS_PREVIA })), previa,
        h("label", { class: "fi-check" }, h("input", { type: "checkbox", checked: st.mapa.salvarPerfil, onchange: (e) => { st.mapa.salvarPerfil = e.target.checked; nomePerfil.disabled = !e.target.checked; } }), t("importar.mapa.salvarPerfil")),
        campo("fi-perfil-nome", t("importar.mapa.nomePerfil"), nomePerfil),
        h("div", { class: "fi-acoes" }, h("button", { type: "button", class: "fi-btn", onclick: voltar }, t("importar.cancelar")), h("button", { type: "button", class: "fi-btn fi-primario", onclick: () => {
          const r = aplicarMapa();
          if (!r.linhas.length) { st.aviso = t("importar.mapa.nadaLido"); return render(); }
          preparar(r.linhas);
        } }, t("importar.continuar")))));
      nomePerfil.disabled = !st.mapa.salvarPerfil;
      atualizarPrevia();
    }
    function detectarCabecalho() { return acharCabecalho(dividirTabela(st.arquivo.texto, st.mapa.separador)); }

    // ---- preparar preview ----
    async function preparar(movimentos) {
      const dados = ctx.estado(), dono = donoAtual();
      if (!dono) return falhar("sem_destino");
      try {
        const prep = await prepararImportacao({ arquivo: { nome: st.arquivo.nome, bytes: st.arquivo.bytes }, movimentos, dados, dono, regras: regrasAtivas(dados), novoId: ctx.novoId, agora: ctx.agora });
        prep.preview.novos = sanearCategorias(prep.preview.novos, dados.categorias);
        prep.preview.possiveisDuplicatas = sanearCategorias(prep.preview.possiveisDuplicatas, dados.categorias);
        prep.preview.transferenciasSugeridas = paresContaConta(prep.preview.transferenciasSugeridas);
        st.prep = prep; st.categoriasEscolhidas = {}; st.duplicatasMarcadas = new Set(); st.transfMarcadas = new Set();
        st.passo = "preview"; render();
      } catch { falhar("leitura"); }
    }

    // ---- passo 3: preview ----
    function linhaLanc(l, extra) {
      const cats = ctx.estado().categorias.filter((c) => c.tipo === l.tipo);
      const escolhido = l.id in st.categoriasEscolhidas ? st.categoriasEscolhidas[l.id] : l.categoriaId;
      const sel = h("select", { class: "fi-campo fi-cat", "aria-label": t("importar.preview.categoriaDe", { descricao: l.descricao.slice(0, 40) }), onchange: (e) => { st.categoriasEscolhidas[l.id] = e.target.value || null; } },
        h("option", { value: "", selected: !escolhido }, t("importar.preview.semCategoria")), ...cats.map((c) => h("option", { value: c.id, selected: escolhido === c.id }, c.nome)));
      const sug = l.categoriaSugerida;
      const origem = sug && l.categoriaId ? h("span", { class: ["fi-origem", `fi-origem-${sug.origem}`] }, t(`importar.origem.${sug.origem}`)) : sug?.categoriaNome && !l.categoriaId ? h("span", { class: "fi-origem fi-origem-nao" }, t("importar.preview.sugestaoNaoAplicada", { nome: sug.categoriaNome })) : h("span", { class: "fi-origem fi-origem-nao" }, t("importar.preview.semRegra"));
      return h("li", { class: "fi-lanc" }, h("div", { class: "fi-lanc-topo" }, h("span", { class: "fi-data" }, fmt.data(l.data)), h("span", { class: "fi-desc" }, l.descricao || t("importar.preview.semDescricao")), h("span", { class: ["fi-num", l.tipo === "despesa" ? "fi-saida" : "fi-entrada"] }, fmt.moeda(l.tipo === "despesa" ? -l.centavos : l.centavos, "BRL", { sinal: true }))),
        h("div", { class: "fi-lanc-base" }, sel, origem, extra));
    }
    function renderPreview() {
      const p = st.prep.preview, d = ctx.estado();
      const semCat = p.novos.filter((l) => !l.categoriaId).length;
      raiz.append(h("div", { class: "fi-cartao" }, h("h3", null, t("importar.preview.titulo", { arquivo: st.arquivo.nome })),
        h("ul", { class: "fi-totais" }, h("li", null, h("b", null, String(p.totais.n)), " ", t("importar.preview.novos", { n: p.totais.n })), h("li", null, h("b", null, String(p.totais.jaExistem)), " ", t("importar.preview.jaExistem", { n: p.totais.jaExistem })),
          h("li", null, h("b", null, String(p.totais.possiveisDuplicatas)), " ", t("importar.preview.duplicatas", { n: p.totais.possiveisDuplicatas })), h("li", null, h("b", null, fmt.moeda(p.totais.somaCentavos, "BRL", { sinal: true })), " ", t("importar.preview.saldoArquivo"))),
        st.arquivo.encoding !== "utf-8" && st.arquivo.encoding !== "texto" ? h("p", { class: "fi-mudo" }, t("importar.preview.encoding", { encoding: st.arquivo.encoding })) : null));
      if (p.novos.length) raiz.append(h("div", { class: "fi-cartao" }, h("h3", null, t("importar.preview.listaNovos")), semCat ? h("p", { class: "fi-aviso" }, t("importar.preview.semCategoriaN", { n: semCat })) : null, h("p", { class: "fi-mudo" }, t("importar.preview.origemExplica")), h("ul", { class: "fi-lista" }, ...p.novos.map((l) => linhaLanc(l)))));
      if (p.possiveisDuplicatas.length) raiz.append(h("div", { class: "fi-cartao" }, h("h3", null, t("importar.preview.tituloDuplicatas")), h("p", null, t("importar.preview.duplicatasExplica")),
        h("ul", { class: "fi-lista" }, ...p.possiveisDuplicatas.map((l) => { const ex = d.lancamentos.find((x) => x.id === l.existenteId); return linhaLanc(l, h("label", { class: "fi-check" }, h("input", { type: "checkbox", checked: st.duplicatasMarcadas.has(l.id), onchange: (e) => { e.target.checked ? st.duplicatasMarcadas.add(l.id) : st.duplicatasMarcadas.delete(l.id); } }), t("importar.preview.incluirMesmoAssim", { existente: ex?.descricao ?? "?" }))); }))));
      if (p.transferenciasSugeridas.length) raiz.append(h("div", { class: "fi-cartao" }, h("h3", null, t("importar.preview.tituloTransf")), h("p", null, t("importar.preview.transfExplica")),
        h("ul", { class: "fi-lista" }, ...p.transferenciasSugeridas.map((s) => h("li", { class: "fi-lanc" }, h("label", { class: "fi-check" }, h("input", { type: "checkbox", checked: st.transfMarcadas.has(s.saidaId), onchange: (e) => { e.target.checked ? st.transfMarcadas.add(s.saidaId) : st.transfMarcadas.delete(s.saidaId); } }),
          t("importar.preview.transfItem", { valor: fmt.moeda(s.centavos), de: nomeDono(s.saida) ?? "?", para: nomeDono(s.entrada) ?? "?", dias: s.diasDiferenca })), h("p", { class: "fi-mudo fi-desc" }, `${s.saida.descricao} · ${s.entrada.descricao}`))))));
      if (p.jaExistem.length) raiz.append(h("details", { class: "fi-cartao fi-ja" }, h("summary", null, t("importar.preview.verJaExistem", { n: p.jaExistem.length })), h("ul", { class: "fi-lista" }, ...p.jaExistem.map((m) => h("li", { class: "fi-lanc fi-lanc-mudo" }, h("span", { class: "fi-data" }, fmt.data(m.data)), " ", h("span", { class: "fi-desc" }, m.descricao), " ", h("span", { class: "fi-num" }, fmt.moeda(m.valorCentavos, "BRL", { sinal: true })), " ", h("span", { class: "fi-origem" }, t(`importar.motivo.${m.motivo}`)))))));
      const podeConfirmar = p.novos.length > 0 || st.duplicatasMarcadas.size > 0;
      raiz.append(h("div", { class: "fi-acoes fi-acoes-fim" }, h("button", { type: "button", class: "fi-btn", onclick: voltar }, t("importar.cancelar")), st.csv && st.passo === "preview" ? h("button", { type: "button", class: "fi-btn", onclick: () => { st.passo = "mapear"; render(); } }, t("importar.preview.ajustarMapa")) : null,
        h("button", { type: "button", class: "fi-btn fi-primario", disabled: !podeConfirmar, onclick: confirmar }, podeConfirmar ? t("importar.preview.confirmar", { n: p.novos.length + st.duplicatasMarcadas.size }) : t("importar.preview.nadaNovo"))));
    }

    async function confirmar() {
      const { preview, importacao } = st.prep;
      const escolhas = st.categoriasEscolhidas, incluir = [...st.duplicatasMarcadas], transf = preview.transferenciasSugeridas.filter((s) => st.transfMarcadas.has(s.saidaId));
      const aplicarEscolha = (l) => (l.id in escolhas ? { ...l, categoriaId: escolhas[l.id] } : l);
      const prev = { ...preview, novos: preview.novos.map(aplicarEscolha), possiveisDuplicatas: preview.possiveisDuplicatas.map(aplicarEscolha) };
      try {
        await ctx.mudar((d) => {
          let novo = aplicarImportacao(d, { preview: prev, importacao }, { incluirDuplicatas: incluir });
          const criados = new Set(novo.importacoes.find((i) => i.id === importacao.id).idsCriados);
          let alterados = [], removidos = [], lancs = novo.lancamentos;
          for (const s of transf) {
            const r = fundirTransferencia(lancs, s, { agora: ctx.agora });
            lancs = r.lancamentos;
            // Só o que já existia antes precisa ser guardado: o que foi criado agora o desfazer já remove.
            alterados.push(...r.alterados.filter((l) => !criados.has(l.id))); removidos.push(...r.removidos.filter((l) => !criados.has(l.id)));
          }
          const idsCriados = [...criados].filter((id) => lancs.some((l) => l.id === id));
          // Aprender com a correção e contar acerto de quem sugeriu certo (só regras guardadas: a base não é persistida).
          let regras = d.regras ?? [];
          for (const l of [...prev.novos, ...prev.possiveisDuplicatas.filter((x) => incluir.includes(x.id))]) {
            if (!(l.id in escolhas)) { if (l.categoriaSugerida?.regraId && l.categoriaId && regras.some((r) => r.id === l.categoriaSugerida.regraId)) regras = registrarAcerto(regras, l.categoriaSugerida.regraId); continue; }
            if (!l.categoriaId || l.categoriaId === l.categoriaSugerida?.categoriaId) continue;
            regras = aprender(regras, { descricao: l.descricao, categoriaId: l.categoriaId, categoriaNome: nomeCategoria(l.categoriaId) }, { novoId: ctx.novoId }).regras;
          }
          return { ...novo, regras, lancamentos: ordenar("lancamentos", lancs), importacoes: novo.importacoes.map((i) => (i.id === importacao.id ? { ...i, idsCriados, alterados, removidosExistentes: removidos } : i)), meta: { ...novo.meta, atualizadoEm: ctx.agora() } };
        });
        st.feito = { importacaoId: importacao.id, n: prev.novos.length + incluir.length, transf: transf.length, arquivo: st.arquivo.nome };
        if (st.csv && st.mapa?.salvarPerfil) await salvarPerfilCSV();
        st.passo = "feito"; st.prep = null; render();
      } catch (e) { st.aviso = t("importar.falhouGravar", { motivo: e?.erros?.map((x) => x.codigo).join(", ") ?? e?.message ?? "" }); render(); }
    }
    async function salvarPerfilCSV() {
      const cab = dividirTabela(st.arquivo.texto, st.mapa.separador)[st.mapa.linhaCabecalho] ?? [];
      const { formatoData, salvarPerfil: s, nomePerfil, ...m } = st.mapa;
      const nome = (nomePerfil || "").trim() || st.arquivo.nome;
      try { await ctx.mudar((d) => definir(d, "perfil", { perfisCSV: salvarPerfil(d.perfil.perfisCSV ?? [], { id: `usuario:${ctx.novoId()}`, nome, cabecalho: cab, mapeamento: { colunas: Object.fromEntries(Object.entries(m.colunas).filter(([, v]) => v !== undefined)), sinal: m.sinal } }) }, { agora: ctx.agora })); } catch { /* o perfil é conveniência; a importação já entrou */ }
    }

    function renderFeito() {
      const f = st.feito;
      raiz.append(h("div", { class: "fi-cartao fi-ok", role: "status", "aria-live": "polite" }, h("h3", null, t("importar.feito.titulo")), h("p", null, t("importar.feito.resumo", { n: f.n, arquivo: f.arquivo })), f.transf ? h("p", null, t("importar.feito.transf", { n: f.transf })) : null,
        h("div", { class: "fi-acoes" }, h("button", { type: "button", class: "fi-btn", onclick: () => desfazer(f.importacaoId) }, t("importar.desfazer")), h("button", { type: "button", class: "fi-btn fi-primario", onclick: voltar }, t("importar.feito.outro")))));
    }
    async function desfazer(id) {
      const d = ctx.estado(), reg = d.importacoes.find((i) => i.id === id);
      if (!reg) return;
      if (!(await dialogo({ titulo: t("importar.desfazer"), texto: t("importar.desfazerExplica", { n: reg.idsCriados.length, arquivo: reg.arquivo ?? "?" }), ok: t("importar.desfazer"), perigo: true }))) return;
      try { await ctx.mudar((x) => desfazerCompleto(x, id)); st.aviso = t("importar.desfeita"); st.feito = null; st.passo = "escolher"; render(); } catch (e) { st.aviso = t("importar.falhouGravar", { motivo: e?.erros?.map((x) => x.codigo).join(", ") ?? e?.message ?? "" }); render(); }
    }
    function renderHistorico() {
      const imps = [...(ctx.estado().importacoes ?? [])].sort((a, b) => (a.em < b.em ? 1 : -1)).slice(0, 10);
      if (!imps.length) return;
      raiz.append(h("div", { class: "fi-cartao" }, h("h3", null, t("importar.historico.titulo")), h("ul", { class: "fi-lista" }, ...imps.map((i) => h("li", { class: "fi-hist" }, h("span", null, t("importar.historico.item", { data: fmt.data(i.em.slice(0, 10)), arquivo: i.arquivo ?? "?", n: i.idsCriados.length })), h("button", { type: "button", class: "fi-btn fi-mini", onclick: () => desfazer(i.id) }, t("importar.desfazer")))))));
    }

    render();
    return { elemento: raiz, atualizar() { if (st.passo === "escolher" || st.passo === "feito") render(); }, destruir() { limpar(raiz); } };
  },
};
