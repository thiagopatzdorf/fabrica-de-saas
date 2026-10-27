// App instalável (área app/offline do plano v2): detecção de plataforma, decisão de instalar, aviso honesto de
// armazenamento, ciclo de atualização do service worker, camada nativa opcional e o próprio sw.js rodando num
// ambiente falso. Navegador real (offline de verdade, atualização sem perder dados) está em
// tests/ui/app.navegador.mjs. Cada teste descreve a falha que impede.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { detectarPlataforma } from "../../app/js/v2/plataforma/detectar.mjs";
import { DIAS_SEM_INCOMODAR, decidirInstalacao } from "../../app/js/v2/plataforma/instalar.mjs";
import { avaliarPersistencia, lerPersistencia, pedirPersistencia } from "../../app/js/v2/plataforma/persistencia.mjs";
import { INTERVALO_CHECAGEM_MS, criarPWA } from "../../app/js/v2/plataforma/pwa.mjs";
import { ID_LEMBRETE_DIARIO, criarNativo } from "../../app/js/v2/plataforma/nativo.mjs";
import { salvarArquivo } from "../../app/js/v2/arquivo.mjs";
import { LEMBRETES_PADRAO, bytesLegiveis, lerLembretes } from "../../app/js/v2/ui/telas/aparelho.mjs";
import { paridade } from "../../app/js/v2/ui/i18n.mjs";
import plat from "../../app/js/v2/plataforma/plataforma.i18n.mjs";
import apar from "../../app/js/v2/ui/telas/aparelho.i18n.mjs";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";

// ---------------------------------------------------------------- plataforma e instalação
test("plataforma: iPhone Safari pede instrução manual; Chrome no iOS não é Safari; iPad se diz Mac mas tem toque", () => {
  const p = detectarPlataforma({ ua: IPHONE });
  assert.deepEqual([p.ios, p.safari, p.standalone, p.webkitNaoInstalado], [true, true, false, true]);
  assert.equal(detectarPlataforma({ ua: IPHONE_CHROME }).safari, false);
  assert.equal(detectarPlataforma({ ua: IPHONE_CHROME }).ios, true);
  assert.equal(detectarPlataforma({ ua: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 5 }).ios, true, "iPadOS 13+");
  assert.equal(detectarPlataforma({ ua: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 0 }).ios, false, "Mac de verdade");
  assert.equal(detectarPlataforma({ ua: ANDROID }).android, true);
});

test("plataforma: já aberto como app (tela inicial do iOS, display-mode ou casca nativa) nunca é tratado como navegador", () => {
  for (const extra of [{ standaloneIOS: true }, { displayStandalone: true }, { nativo: true }]) {
    const p = detectarPlataforma({ ua: IPHONE, ...extra });
    assert.equal(p.standalone, true);
    assert.equal(p.webkitNaoInstalado, false, "app na tela inicial é isento do limite de 7 dias do WebKit");
  }
});

test("instalar: sem prompt do navegador o iOS cai na instrução e o Chrome sem evento só ganha a dica na tela do app", () => {
  const base = { hoje: "2026-10-05", registros: 3 };
  assert.deepEqual(decidirInstalacao({ ...base, plataforma: detectarPlataforma({ ua: ANDROID }), promptPronto: true }), { modo: "nativo", motivo: "nativo", mostrarFaixa: true });
  assert.equal(decidirInstalacao({ ...base, plataforma: detectarPlataforma({ ua: IPHONE }) }).modo, "ios");
  const manual = decidirInstalacao({ ...base, plataforma: detectarPlataforma({ ua: ANDROID }) });
  assert.deepEqual([manual.modo, manual.mostrarFaixa], ["manual", false], "sem evento, sem faixa: não promete o que o navegador não entregou");
});

test("instalar: app já instalado nunca recebe faixa de instalação", () => {
  const i = decidirInstalacao({ plataforma: detectarPlataforma({ ua: ANDROID, displayStandalone: true }), promptPronto: true, hoje: "2026-10-05", registros: 9 });
  assert.deepEqual([i.modo, i.mostrarFaixa], ["nenhum", false]);
  assert.equal(decidirInstalacao({ plataforma: detectarPlataforma({ ua: ANDROID }), instalado: true, promptPronto: true, hoje: "2026-10-05", registros: 9 }).modo, "nenhum", "appinstalled");
});

