// Tela "Dados": seus dados ficam aqui. Exportar e apagar são os botões mais fáceis do app (princípio 5 do
// contrato): JSON completo, CSV de lançamentos, backup cifrado (cripto.mjs no Web Worker), importar JSON de
// qualquer versão, mesclar o arquivo de outro aparelho, lembrete de backup, idioma e a política de privacidade.
// Nada de rede; nada toca o armazenamento direto (tudo passa por `ctx.mudar`); `<dialog>` em vez de `confirm()`.
import { COLECOES, definir, exportarJSON, ordenar, validar, vazio } from "../../esquema.mjs";
import { importarJSON } from "../../migracao.mjs";
import { FORMATO, ITERACOES_MINIMAS, cifrar, decifrar, lerCabecalho } from "../../cripto.mjs";
import { baixarTexto, mesclar, salvarArquivo, temFileSystemAccess } from "../../arquivo.mjs";
import { LIMITE_DIAS, LIMITE_DIAS_WEBKIT, LIMITE_REGISTROS, precisaDeBackup } from "../../lembrete-backup.mjs";

export const SENHA_MINIMA = 8;
export const CAMINHO_WORKER = "/js/v2/cripto.worker.mjs";

// ---------- lógica de apresentação (pura, testada em Node) ----------

// CSV para planilha brasileira, como o v1: `;`, decimal com vírgula, texto entre aspas e célula que começa com
// = + - @ ganha apóstrofo (planilha executa fórmula vinda de descrição de extrato: "=HYPERLINK(...)" é ataque real).
export function exportarCSV(dados) {
  const q = (s) => `"${String(s ?? "").replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`;
  const v = (c) => `${Math.floor(c / 100)},${String(c % 100).padStart(2, "0")}`;
  const nome = (col, id) => (dados[col] ?? []).find((x) => x.id === id)?.nome ?? "";
  const cab = "data;tipo;categoria;valor;descricao;conta_ou_cartao;destino;meio;status";
  return [cab, ...dados.lancamentos.map((l) => [l.data, l.tipo, q(nome("categorias", l.categoriaId)), v(l.centavos), q(l.descricao), q(l.contaId ? nome("contas", l.contaId) : nome("cartoes", l.cartaoId)), q(l.contaDestinoId ? nome("contas", l.contaDestinoId) : ""), l.meio ?? "", l.status].join(";"))].join("\n");
}

// O que um "importar JSON" substitui: contagem por coleção, antes e depois. A UI mostra antes de pedir confirmação.
export const COLECOES_RESUMO = ["lancamentos", "contas", "cartoes", "categorias", "regras", "metas", "dividas", "investimentos", "pesos", "medidas", "treinos"];
export const resumoColecoes = (atual, novo) => COLECOES_RESUMO.map((c) => ({ colecao: c, antes: (atual?.[c] ?? []).length, depois: (novo?.[c] ?? []).length }));

