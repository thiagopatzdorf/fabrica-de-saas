// Fitrich v2, o shell: liga armazém (IndexedDB + migração v1→v2), estado, rota por hash, navegação,
// tema e idioma, e entrega a cada tela um `ctx` (ctx.mjs). As telas chegam pelo registro
// (`v2/ui/telas/indice.mjs`) e são carregadas sob demanda, com CSS e dicionário próprios; tela que ainda
// não existe vira "em breve". Tudo o que aparece na tela passa por `t()`; nenhum HTML é montado com
// string (h.mjs); nenhum `style=`; nenhuma rede. Os módulos v1 (`dados.mjs`, `financas.mjs`) não entram
// mais na carga inicial: a v2 os substitui (plano-v2.md, item 10 da reconciliação).
import { hojeISO } from "./datas.mjs";
import { criarAdaptadorIDB, criarAdaptadorMemoria, criarArmazem } from "./v2/armazem.mjs";
import { ErroEsquema, agoraPadrao, novoIdPadrao, validar, vazio } from "./v2/esquema.mjs";
import { indicesVigentes } from "./v2/indices.mjs";
import { precisaDeBackup } from "./v2/lembrete-backup.mjs";
import { criarCtx } from "./v2/ui/ctx.mjs";
import { h, limpar } from "./v2/ui/h.mjs";
import { criarI18n } from "./v2/ui/i18n.mjs";
import { icone } from "./v2/ui/icones.mjs";
import { ABAS_INFERIORES, FOLHAS, TELAS, TELA_INICIAL, carregarTela, porId } from "./v2/ui/telas/indice.mjs";

const $ = (s) => document.querySelector(s);
const IDIOMA = document.documentElement.lang === "en" ? "en" : "pt-BR";
const CHAVE_AVISO_MIGRACAO = "fitrich-aviso-migracao-visto";
const ls = (f) => { try { return f(); } catch { return null; } };
const lerLS = (k) => ls(() => localStorage.getItem(k));
const gravarLS = (k, v) => ls(() => { localStorage.setItem(k, v); return true; });

// Dicionário é um módulo JS (`<id>.i18n.mjs`, `export default {...}`): sem fetch (a CSP vai ter
// connect-src 'none') e sem import attributes de JSON (o CI roda Node 18.19 e navegador velho não parseia).
// Falhou? A tela mostra "[chave]" em vez de quebrar.
async function carregarDicionario(caminho) {
  try { return (await import(new URL(caminho, location.origin).href)).default; } catch { return null; }
}
const cssCarregados = new Set();
// `css` da tela é um caminho ou uma lista (comum + da tela): vários <link>, em paralelo, sem @import em cascata.
function carregarCSS(css) {
  return Promise.all([css ?? []].flat().map((caminho) => {
    if (!caminho || cssCarregados.has(caminho)) return Promise.resolve();
    cssCarregados.add(caminho);
    return new Promise((res) => { const l = h("link", { rel: "stylesheet", href: caminho, onload: res, onerror: res }); document.head.append(l); });
  }));
}

const VAZIOS = "/js/v2/ui/vazios.i18n.mjs"; // textos dos estados vazios que ensinam (ctx.estadoVazio), carregados uma vez
const i18n = criarI18n({ idioma: IDIOMA });
const t = i18n.t;
const dicionariosCarregados = new Set();
async function dicionario(caminho) {
  if (!caminho || dicionariosCarregados.has(caminho)) return;
  dicionariosCarregados.add(caminho);
  const d = await carregarDicionario(caminho);
  if (d) i18n.somar(d);
}

// ---------- estado e armazém ----------
let estado = null, armazem = null, adaptador = null, semArmazenamento = false, resultadoMigracao = null;
let telaAtual = null, idAtual = null, montagem = null, folhaLancar = null, plat = null;
const agora = agoraPadrao, hoje = () => hojeISO(), novoId = () => novoIdPadrao();
const ouvintes = new Set(); // quem quer saber que os dados mudaram (folha Lançar, por exemplo)