test("instalar: a faixa espera o primeiro registro e some por 30 dias depois de dispensada", () => {
  const plataforma = detectarPlataforma({ ua: ANDROID });
  const f = (o) => decidirInstalacao({ plataforma, promptPronto: true, hoje: "2026-10-31", registros: 1, ...o }).mostrarFaixa;
  assert.equal(f({ registros: 0 }), false, "sem nada a proteger ainda");
  assert.equal(f({}), true);
  assert.equal(f({ dispensadoEm: "2026-10-02" }), false, "29 dias");
  assert.equal(f({ dispensadoEm: "2026-10-01" }), true, `${DIAS_SEM_INCOMODAR} dias: pode voltar a oferecer`);
});

// ---------------------------------------------------------------- armazenamento persistente
test("persistência: recusa do navegador vira aviso com backup, e no iPhone sem instalar o aviso fala dos 7 dias", () => {
  const web = detectarPlataforma({ ua: ANDROID }), ios = detectarPlataforma({ ua: IPHONE });
  assert.deepEqual(avaliarPersistencia({ persistido: true, plataforma: web, registros: 9 }), { codigo: "ok", precisaAviso: false });
  assert.deepEqual(avaliarPersistencia({ persistido: false, plataforma: web, registros: 9 }), { codigo: "nao_concedido", precisaAviso: true });
  assert.equal(avaliarPersistencia({ persistido: false, plataforma: ios, registros: 9 }).codigo, "ios_instale");
  assert.equal(avaliarPersistencia({ persistido: null, suporte: false, plataforma: web, registros: 9 }).codigo, "sem_suporte");
  assert.equal(avaliarPersistencia({ persistido: false, plataforma: web, registros: 0 }).precisaAviso, false, "ninguém é avisado de perder o que não tem");
  assert.equal(avaliarPersistencia({ persistido: true, plataforma: ios, registros: 9 }).codigo, "ok");
});

test("persistência: navegador sem a API ou que lança não derruba a leitura nem o pedido", async () => {
  assert.deepEqual(await lerPersistencia({}), { suporte: false, persistido: null, usoBytes: null, cotaBytes: null });
  const quebrado = { storage: { persist: async () => { throw new Error("x"); }, persisted: async () => { throw new Error("x"); }, estimate: async () => { throw new Error("x"); } } };
  assert.equal(await pedirPersistencia(quebrado), false);
  assert.equal((await lerPersistencia(quebrado)).persistido, null);
  const ok = { storage: { persist: async () => true, persisted: async () => true, estimate: async () => ({ usage: 1000, quota: 5e9 }) } };
  assert.deepEqual(await lerPersistencia(ok), { suporte: true, persistido: true, usoBytes: 1000, cotaBytes: 5e9 });
});

// ---------------------------------------------------------------- ciclo de atualização
function navegadorFalso({ controlador = true } = {}) {
  const ouvintes = {};
  const sw = {
    controller: controlador ? { postMessage() {} } : null,
    addEventListener(t, f) { (ouvintes[t] ??= []).push(f); },
    removeEventListener(t, f) { ouvintes[t] = (ouvintes[t] ?? []).filter((x) => x !== f); },
    emitir(t, e = {}) { for (const f of ouvintes[t] ?? []) f(e); },
  };
  const regOuvintes = {}, enviadas = [];
  const reg = { waiting: null, installing: null, atualizacoes: 0,
    addEventListener(t, f) { (regOuvintes[t] ??= []).push(f); },
    async update() { reg.atualizacoes++; },
    emitir(t) { for (const f of regOuvintes[t] ?? []) f(); } };
  sw.register = async () => reg;
  const doc = { visibilityState: "visible", addEventListener(t, f) { (doc.o ??= {})[t] = f; } };
  const win = { location: { reload() { win.recarregou = (win.recarregou ?? 0) + 1; } } };
  return { nav: { serviceWorker: sw }, sw, reg, doc, win, enviadas };
}