// `mesclar` (arquivo.mjs) espera `meta.removidos` como objeto { id: quando } e ignora coleções sem `id`
// (faturas e snapshots); o esquema guarda `removidos` como lista [{ id, colecao, removidoEm }]. Este adaptador
// traduz nos dois sentidos, repõe faturas/snapshots por chave natural, reordena e valida antes de devolver.
export function prepararMescla(atual, outroV2) {
  const paraObjeto = (d) => ({ ...d, meta: { ...d.meta, removidos: Object.fromEntries((d.meta?.removidos ?? []).map((r) => [r.id, r.removidoEm])) } });
  const colecaoDe = new Map([...(atual.meta?.removidos ?? []), ...(outroV2.meta?.removidos ?? [])].map((r) => [r.id, r.colecao]));
  const m = mesclar(paraObjeto(atual), paraObjeto(outroV2));
  const removidos = Object.entries(m.meta.removidos).map(([id, removidoEm]) => ({ id, colecao: colecaoDe.get(id) ?? "lancamentos", removidoEm }));
  const maisNovo = (atual.meta?.atualizadoEm ?? "") >= (outroV2.meta?.atualizadoEm ?? "") ? atual : outroV2;
  const chave = { faturas: (f) => `${f.cartaoId}/${f.ym}`, snapshots: (s) => s.ym };
  const resultado = { ...m, meta: { ...m.meta, removidos } };
  for (const c of ["faturas", "snapshots"]) {
    const vistos = new Map();
    for (const x of [...(maisNovo[c] ?? []), ...((maisNovo === atual ? outroV2 : atual)[c] ?? [])]) if (!vistos.has(chave[c](x))) vistos.set(chave[c](x), x);
    resultado[c] = [...vistos.values()];
  }
  for (const c of COLECOES) resultado[c] = ordenar(c, resultado[c] ?? []);
  const v = validar(resultado);
  if (!v.ok) return { ok: false, erros: v.erros };
  const idsAtual = new Set(COLECOES.flatMap((c) => (atual[c] ?? []).map((x) => x.id).filter(Boolean)));
  const json = (x) => JSON.stringify(x);
  const porColecao = COLECOES_RESUMO.map((c) => {
    const antes = new Map((atual[c] ?? []).map((x) => [x.id, json(x)]));
    const novos = (resultado[c] ?? []).filter((x) => !idsAtual.has(x.id)).length;
    const atualizados = (resultado[c] ?? []).filter((x) => antes.has(x.id) && antes.get(x.id) !== json(x)).length;
    const removidos = (atual[c] ?? []).filter((x) => !(resultado[c] ?? []).some((y) => y.id === x.id)).length;
    return { colecao: c, novos, atualizados, removidos };
  }).filter((r) => r.novos || r.atualizados || r.removidos);
  return { ok: true, dados: resultado, resumo: porColecao };
}

// Força da senha, simples e honesta: comprimento e variedade. Não promete nada: "forte" aqui só encarece o chute.
export function forcaSenha(senha) {
  const s = String(senha ?? "");
  if (s.length < SENHA_MINIMA) return { nivel: 0, codigo: "curta" };
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^\w\s]/].filter((re) => re.test(s)).length;
  if (s.length >= 16 && classes >= 3) return { nivel: 3, codigo: "forte" };
  if (s.length >= 12 || classes >= 3) return { nivel: 2, codigo: "razoavel" };
  return { nivel: 1, codigo: "fraca" };
}

// Registros alterados desde o último backup: lançamentos com `atualizadoEm` posterior; sem backup, tudo conta.
export function registrosDesdeBackup(dados) {
  const ult = dados.meta?.ultimoBackupEm;
  if (!ult) return COLECOES.reduce((s, c) => s + (dados[c] ?? []).length, 0);
  return dados.lancamentos.filter((l) => (l.atualizadoEm ?? "") > ult).length;
}

// Safari/WebKit sem instalar na Tela de Início: o iOS apaga dados de site não visitado em 7 dias.
export function webkitNaoInstalado(ua, { standalone = false, displayModeStandalone = false } = {}) {
  const s = String(ua ?? "");
  return /AppleWebKit/.test(s) && !/Chrome|Chromium|CriOS|Android|Edg/.test(s) && !standalone && !displayModeStandalone;
}

export function formatarBytes(n, fmt) {
  if (n == null) return null;
  if (n < 1024 * 1024) return `${fmt.numero(n / 1024, 0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${fmt.numero(n / (1024 * 1024), 1)} MB`;
  return `${fmt.numero(n / (1024 * 1024 * 1024), 2)} GB`;
}

export const ehBackupCifrado = (texto) => { try { lerCabecalho(texto); return true; } catch { return false; } };