async function abrirArmazem() {
  try {
    adaptador = criarAdaptadorIDB(globalThis.indexedDB);
    await adaptador.abrir();
  } catch {
    adaptador = criarAdaptadorMemoria();
    semArmazenamento = true;
  }
  armazem = criarArmazem({ adaptador, localStorage: ls(() => localStorage), agora, navegador: navigator });
  resultadoMigracao = await armazem.migrarDaV1();
  let dados = null;
  try { dados = await armazem.carregar(); } catch { dados = null; }
  if (!dados) dados = vazio({ agora });
  if (dados.perfil.idioma !== IDIOMA) dados = { ...dados, perfil: { ...dados.perfil, idioma: IDIOMA } };
  estado = dados;
  if (!semArmazenamento) armazem.pedirPersistencia();
}

// `mudar(fn)`: fn(dados) → dados novos (funções imutáveis do esquema). Valida, grava, re-renderiza só a
// tela atual. Em modo exemplo, o primeiro `mudar` real tira o exemplo antes de gravar (nunca se mistura).
async function mudar(fn) {
  let novo = fn(estado);
  if (!novo || typeof novo !== "object") throw new ErroEsquema([{ codigo: "mudar.sem_retorno", caminho: "" }]);
  if (novo.meta?.exemplo) { const { sairDoExemplo } = await import("./v2/ui/dados-exemplo.mjs"); novo = sairDoExemplo(novo); }
  const v = validar(novo);
  if (!v.ok) throw new ErroEsquema(v.erros);
  const r = await armazem.salvarLote(novo);
  if (!r.ok) throw new ErroEsquema(r.erros);
  estado = novo;
  renderAvisos();
  plat?.render?.();
  plat?.serv.nativo.haptico("leve"); // casca nativa: toque ao confirmar; no navegador não faz nada
  if (montagem?.atualizar) montagem.atualizar(); else if (idAtual) await montarTela(idAtual);
  for (const f of ouvintes) f();
}

function navegar(id, params) {
  if (id === "lancar") return abrirLancar(params);
  if (id === "exemplo") return entrarNoExemplo();
  if (id === "sair-exemplo") return sairDoExemploAgora();
  const alvo = porId(id) ? id : TELA_INICIAL;
  const hash = `#/${alvo}`;
  if (location.hash === hash) return montarTela(alvo);
  location.hash = hash;
}

// <dialog> de confirmação para as telas (nunca confirm()). Resolve true/false.
function dialogo({ titulo, texto, confirmar, cancelar, perigo = false }) {
  return new Promise((res) => {
    const fechar = (ok) => { dlg.close(); dlg.remove(); res(ok); };
    const dlg = h("dialog", { class: "folha", "aria-labelledby": "dlg-titulo", onclose: () => res(false) },
      h("div", { class: "folha-puxador" }),
      h("div", { class: "folha-cabeca" }, h("h2", { id: "dlg-titulo" }, titulo)),
      texto ? h("p", { class: "nota" }, texto) : null,
      h("div", { class: "acoes-dialogo" },
        h("button", { type: "button", class: "botao leve", onclick: () => fechar(false) }, cancelar ?? t("app.cancelar")),
        h("button", { type: "button", class: ["botao", perigo && "perigo"], onclick: () => fechar(true) }, confirmar ?? t("app.confirmar"))));
    document.body.append(dlg);
    dlg.showModal();
  });
}

const ctx = () => criarCtx({ estado: () => estado, mudar, i18n, hoje, agora, novoId, indices: indicesVigentes(), navegar, dialogo });