test("atualização: versão nova só vira aviso, nunca troca sozinha; 'Atualizar' manda skipWaiting e recarrega UMA vez", async () => {
  const n = navegadorFalso(); const vistos = [];
  const pwa = criarPWA({ nav: n.nav, win: n.win, doc: n.doc, aoMudar: (e) => vistos.push(e) });
  await pwa.registrar();
  assert.equal(pwa.estado().atualizacaoPronta, false);
  const novo = { state: "installing", addEventListener(t, f) { this.f = f; }, postMessage() {} };
  n.reg.installing = novo; n.reg.emitir("updatefound");
  n.reg.waiting = { postMessage(m) { n.enviadas.push(m); } };
  novo.state = "installed"; novo.f();
  assert.equal(pwa.estado().atualizacaoPronta, true);
  assert.deepEqual(n.enviadas, [], "nada de skipWaiting antes do toque");
  assert.equal(n.win.recarregou, undefined, "nenhum reload surpresa");
  assert.equal(pwa.aplicarAtualizacao(), true);
  assert.deepEqual(n.enviadas, ["skipWaiting"]);
  n.sw.emitir("controllerchange"); n.sw.emitir("controllerchange");
  assert.equal(n.win.recarregou, 1);
});

test("atualização: primeira instalação (worker assume sem controlador anterior) não recarrega a página", async () => {
  const n = navegadorFalso({ controlador: false });
  const pwa = criarPWA({ nav: n.nav, win: n.win, doc: n.doc });
  await pwa.registrar();
  n.sw.emitir("controllerchange");
  assert.equal(n.win.recarregou, undefined);
  assert.equal(pwa.estado().controlado, true);
});

test("atualização: outra aba que aplicou a versão só ganha aviso para recarregar, sem reload que apaga o que se digita", async () => {
  const n = navegadorFalso(); const pwa = criarPWA({ nav: n.nav, win: n.win, doc: n.doc });
  await pwa.registrar();
  n.sw.emitir("controllerchange");
  assert.equal(n.win.recarregou, undefined);
  assert.equal(pwa.estado().recarregarOutraAba, true);
});

test("atualização: checagem automática no máximo a cada hora; 'Verificar agora' ignora o intervalo", async () => {
  const n = navegadorFalso(); let t = 1_000_000;
  const pwa = criarPWA({ nav: n.nav, win: n.win, doc: n.doc, agora: () => t });
  await pwa.registrar();
  await pwa.verificar(); await pwa.verificar();
  assert.equal(n.reg.atualizacoes, 1);
  t += INTERVALO_CHECAGEM_MS + 1; await pwa.verificar();
  assert.equal(n.reg.atualizacoes, 2);
  await pwa.verificar({ forcar: true });
  assert.equal(n.reg.atualizacoes, 3);
});

test("atualização: sem service worker (navegador antigo, casca nativa) o app segue sem erro", async () => {
  const pwa = criarPWA({ nav: {}, win: {}, doc: {} });
  assert.equal(await pwa.registrar(), null);
  assert.equal(pwa.estado().suporte, false);
  assert.equal(pwa.aplicarAtualizacao(), false);
  assert.equal(await pwa.verificar({ forcar: true }), false);
  assert.equal(await pwa.versao(), null);
});

// ---------------------------------------------------------------- camada nativa opcional
test("nativo: no navegador toda função é no-op com código 'indisponível', sem lançar nem pedir permissão", async () => {
  const n = criarNativo({ win: {} });
  assert.equal(n.ativo, false);
  for (const r of [await n.haptico(), await n.lembreteDiario({ hora: 20, titulo: "a", corpo: "b" }), await n.cancelar(1), await n.compartilharArquivo({ nome: "a.json", texto: "{}" })]) {
    assert.deepEqual(r, { ok: false, codigo: "nativo.indisponivel" });
  }
});

function capacitorFalso({ permissao = "granted", falha = null } = {}) {
  const chamadas = [];
  const reg = (nome, metodos) => Object.fromEntries(metodos.map((m) => [m, async (a) => { chamadas.push([nome, m, a]); if (falha === `${nome}.${m}`) throw new Error("Share canceled"); return m === "requestPermissions" ? { display: permissao } : m === "getUri" ? { uri: "file:///cache/fitrich.json" } : {}; }]));
  return { chamadas, win: { Capacitor: { isNativePlatform: () => true, getPlatform: () => "android", Plugins: {
    LocalNotifications: reg("LocalNotifications", ["requestPermissions", "schedule", "cancel"]), Haptics: reg("Haptics", ["impact", "notification"]),
    Filesystem: reg("Filesystem", ["writeFile", "getUri"]), Share: reg("Share", ["share"]) } } } };
}