// Worker sob demanda com fallback para a thread da página (file://, navegador sem Worker de módulo).
export function criarCifrador({ WorkerImpl = globalThis.Worker, caminho = CAMINHO_WORKER } = {}) {
  let worker = null, n = 0;
  const pendentes = new Map();
  const viaWorker = (msg) => new Promise((resolve, reject) => {
    if (!worker) {
      worker = new WorkerImpl(caminho, { type: "module" });
      worker.addEventListener("message", (e) => { const p = pendentes.get(e.data?.id); if (!p) return; pendentes.delete(e.data.id); e.data.ok ? p.resolve(e.data.resultado) : p.reject(new Error(e.data.erro)); });
      worker.addEventListener("error", () => { for (const p of pendentes.values()) p.reject(new Error("worker")); pendentes.clear(); worker = null; });
    }
    const id = ++n; pendentes.set(id, { resolve, reject }); worker.postMessage({ id, ...msg });
  });
  const tentar = async (msg, direto) => { if (typeof WorkerImpl !== "function") return direto(); try { return await viaWorker(msg); } catch (e) { if (e.message === "worker") return direto(); throw e; } };
  return {
    cifrar: (texto, senha) => tentar({ op: "cifrar", texto, senha }, () => cifrar(texto, senha)),
    decifrar: (arquivo, senha) => tentar({ op: "decifrar", arquivo, senha }, () => decifrar(arquivo, senha)),
  };
}