// ---------- avisos do shell (um por vez) ----------
function renderAvisos() {
  const alvo = $("#avisos");
  limpar(alvo);
  const aviso = (classe, nome, texto, ...acoes) => alvo.append(h("div", { class: ["aviso", classe], role: "status" }, icone(nome), h("div", { class: "aviso-corpo" }, h("p", null, texto), acoes.length ? h("div", { class: "acoes" }, ...acoes) : null)));
  if (estado?.meta?.exemplo) return aviso("", "exemplo", t("app.exemplo_aviso"), h("button", { type: "button", class: "botao leve", onclick: sairDoExemploAgora }, t("app.sair_exemplo")));
  if (semArmazenamento) return aviso("atencao", "atencao", t("app.sem_armazenamento"));
  const m = resultadoMigracao;
  if (m && !m.ok) {
    return aviso("atencao", "atencao", t("app.migracao_falhou", { codigo: t(`erro.${m.codigo}`) }),
      m.jsonV1 ? h("button", { type: "button", class: "botao leve", onclick: () => baixar(`fitrich-v1-${hoje()}.json`, m.jsonV1) }, t("app.baixar_v1")) : null);
  }
  if (m?.codigo?.startsWith("migracao.feita") && !lerLS(CHAVE_AVISO_MIGRACAO)) {
    return aviso("", "info", t("app.migracao_feita"), h("button", { type: "button", class: "botao leve", onclick: () => { gravarLS(CHAVE_AVISO_MIGRACAO, "1"); renderAvisos(); } }, t("app.entendi")));
  }
  const registros = estado.lancamentos.filter((l) => !estado.meta.ultimoBackupEm || l.atualizadoEm > estado.meta.ultimoBackupEm).length;
  const b = precisaDeBackup({ ultimoBackupEm: estado.meta.ultimoBackupEm, registrosDesdeBackup: registros, hoje: hoje() });
  if (b.precisa && registros >= 5) aviso("", "cadeado", t(b.codigos.includes("backup.nunca_feito") ? "app.backup_nunca" : "app.backup_lembrete"), h("a", { class: "botao leve", href: "#/dados" }, t("app.ir_dados")));
}