test("nativo: lembrete diário pede permissão só ao ligar e agenda repetição diária na hora escolhida", async () => {
  const { chamadas, win } = capacitorFalso(); const n = criarNativo({ win });
  assert.equal(chamadas.length, 0, "nada é pedido ao detectar");
  const r = await n.lembreteDiario({ hora: 20, minuto: 30, titulo: "Fitrich", corpo: "Lance os gastos" });
  assert.equal(r.ok, true);
  assert.equal(chamadas[0][1], "requestPermissions");
  assert.deepEqual(chamadas[1][2].notifications[0], { id: ID_LEMBRETE_DIARIO, title: "Fitrich", body: "Lance os gastos", schedule: { on: { hour: 20, minute: 30 }, allowWhileIdle: true } });
});

test("nativo: permissão de notificação negada não agenda nada e devolve o código para a tela explicar", async () => {
  const { chamadas, win } = capacitorFalso({ permissao: "denied" });
  const r = await criarNativo({ win }).lembreteDiario({ hora: 8, titulo: "a", corpo: "b" });
  assert.deepEqual([r.ok, r.codigo], [false, "nativo.permissao_negada"]);
  assert.equal(chamadas.some((c) => c[1] === "schedule"), false);
});

test("nativo: backup no app grava arquivo temporário e abre a folha de compartilhar; cancelar não é erro", async () => {
  const { chamadas, win } = capacitorFalso();
  const r = await salvarArquivo('{"a":1}', { nome: "fitrich.json", w: win, doc: {} });
  assert.deepEqual(r, { handle: null });
  assert.deepEqual(chamadas.map((c) => `${c[0]}.${c[1]}`), ["Filesystem.writeFile", "Filesystem.getUri", "Share.share"]);
  assert.equal(chamadas[0][2].data, '{"a":1}');
  assert.deepEqual(chamadas[2][2].files, ["file:///cache/fitrich.json"]);
  const cancelado = capacitorFalso({ falha: "Share.share" });
  await assert.rejects(salvarArquivo("{}", { w: cancelado.win, doc: {} }), (e) => e.name === "AbortError");
});

// ---------------------------------------------------------------- tela e dicionários
test("dicionários: pt-BR e en da plataforma e da tela App e aparelho têm as mesmas chaves e placeholders", () => {
  assert.deepEqual(paridade(plat), []);
  assert.deepEqual(paridade(apar), []);
});