// ---------- tela ----------
export const tela = {
  id: "dados", titulo: "dados.titulo", icone: "data", grupo: "mais", ordem: 90,
  css: "/css/dados.css", i18n: "/js/v2/ui/telas/dados.i18n.mjs",
  montar(ctx) {
    const { h, t, fmt, limpar } = ctx;
    const raiz = h("section", { class: "fd", "aria-labelledby": "fd-titulo" });
    const st = { aviso: null, handle: null, nomeArquivo: null, armazem: null, persistido: null, cifrador: null, ocupado: false };
    const nav = globalThis.navigator, win = globalThis;
    const cifrador = () => (st.cifrador ??= criarCifrador());

    const dialogo = ({ titulo, corpo, ok, perigo = false, extra = null, senha = false }) => new Promise((resolve) => {
      const campo = senha ? h("input", { id: "fd-dlg-senha", class: "fd-campo", type: "password", autocomplete: "off", required: true }) : null;
      const fecha = (v) => { dlg.close(); dlg.remove(); resolve(v); };
      const dlg = h("dialog", { class: "fd-dialogo", "aria-labelledby": "fd-dlg-t", onclose: () => { dlg.remove(); resolve(null); } },
        h("h3", { id: "fd-dlg-t" }, titulo), ...(Array.isArray(corpo) ? corpo : [h("p", null, corpo)]), campo ? h("label", { for: "fd-dlg-senha" }, t("dados.cifrado.senhaDoArquivo")) : null, campo, extra,
        h("div", { class: "fd-acoes" }, h("button", { type: "button", class: "fd-btn", onclick: () => fecha(null) }, t("dados.cancelar")), h("button", { type: "button", class: ["fd-btn", perigo ? "fd-perigo" : "fd-primario"], onclick: () => fecha(senha ? campo.value : true) }, ok)));
      raiz.append(dlg); dlg.showModal(); campo?.focus();
    });
    const avisar = (texto, erro = false) => { st.aviso = { texto, erro }; render(); };
    const baixar = (nome, texto, tipo) => { baixarTexto(nome, texto, tipo, { w: win, doc: document }); }; // casca nativa: folha de compartilhar
    const marcarBackup = () => ctx.mudar((d) => definir(d, "meta", { ultimoBackupEm: ctx.agora() }, { agora: ctx.agora })).catch(() => {});
    const lerTexto = (input) => new Promise((resolve) => { const f = input.files?.[0]; if (!f) return resolve(null); f.text().then((texto) => resolve({ nome: f.name, texto })); });

    // Texto de um arquivo que pode estar cifrado: pede a senha num <dialog> e decifra no worker.
    async function abrirPossivelmenteCifrado(arq) {
      if (!ehBackupCifrado(arq.texto)) return arq.texto;
      const senha = await dialogo({ titulo: t("dados.cifrado.abrirTitulo"), corpo: t("dados.cifrado.abrirExplica", { arquivo: arq.nome }), ok: t("dados.cifrado.abrir"), senha: true });
      if (!senha) return null;
      try { return await cifrador().decifrar(arq.texto, senha); } catch { avisar(t("dados.cifrado.senhaErrada"), true); return null; }
    }

    function render() {
      limpar(raiz);
      const d = ctx.estado();
      raiz.append(h("h2", { id: "fd-titulo" }, t("dados.titulo")), h("p", { class: "fd-aqui" }, t("dados.aqui")));
      if (st.aviso) raiz.append(h("p", { class: ["fd-aviso", st.aviso.erro && "fd-aviso-erro"], role: st.aviso.erro ? "alert" : "status", "aria-live": "polite" }, st.aviso.texto));
      raiz.append(renderLembrete(d), renderExportar(d), renderCifrado(d), renderTrazer(d), renderArmazem(), renderIdioma(d), renderPrivacidade(), renderApagar(d));
    }

    function renderLembrete(d) {
      const webkit = webkitNaoInstalado(nav?.userAgent, { standalone: !!nav?.standalone, displayModeStandalone: !!win.matchMedia?.("(display-mode: standalone)")?.matches });
      const r = precisaDeBackup({ ultimoBackupEm: d.meta.ultimoBackupEm, registrosDesdeBackup: COLECOES.some((c) => c !== "categorias" && (d[c] ?? []).length) ? registrosDesdeBackup(d) : 0, hoje: ctx.hoje(), webkitNaoInstalado: webkit });
      const bloco = h("div", { class: ["fd-cartao", r.precisa ? "fd-lembrete" : "fd-lembrete-ok"] }, h("h3", null, t(r.precisa ? "dados.lembrete.titulo" : "dados.lembrete.emDia")));
      bloco.append(h("p", null, d.meta.ultimoBackupEm ? t("dados.lembrete.ultimo", { data: fmt.data(d.meta.ultimoBackupEm.slice(0, 10)), dias: r.dias ?? 0 }) : t("dados.lembrete.nunca")));
      for (const c of r.codigos) bloco.append(h("p", { class: "fd-motivo" }, t(`dados.lembrete.${c}`, { dias: LIMITE_DIAS, registros: LIMITE_REGISTROS, n: r.registros, diasWebkit: LIMITE_DIAS_WEBKIT })));
      if (webkit) bloco.append(h("p", { class: "fd-mudo" }, t("dados.lembrete.iphone")), h("p", { class: "fd-mudo" }, t("dados.lembrete.instalar")));
      return bloco;
    }

    function renderExportar(d) {
      const fsa = temFileSystemAccess(win);
      return h("div", { class: "fd-cartao" }, h("h3", null, t("dados.exportar.titulo")), h("p", null, t("dados.exportar.explica")),
        h("div", { class: "fd-acoes fd-acoes-ini" },
          h("button", { type: "button", class: "fd-btn fd-primario", onclick: async () => { baixar(`fitrich-${ctx.hoje()}.json`, exportarJSON(d), "application/json"); await marcarBackup(); avisar(t("dados.exportar.jsonFeito")); } }, t("dados.exportar.json")),
          h("button", { type: "button", class: "fd-btn", onclick: () => { baixar(`fitrich-lancamentos-${ctx.hoje()}.csv`, "﻿" + exportarCSV(d), "text/csv;charset=utf-8"); avisar(t("dados.exportar.csvFeito", { n: d.lancamentos.length })); } }, t("dados.exportar.csv"))),
        fsa ? h("div", { class: "fd-sempre" }, h("button", { type: "button", class: "fd-btn", onclick: async () => {
          try { const { handle } = await salvarArquivo(exportarJSON(d), { handle: st.handle, nome: "fitrich.json", w: win, doc: document }); st.handle = handle; st.nomeArquivo = handle?.name ?? null; await marcarBackup(); avisar(t("dados.exportar.salvoEm", { arquivo: st.nomeArquivo ?? "fitrich.json" })); } catch (e) { if (e?.name !== "AbortError") avisar(t("dados.exportar.falhou"), true); }
        } }, st.handle ? t("dados.exportar.salvarDeNovo", { arquivo: st.nomeArquivo ?? "" }) : t("dados.exportar.salvarSempre")), h("p", { class: "fd-mudo" }, t(st.handle ? "dados.exportar.salvarSempreLigado" : "dados.exportar.salvarSempreExplica"))) : h("p", { class: "fd-mudo" }, t("dados.exportar.semFsa")));
    }

    function renderCifrado(d) {
      const senha = h("input", { id: "fd-senha", class: "fd-campo", type: "password", autocomplete: "new-password", minlength: SENHA_MINIMA, oninput: medir });
      const senha2 = h("input", { id: "fd-senha2", class: "fd-campo", type: "password", autocomplete: "new-password", oninput: medir });
      const medidor = h("div", { class: "fd-forca", role: "status", "aria-live": "polite" }, h("span", { class: "fd-forca-barra", dataset: { nivel: 0 } }), h("span", { class: "fd-forca-texto" }));
      const botao = h("button", { type: "submit", class: "fd-btn fd-primario", disabled: true }, t("dados.cifrado.criar"));
      function medir() {
        const f = forcaSenha(senha.value);
        medidor.firstChild.dataset.nivel = String(f.nivel);
        medidor.lastChild.textContent = senha.value ? t(`dados.cifrado.forca.${f.codigo}`, { min: SENHA_MINIMA }) : "";
        botao.disabled = f.nivel === 0 || senha.value !== senha2.value || st.ocupado;
      }
      const form = h("form", { class: "fd-form", onsubmit: async (e) => {
        e.preventDefault();
        if (senha.value !== senha2.value) return avisar(t("dados.cifrado.naoBatem"), true);
        if (!(await dialogo({ titulo: t("dados.cifrado.avisoTitulo"), corpo: [h("p", null, t("dados.cifrado.semRecuperacao")), h("p", null, t("dados.cifrado.protege")), h("p", null, t("dados.cifrado.naoProtege"))], ok: t("dados.cifrado.entendi") }))) return;
        st.ocupado = true; botao.disabled = true; botao.textContent = t("dados.cifrado.cifrando");
        try {
          const arquivo = await cifrador().cifrar(exportarJSON(ctx.estado()), senha.value);
          baixar(`fitrich-${ctx.hoje()}.enc.json`, arquivo, "application/json");
          await marcarBackup(); avisar(t("dados.cifrado.feito"));
        } catch { avisar(t("dados.cifrado.falhou"), true); } finally { st.ocupado = false; }
      } }, h("div", { class: "fd-grade" }, h("div", { class: "fd-campo-bloco" }, h("label", { for: "fd-senha" }, t("dados.cifrado.senha")), senha), h("div", { class: "fd-campo-bloco" }, h("label", { for: "fd-senha2" }, t("dados.cifrado.senha2")), senha2)), medidor, h("div", { class: "fd-acoes fd-acoes-ini" }, botao));
      return h("div", { class: "fd-cartao" }, h("h3", null, t("dados.cifrado.titulo")), h("p", null, t("dados.cifrado.explica", { iter: fmt.numero(ITERACOES_MINIMAS) })),
        h("ul", { class: "fd-lista" }, h("li", null, t("dados.cifrado.protege")), h("li", null, t("dados.cifrado.naoProtege")), h("li", { class: "fd-forte" }, t("dados.cifrado.semRecuperacao"))), form);
    }

    function renderTrazer(d) {
      const inJson = h("input", { type: "file", id: "fd-importar", accept: "application/json,.json", class: "fd-input-arquivo", onchange: () => importar(inJson) });
      const inMesclar = h("input", { type: "file", id: "fd-mesclar", accept: "application/json,.json", class: "fd-input-arquivo", onchange: () => mesclarArquivo(inMesclar) });
      return h("div", { class: "fd-cartao" }, h("h3", null, t("dados.trazer.titulo")),
        h("div", { class: "fd-opcao" }, h("label", { for: "fd-importar", class: "fd-btn fd-btn-label" }, t("dados.trazer.importar")), inJson, h("p", { class: "fd-mudo" }, t("dados.trazer.importarExplica"))),
        h("div", { class: "fd-opcao" }, h("label", { for: "fd-mesclar", class: "fd-btn fd-btn-label" }, t("dados.trazer.mesclar")), inMesclar, h("p", { class: "fd-mudo" }, t("dados.trazer.mesclarExplica"))));
    }
    async function importar(input) {
      const arq = await lerTexto(input); input.value = "";
      if (!arq) return;
      const texto = await abrirPossivelmenteCifrado(arq);
      if (texto == null) return;
      const r = importarJSON(texto, { agora: ctx.agora });
      if (!r.ok) return avisar(t("dados.trazer.invalido", { motivo: r.erros[0]?.codigo ?? "?" }), true);
      const atual = ctx.estado(), resumo = resumoColecoes(atual, r.dados);
      const tabela = h("table", { class: "fd-tabela" }, h("thead", null, h("tr", null, h("th", null, t("dados.trazer.colecao")), h("th", { class: "fd-num" }, t("dados.trazer.hoje")), h("th", { class: "fd-num" }, t("dados.trazer.noArquivo")))),
        h("tbody", null, ...resumo.filter((x) => x.antes || x.depois).map((x) => h("tr", null, h("td", null, t(`dados.colecao.${x.colecao}`)), h("td", { class: "fd-num" }, String(x.antes)), h("td", { class: "fd-num" }, String(x.depois))))));
      const ok = await dialogo({ titulo: t("dados.trazer.confirmarTitulo"), corpo: [h("p", null, t("dados.trazer.confirmarExplica", { arquivo: arq.nome, versao: String(JSON.parse(texto).versao ?? "?") })), tabela, h("p", { class: "fd-forte" }, t("dados.trazer.substitui"))], ok: t("dados.trazer.substituir"), perigo: true });
      if (!ok) return;
      try { await ctx.mudar(() => r.dados); avisar(t("dados.trazer.importado", { n: r.dados.lancamentos.length })); } catch (e) { avisar(t("dados.falhouGravar", { motivo: e?.erros?.map((x) => x.codigo).join(", ") ?? e?.message ?? "" }), true); }
    }
    async function mesclarArquivo(input) {
      const arq = await lerTexto(input); input.value = "";
      if (!arq) return;
      const texto = await abrirPossivelmenteCifrado(arq);
      if (texto == null) return;
      const lido = importarJSON(texto, { agora: ctx.agora });
      if (!lido.ok) return avisar(t("dados.trazer.invalido", { motivo: lido.erros[0]?.codigo ?? "?" }), true);
      const m = prepararMescla(ctx.estado(), lido.dados);
      if (!m.ok) return avisar(t("dados.trazer.mesclaInvalida", { motivo: m.erros[0]?.codigo ?? "?" }), true);
      if (!m.resumo.length) return avisar(t("dados.trazer.nadaAMesclar"));
      const ul = h("ul", { class: "fd-lista" }, ...m.resumo.map((x) => h("li", null, t("dados.trazer.mesclaLinha", { colecao: t(`dados.colecao.${x.colecao}`), novos: x.novos, atualizados: x.atualizados, removidos: x.removidos }))));
      const ok = await dialogo({ titulo: t("dados.trazer.mesclarTitulo"), corpo: [h("p", null, t("dados.trazer.mesclarConfirma", { arquivo: arq.nome })), ul], ok: t("dados.trazer.mesclar") });
      if (!ok) return;
      try { await ctx.mudar(() => m.dados); avisar(t("dados.trazer.mesclado")); } catch (e) { avisar(t("dados.falhouGravar", { motivo: e?.erros?.map((x) => x.codigo).join(", ") ?? e?.message ?? "" }), true); }
    }

    function renderArmazem() {
      const bloco = h("div", { class: "fd-cartao" }, h("h3", null, t("dados.armazem.titulo")), h("p", null, t("dados.armazem.explica")));
      const linha = h("p", { class: "fd-mudo" }, t("dados.armazem.medindo"));
      const persist = h("p", { class: "fd-mudo" });
      bloco.append(linha, persist);
      (async () => {
        try {
          const e = await nav?.storage?.estimate?.();
          linha.textContent = e ? t("dados.armazem.uso", { uso: formatarBytes(e.usage ?? 0, fmt), cota: formatarBytes(e.quota ?? 0, fmt) }) : t("dados.armazem.semEstimativa");
          const p = await nav?.storage?.persisted?.();
          st.persistido = p ?? null;
          limpar(persist);
          if (p === true) persist.append(t("dados.armazem.persistidoSim"));
          else if (p === false) persist.append(t("dados.armazem.persistidoNao"), " ", h("button", { type: "button", class: "fd-btn fd-mini", onclick: async () => { const ok = await nav.storage.persist(); st.persistido = ok; persist.textContent = ok ? t("dados.armazem.persistidoSim") : t("dados.armazem.persistidoRecusado"); } }, t("dados.armazem.pedir")));
          else persist.textContent = t("dados.armazem.semPersist");
        } catch { linha.textContent = t("dados.armazem.semEstimativa"); }
      })();
      return bloco;
    }

    function renderIdioma(d) {
      const radio = (valor, rotulo) => h("label", { class: "fd-radio" }, h("input", { type: "radio", name: "fd-idioma", value: valor, checked: d.perfil.idioma === valor, onchange: async () => { try { await ctx.mudar((x) => definir(x, "perfil", { idioma: valor }, { agora: ctx.agora })); } catch { avisar(t("dados.falhouGravar", { motivo: "" }), true); } } }), rotulo);
      return h("div", { class: "fd-cartao" }, h("h3", null, t("dados.idioma.titulo")), h("fieldset", { class: "fd-fieldset" }, h("legend", null, t("dados.idioma.explica")), radio("pt-BR", "Português (Brasil)"), radio("en", "English")));
    }

    function renderPrivacidade() {
      return h("div", { class: "fd-cartao" }, h("h3", null, t("dados.privacidade.titulo")), h("ul", { class: "fd-lista" }, h("li", null, t("dados.privacidade.aparelho")), h("li", null, t("dados.privacidade.projeto")), h("li", null, t("dados.privacidade.hospedagem")), h("li", null, t("dados.privacidade.semAnalytics")), h("li", null, t("dados.privacidade.backupSeu"))));
    }

    function renderApagar(d) {
      const n = COLECOES.reduce((s, c) => s + (d[c] ?? []).length, 0);
      return h("div", { class: "fd-cartao fd-zona" }, h("h3", null, t("dados.apagar.titulo")), h("p", null, t("dados.apagar.explica")),
        h("div", { class: "fd-acoes fd-acoes-ini" }, h("button", { type: "button", class: "fd-btn fd-perigo", onclick: () => apagarTudo(n) }, t("dados.apagar.botao"))));
    }
    async function apagarTudo(n) {
      const d = ctx.estado();
      const exportarAntes = h("button", { type: "button", class: "fd-btn", onclick: async () => { baixar(`fitrich-${ctx.hoje()}.json`, exportarJSON(ctx.estado()), "application/json"); await marcarBackup(); exportarAntes.textContent = t("dados.apagar.exportado"); } }, t("dados.apagar.exportarAntes"));
      const ok = await dialogo({ titulo: t("dados.apagar.titulo"), corpo: [h("p", null, t("dados.apagar.confirma", { n, lancamentos: d.lancamentos.length })), h("p", { class: "fd-forte" }, t("dados.apagar.semVolta"))], extra: h("div", { class: "fd-acoes fd-acoes-ini" }, exportarAntes), ok: t("dados.apagar.botao"), perigo: true });
      if (!ok) return;
      try { await ctx.mudar((x) => { const z = vazio({ agora: ctx.agora }); return { ...z, perfil: { ...z.perfil, idioma: x.perfil.idioma } }; }); avisar(t("dados.apagar.feito")); } catch (e) { avisar(t("dados.falhouGravar", { motivo: e?.erros?.map((x) => x.codigo).join(", ") ?? e?.message ?? "" }), true); }
    }

    render();
    return { elemento: raiz, atualizar() { if (!st.ocupado && !raiz.querySelector("dialog[open]")) render(); }, destruir() { limpar(raiz); } };
  },
};

export { FORMATO as FORMATO_CIFRADO };