function baixar(nome, texto) {
  const a = h("a", { href: URL.createObjectURL(new Blob([texto], { type: "application/json" })), download: nome });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- exemplo ----------
async function entrarNoExemplo() {
  const { dadosExemplo } = await import("./v2/ui/dados-exemplo.mjs");
  estado = dadosExemplo({ hoje: hoje(), agora, idioma: IDIOMA });
  renderAvisos();
  await navegar(TELA_INICIAL);
  if (montagem?.atualizar) montagem.atualizar(); else await montarTela(idAtual);
  for (const f of ouvintes) f();
}
async function sairDoExemploAgora() {
  if (!estado?.meta?.exemplo) return;
  estado = (await armazem.carregar()) ?? vazio({ agora });
  renderAvisos();
  if (montagem?.atualizar) montagem.atualizar(); else await montarTela(idAtual);
  for (const f of ouvintes) f();
}

// ---------- navegação ----------
function linkTela(entrada, { comIndicador = false, mostrarEmBreve = false } = {}) {
  const atual = entrada.id === idAtual;
  return h("a", { href: `#/${entrada.id}`, "aria-current": atual ? "page" : null, dataset: { tela: entrada.id } },
    icone(entrada.icone), h("span", null, t(`tela.${entrada.id}`)),
    mostrarEmBreve && entrada.emBreve ? h("span", { class: "em-breve" }, t("app.em_breve")) : null,
    comIndicador ? h("span", { class: "nav-ind", "aria-hidden": "true" }) : null);
}
function renderNav() {
  const inferior = limpar($("#nav-inferior")), lateral = limpar($("#nav-lateral"));
  const abas = ABAS_INFERIORES.map(porId).filter(Boolean);
  const emMais = !abas.some((a) => a.id === idAtual);
  inferior.append(h("ul", null,
    ...abas.map((e) => h("li", null, linkTela(e, { comIndicador: true }))),
    h("li", null, h("button", { type: "button", "aria-haspopup": "dialog", "aria-current": emMais && idAtual ? "page" : null, onclick: abrirMais }, icone("mais"), h("span", null, t("app.mais")), h("span", { class: "nav-ind", "aria-hidden": "true" })))));
  for (const grupo of ["principal", "mais"]) {
    lateral.append(h("p", { class: "grupo" }, t(`grupo.${grupo}`)), h("ul", null, ...TELAS.filter((e) => e.grupo === grupo).sort((a, b) => a.ordem - b.ordem).map((e) => h("li", null, linkTela(e, { mostrarEmBreve: true })))));
  }
  controlesAparencia().then((el) => { if (!lateral.querySelector(".aparencia")) lateral.append(el); });
}
// Aparência (alto contraste, texto maior): módulo, textos e CSS só quando alguém abre o menu (fora da carga inicial).
async function controlesAparencia() {
  const [m] = await Promise.all([import("./v2/ui/aparencia-ui.mjs"), dicionario("/js/v2/ui/aparencia.i18n.mjs"), carregarCSS("/css/componentes.css")]);
  return m.controlesAparencia({ h, t });
}
function abrirMais() {
  const dlg = h("dialog", { class: "folha", "aria-labelledby": "mais-titulo", onclick: (e) => { if (e.target === dlg) dlg.close(); }, onclose: () => dlg.remove() },
    h("div", { class: "folha-puxador" }),
    h("div", { class: "folha-cabeca" }, h("h2", { id: "mais-titulo" }, t("app.mais")), h("button", { type: "button", class: "icone-btn", "aria-label": t("app.fechar"), onclick: () => dlg.close() }, icone("fechar"))),
    h("ul", { class: "menu-mais", onclick: (e) => { if (e.target.closest("a")) dlg.close(); } }, ...TELAS.filter((e) => !ABAS_INFERIORES.includes(e.id)).sort((a, b) => a.ordem - b.ordem).map((e) => h("li", null, linkTela(e, { mostrarEmBreve: true })))),
    h("p", { class: "nota rodape" }, icone("cadeado"), t("app.dados_locais")));
  controlesAparencia().then((el) => dlg.querySelector(".nota.rodape")?.before(el));
  document.body.append(dlg);
  dlg.showModal();
}

// ---------- telas ----------
let sequencia = 0, jaMontouUma = false;
async function montarTela(id) {
  const minha = ++sequencia; // navegação rápida: só a última montagem vence
  const entrada = porId(id) ?? porId(TELA_INICIAL);
  if (montagem?.destruir) { try { montagem.destruir(); } catch { /* a tela antiga já era */ } }
  montagem = null; idAtual = entrada.id; telaAtual = null;
  renderNav();
  $("#titulo-tela").textContent = t(`tela.${entrada.id}`);
  document.title = `${t(`tela.${entrada.id}`)} · Fitrich`;
  const vista = $("#vista");
  // Esqueleto discreto: só aparece se a tela demorar mais de 120 ms (rede lenta); nunca pisca em tela rápida.
  const espera = setTimeout(() => { if (minha === sequencia) { vista.setAttribute("aria-busy", "true"); limpar(vista).append(h("div", { class: "esqueleto", "aria-hidden": "true" }, h("i"), h("i"), h("i"))); } }, 120);
  const r = await carregarTela(entrada);
  if (minha !== sequencia) { clearTimeout(espera); return; }
  if (!r.ok) {
    clearTimeout(espera); vista.removeAttribute("aria-busy");
    entrada.emBreve = true;
    renderNav();
    limpar(vista).append(h("section", { class: "em-breve-tela", "aria-labelledby": "em-breve-h" }, icone("relogio", { tamanho: 48 }), h("h2", { id: "em-breve-h" }, t("app.em_breve")), h("p", { class: "nota" }, t("app.em_breve_texto")), h("a", { class: "botao leve", href: `#/${TELA_INICIAL}` }, t("app.voltar_hoje"))));
    return;
  }
  telaAtual = r.tela;
  await Promise.all([dicionario(r.tela.i18n), dicionario(VAZIOS), carregarCSS(["/css/componentes.css", r.tela.css].flat())]);
  clearTimeout(espera); vista.removeAttribute("aria-busy");
  if (minha !== sequencia) return;
  if (r.tela.titulo) { $("#titulo-tela").textContent = t(r.tela.titulo); document.title = `${t(r.tela.titulo)} · Fitrich`; }
  try {
    montagem = r.tela.montar(ctx());
    limpar(vista).append(montagem.elemento);
  } catch (e) {
    limpar(vista).append(h("p", { class: "aviso atencao", role: "alert" }, t("app.tela_quebrou", { tela: t(`tela.${entrada.id}`) })));
    console.error(e);
  }
  // Foco no conteúdo só quando a pessoa NAVEGA; no carregamento inicial ele fica no começo da página, para o
  // primeiro Tab cair no link "pular" e não no meio da tela.
  if (jaMontouUma) vista.focus?.();
  jaMontouUma = true;
}

async function abrirLancar(params) {
  if (!folhaLancar) {
    const mod = await FOLHAS.lancar();
    await Promise.all([dicionario(mod.folha.i18n), carregarCSS(mod.folha.css)]);
    folhaLancar = mod.folha.montar(ctx());
    document.body.append(folhaLancar.elemento);
    ouvintes.add(() => folhaLancar.atualizar?.());
  }
  folhaLancar.abrir(params);
}

function rota() {
  const m = /^#\/([a-z-]+)/.exec(location.hash);
  // Atalho do app instalado ("Lançar gasto" no ícone): `#/lancar` não é tela, abre a folha por cima da atual.
  if (m && m[1] === "lancar") {
    history.replaceState(null, "", `#/${idAtual ?? TELA_INICIAL}`);
    if (!idAtual) montarTela(TELA_INICIAL);
    abrirLancar();
    return;
  }
  const id = m && porId(m[1]) ? m[1] : TELA_INICIAL;
  if (!m || m[1] !== id) { history.replaceState(null, "", `#/${id}`); }
  montarTela(id);
}

// ---------- tema e idioma ----------
function renderTema() {
  const escuro = document.documentElement.getAttribute("data-gs-theme") === "dark";
  const b = limpar($("#tema"));
  b.append(icone(escuro ? "sol" : "lua"));
  b.setAttribute("aria-label", t(escuro ? "app.tema_claro" : "app.tema_escuro"));
  b.setAttribute("aria-pressed", String(escuro));
}
// Primeiro uso: o módulo do onboarding só é baixado de quem ainda não o viu (a decisão fina mora nele).
async function talvezOnboarding() {
  if (lerLS("fitrich-onboarding") === "feito" || estado?.meta?.exemplo) return;
  const m = await import("./v2/ui/onboarding.mjs");
  await m.talvezAbrir({ ctx: ctx(), estado, aoFechar: () => navegar(TELA_INICIAL), carregar: () => Promise.all([dicionario("/js/v2/ui/onboarding.i18n.mjs"), carregarCSS("/css/onboarding.css")]) });
}

function alternarTema() {
  const d = document.documentElement, novo = d.getAttribute("data-gs-theme") === "dark" ? "light" : "dark";
  d.setAttribute("data-gs-theme", novo);
  gravarLS("gs-prisma-theme", novo);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", novo === "dark" ? "#1A1A19" : "#FCFCFB"); // barra do sistema acompanha
  renderTema();
}

// ---------- arranque ----------
async function iniciar() {
  const dic = await carregarDicionario("/js/v2/ui/app.i18n.mjs");
  if (dic) i18n.somar(dic);
  $("#tema").addEventListener("click", alternarTema);
  renderTema();
  // O link "pular" não pode mudar o hash (a rota é por hash): só leva o foco para o conteúdo.
  $("#pular")?.addEventListener("click", (e) => { e.preventDefault(); $("#vista").focus(); });
  for (const a of document.querySelectorAll(".idioma a")) a.addEventListener("click", () => { gravarLS("fitrich-idioma", a.dataset.idioma); a.href = a.getAttribute("href") + location.hash; });
  const fab = $("#fab");
  limpar(fab).append(icone("lancar"), h("span", null, t("app.lancar")));
  fab.hidden = false;
  fab.addEventListener("click", () => abrirLancar());
  await abrirArmazem();
  renderAvisos();
  addEventListener("hashchange", rota);
  rota();
  talvezOnboarding().catch((e) => console.error(e));
  $("#rodape").append(h("p", null, icone("cadeado"), t("app.dados_locais")), h("p", null, t("app.aviso_rodape"), " ", h("span", null, t("app.por")), " · ", h("a", { href: IDIOMA === "en" ? "/en/privacy/" : "/privacidade/" }, t("app.privacidade"))));
  iniciarPlataforma();
}

// App instalável: service worker, faixas de atualização/instalação/armazenamento e camada nativa opcional.
// Fora da carga inicial (import dinâmico) e nunca bloqueia nem derruba o app: sem isso ele segue como site.
async function iniciarPlataforma() {
  try {
    const dic = await carregarDicionario("/js/v2/plataforma/plataforma.i18n.mjs");
    if (dic) i18n.somar(dic);
    const { iniciarPlataforma: iniciar } = await import("./v2/plataforma/shell.mjs");
    plat = await iniciar({ t, alvo: $("#avisos-app"), estado: () => estado, hoje });
  } catch (e) { console.error(e); }
}

iniciar().catch((e) => { console.error(e); $("#vista").append(h("p", { class: "aviso atencao", role: "alert" }, t("app.falha_arranque"))); });

// Para o teste de navegador: estado, falhas de tradução e a função de mudar, sem expor nada ao HTML.
globalThis.__fitrich = { estado: () => estado, faltando: () => i18n.faltando(), mudar, navegar, tela: () => idAtual };