test("dicionários: toda chave plat.* e aparelho.* usada no código existe no dicionário (nenhum '[chave]' na tela)", () => {
  const dir = new URL("../../app/js/v2/", import.meta.url);
  const ler = (p) => readFileSync(new URL(p, dir), "utf8");
  const codigo = ["plataforma/shell.mjs", "ui/telas/aparelho.mjs"].map(ler).join("\n");
  const todas = { ...plat["pt-BR"], ...apar["pt-BR"] };
  const usadas = [...codigo.matchAll(/["`](aparelho\.[\w.]+|plat\.[\w.]+)(?:["`])/g)].map((m) => m[1]);
  assert.ok(usadas.length > 20);
  for (const k of usadas) assert.ok(k in todas, `chave sem texto: ${k}`);
  // chaves montadas ("plat.persist.${codigo}", "aparelho.instalacao.${modo}"): todas as variantes existem
  for (const c of ["ok", "nao_concedido", "ios_instale", "sem_suporte"]) assert.ok(`plat.persist.${c}` in todas);
  for (const m of ["nativo", "ios", "manual"]) assert.ok(`aparelho.instalacao.${m}` in todas);
});

test("tela: lembrete salvo com lixo ou hora inválida volta ao padrão em vez de quebrar a tela", () => {
  assert.deepEqual(lerLembretes(null), LEMBRETES_PADRAO);
  assert.deepEqual(lerLembretes("{nao json"), LEMBRETES_PADRAO);
  assert.equal(lerLembretes('{"diario":{"ativo":true,"hora":"25:99"}}').diario.hora, "20:00");
  assert.deepEqual(lerLembretes('{"diario":{"ativo":true,"hora":"07:05"},"backup":{"ativo":true}}'), { diario: { ativo: true, hora: "07:05" }, backup: { ativo: true } });
  assert.equal(bytesLegiveis(1536, "en"), "1.5 KB");
  assert.equal(bytesLegiveis(undefined), "?");
});

// ---------------------------------------------------------------- o service worker de verdade, num ambiente falso
const SW_FONTE = readFileSync(new URL("../../app/sw.js", import.meta.url), "utf8");
const ORIGEM = "https://fitrich.test";

function criarAmbienteSW({ rede = {}, offline = false } = {}) {
  const lojas = new Map(); // nome do cache → Map(pathname → Response)
  const chave = (k) => { const u = new URL(typeof k === "string" ? k : k.url, ORIGEM); return u.pathname; };
  const cache = (nome) => {
    if (!lojas.has(nome)) lojas.set(nome, new Map());
    const m = lojas.get(nome);
    return { async match(k) { const r = m.get(chave(k)); return r ? r.clone() : undefined; }, async put(k, r) { m.set(chave(k), r); },
      async addAll(reqs) { for (const q of reqs) { const r = await ambiente.fetch(q); if (!r.ok) throw new Error(`falhou ${q.url}`); m.set(chave(q), r); } } };
  };
  const ouvintes = {};
  class Req extends Request { constructor(u, o) { super(typeof u === "string" ? new URL(u, ORIGEM).href : u, o); } }
  const ambiente = {
    lojas, rede, offline: () => offline, setOffline(v) { offline = v; },
    fetchs: [],
    async fetch(q) { const u = new URL(q.url ?? q, ORIGEM); ambiente.fetchs.push(u.pathname); if (offline) throw new TypeError("offline"); const corpo = rede[u.pathname]; return corpo == null ? new Response("nao", { status: 404 }) : new Response(corpo, { status: 200 }); },
    skipWaitingChamado: 0, claimChamado: 0,
  };
  const self = { location: { origin: ORIGEM }, addEventListener: (t, f) => { ouvintes[t] = f; }, skipWaiting: () => { ambiente.skipWaitingChamado++; }, clients: { claim: async () => { ambiente.claimChamado++; } } };
  const caches = { open: async (n) => cache(n), keys: async () => [...lojas.keys()], delete: async (n) => lojas.delete(n) };
  vm.runInNewContext(SW_FONTE, { self, caches, fetch: (q) => ambiente.fetch(q), Request: Req, Response, URL, console });
  ambiente.ouvir = (tipo) => ouvintes[tipo];
  ambiente.disparar = async (tipo, e) => { let p; ouvintes[tipo]({ ...e, waitUntil: (x) => { p = x; }, respondWith: (x) => { p = x; } }); return p; };
  ambiente.pedir = (caminho) => ambiente.disparar("fetch", { request: new Req(caminho) });
  ambiente.pedirNav = (caminho) => ambiente.disparar("fetch", { request: new Proxy(new Req(caminho), { get: (t, p) => (p === "mode" ? "navigate" : typeof t[p] === "function" ? t[p].bind(t) : t[p]) }) });
  return ambiente;
}
const precache = [...SW_FONTE.matchAll(/^\s+"(\/[^"]*)",?$/gm)].map((m) => m[1]);
const redeCompleta = () => Object.fromEntries(precache.map((p) => [p, `conteudo ${p}`]));

test("sw: instalar baixa TODOS os arquivos do pré-cache (telas inclusas) e NÃO pula a espera sozinho", async () => {
  const a = criarAmbienteSW({ rede: redeCompleta() });
  assert.ok(precache.includes("/js/v2/ui/telas/aparelho.mjs") && precache.includes("/en/") && precache.includes("/"));
  await a.disparar("install", {});
  const nome = [...a.lojas.keys()].find((n) => n.startsWith("fitrich-"));
  assert.equal(a.lojas.get(nome).size, precache.length);
  assert.equal(a.skipWaitingChamado, 0, "versão nova espera o toque em Atualizar");
});

test("sw: um arquivo que falha na instalação derruba a instalação inteira (versão velha segue valendo, cache nunca fica pela metade)", async () => {
  const rede = redeCompleta(); delete rede["/js/app.mjs"];
  const a = criarAmbienteSW({ rede });
  await assert.rejects(a.disparar("install", {}));
});

test("sw: depois de instalado, TODAS as telas e o app abrem sem rede, inclusive /index.html, /en e query string", async () => {
  const a = criarAmbienteSW({ rede: redeCompleta() });
  await a.disparar("install", {});
  a.setOffline(true); a.fetchs.length = 0;
  for (const caminho of ["/js/v2/ui/telas/aparelho.mjs", "/js/v2/ui/telas/hoje.mjs", "/css/hoje.css", "/js/v2/ui/telas/aparelho.i18n.mjs", "/index.html", "/en", "/en/index.html", "/manifest.webmanifest"]) {
    const r = await a.pedir(caminho); assert.ok(r, caminho); assert.equal(r.status, 200, caminho);
  }
  assert.equal((await (await a.pedir("/index.html")).text()), "conteudo /");
  assert.equal((await (await a.pedir("/en")).text()), "conteudo /en/");
  assert.deepEqual(a.fetchs, [], "nenhum pedido de rede para o que está no pré-cache");
});

test("sw: navegação a caminho desconhecido sem rede cai na página do app (no idioma certo), não na tela de erro do navegador", async () => {
  const a = criarAmbienteSW({ rede: redeCompleta() });
  await a.disparar("install", {}); a.setOffline(true);
  assert.equal(await (await a.pedirNav("/qualquer-coisa")).text(), "conteudo /");
  assert.equal(await (await a.pedirNav("/en/qualquer")).text(), "conteudo /en/");
});

test("sw: arquivo fora da lista usa stale-while-revalidate num cache da MESMA versão (nunca mistura versões)", async () => {
  const rede = { ...redeCompleta(), "/extra.json": "v1" };
  const a = criarAmbienteSW({ rede });
  await a.disparar("install", {});
  assert.equal(await (await a.pedir("/extra.json")).text(), "v1");
  rede["/extra.json"] = "v2";
  assert.equal(await (await a.pedir("/extra.json")).text(), "v1", "devolve o guardado e revalida em segundo plano");
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(await (await a.pedir("/extra.json")).text(), "v2");
  const rt = [...a.lojas.keys()].find((n) => n.startsWith("fitrich-rt-"));
  assert.ok(rt && rt.endsWith(SW_FONTE.match(/const CACHE = "fitrich-([0-9a-f]+)"/)[1]), "cache de tempo de execução leva o hash da versão");
});

test("sw: ativar apaga os caches de versões antigas e dos outros tempos de execução, e preserva os da versão atual", async () => {
  const a = criarAmbienteSW({ rede: redeCompleta() });
  await a.disparar("install", {});
  const atual = SW_FONTE.match(/const CACHE = "(fitrich-[0-9a-f]+)"/)[1];
  a.lojas.set("fitrich-000000000000", new Map()); a.lojas.set("fitrich-rt-000000000000", new Map()); a.lojas.set("outro-app", new Map());
  await a.disparar("activate", {});
  assert.deepEqual([...a.lojas.keys()].sort(), [atual, "outro-app"].sort(), "só cache fitrich-* velho morre; cache de outro app não é tocado");
  assert.equal(a.claimChamado, 1);
});

test("sw: só a própria origem e só GET passam pelo worker; skipWaiting só por mensagem da página", async () => {
  const a = criarAmbienteSW({ rede: redeCompleta() });
  await a.disparar("install", {});
  // pedido de outra origem ou POST: o worker não chama respondWith, o navegador segue o caminho normal
  for (const req of [{ url: "https://outro.test/x.js", method: "GET", mode: "cors" }, { url: `${ORIGEM}/api`, method: "POST", mode: "cors" }]) {
    let chamou = false;
    a.ouvir("fetch")({ request: req, respondWith: () => { chamou = true; } });
    assert.equal(chamou, false, req.url);
  }
  await a.disparar("message", { data: "qualquer", source: null });
  assert.equal(a.skipWaitingChamado, 0);
  await a.disparar("message", { data: "skipWaiting" });
  assert.equal(a.skipWaitingChamado, 1);
  let resposta = null;
  await a.disparar("message", { data: "versao", source: { postMessage: (m) => { resposta = m; } } });
  assert.equal(resposta.tipo, "versao");
  assert.equal(resposta.arquivos, precache.length);
});
