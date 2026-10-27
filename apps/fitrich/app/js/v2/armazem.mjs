// Armazém da v2: IndexedDB como lugar primário, atrás de um adaptador injetável (o de memória serve
// aos testes e a navegadores sem IDB). O documento inteiro (`esquema.vazio()`) vira uma store por
// coleção mais uma store `meta` com os singletons (versao, meta, perfil, orcamento).
//
// A migração v1→v2 segue o plano à letra: NUNCA escreve na chave v1 do localStorage; grava a v2, relê do
// próprio IDB, confere contagens e somas e só então grava o marcador. Qualquer exceção ou divergência no
// meio deixa a v1 intacta e devolve um código (e o JSON v1, para a pessoa exportar na hora).
import { diasEntre } from "../datas.mjs";
import { COLECOES, agoraPadrao, exportarJSON, ordenar, validar } from "./esquema.mjs";

export const CHAVE_V1 = "fitrich-dados-v1";
export const MARCADOR_V2 = "fitrich-migrado-v2";
export const NOME_BANCO = "fitrich";
// 2: stores novas `bemestar` (Corpo), `refeicoes` (Nutrição) e as do treino (exercicios, rotinas, sessoes, cardio). O upgrade só cria o que falta, nada é apagado.
export const VERSAO_BANCO = 2;
export const DIAS_GUARDA_V1 = 90;
const SINGLETONS = ["versao", "meta", "perfil", "orcamento"];
// Faturas e snapshots não têm `id`: a chave é a identidade natural.
const CHAVE_STORE = { faturas: ["cartaoId", "ym"], snapshots: "ym" };
const INDICES = { lancamentos: ["data", "contaId", "hash", "importacaoId"], pesos: ["data"], medidas: ["data"], treinos: ["data"], bemestar: ["data"], refeicoes: ["data"], sessoes: ["data"], cardio: ["data"] };

export const paraRegistros = (d) => ({ colecoes: Object.fromEntries(COLECOES.map((c) => [c, d[c]])), meta: Object.fromEntries(SINGLETONS.map((k) => [k, d[k]])) });
export function deRegistros(r) {
  if (!r || r.meta?.versao == null) return null;
  const d = { ...r.meta };
  for (const c of COLECOES) d[c] = ordenar(c, r.colecoes?.[c] ?? []);
  return d;
}

// Adaptador em memória: mesma interface do IDB, com gravação "tudo ou nada" simulada.
export function criarAdaptadorMemoria() {
  let dados = null;
  return {
    tipo: "memoria",
    async abrir() {},
    async lerTudo() { return dados ? structuredClone(dados) : null; },
    async gravarTudo(r) { dados = structuredClone(r); },
    async limpar() { dados = null; },
    async fechar() {},
  };
}

const pedido = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
const transacao = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error ?? new Error("abortada")); });

export function criarAdaptadorIDB(indexedDB, { nome = NOME_BANCO, versao = VERSAO_BANCO } = {}) {
  if (!indexedDB) throw new Error("sem indexedDB");
  let db = null;
  const stores = [...COLECOES, "meta"];
  async function abrir() {
    if (db) return db;
    const req = indexedDB.open(nome, versao);
    req.onupgradeneeded = () => {
      const b = req.result;
      for (const c of COLECOES) {
        if (b.objectStoreNames.contains(c)) continue;
        const s = b.createObjectStore(c, { keyPath: CHAVE_STORE[c] ?? "id" });
        for (const ix of INDICES[c] ?? []) s.createIndex(ix, ix, { unique: false });
      }
      if (!b.objectStoreNames.contains("meta")) b.createObjectStore("meta", { keyPath: "chave" });
    };
    db = await pedido(req);
    db.onversionchange = () => { db.close(); db = null; };
    return db;
  }
  return {
    tipo: "idb",
    abrir,
    async lerTudo() {
      const b = await abrir(), tx = b.transaction(stores, "readonly");
      const metaLinhas = await pedido(tx.objectStore("meta").getAll());
      if (!metaLinhas.length) return null;
      const colecoes = {};
      for (const c of COLECOES) colecoes[c] = await pedido(tx.objectStore(c).getAll());
      await transacao(tx);
      return { colecoes, meta: Object.fromEntries(metaLinhas.map((l) => [l.chave, l.valor])) };
    },
    // Uma transação só para tudo: ou o documento inteiro entra, ou nada muda (não existe meio-gravado).
    async gravarTudo(r) {
      const b = await abrir(), tx = b.transaction(stores, "readwrite");
      for (const c of COLECOES) { const s = tx.objectStore(c); s.clear(); for (const x of r.colecoes[c] ?? []) s.put(x); }
      const m = tx.objectStore("meta"); m.clear();
      for (const [chave, valor] of Object.entries(r.meta)) m.put({ chave, valor });
      await transacao(tx);
    },
    async limpar() {
      const b = await abrir(), tx = b.transaction(stores, "readwrite");
      for (const s of stores) tx.objectStore(s).clear();
      await transacao(tx);
    },
    async fechar() { if (db) { db.close(); db = null; } },
  };
}

// Marcador gravado só depois da conferência: { em, contagens } (quando a v1 pode ser apagada sai daqui).
export function v1PodeSerApagada(marcador, hoje) {
  let m = marcador;
  if (typeof m === "string") { try { m = JSON.parse(m); } catch { return false; } }
  if (!m || typeof m.em !== "string") return false;
  const dia = m.em.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dia) && diasEntre(dia, hoje) >= DIAS_GUARDA_V1;
}

export function criarArmazem({ adaptador, localStorage = null, agora = agoraPadrao, navegador = null } = {}) {
  const ls = (f) => { try { return f(); } catch { return null; } };
  const lerLS = (k) => ls(() => localStorage?.getItem(k) ?? null);

  async function carregar() { return deRegistros(await adaptador.lerTudo()); }
  async function salvarLote(d) {
    const v = validar(d);
    if (!v.ok) return { ok: false, erros: v.erros };
    await adaptador.gravarTudo(paraRegistros(d));
    return { ok: true };
  }
  async function exportarTudo() { const d = await carregar(); return d ? exportarJSON(d) : null; }

  // Devolve sempre { ok, codigo, ... }. Em falha, `jsonV1` vem junto para a UI oferecer "baixar meus dados v1".
  async function migrarDaV1() {
    if (lerLS(MARCADOR_V2)) return { ok: true, codigo: "migracao.ja_feita" };
    const textoV1 = lerLS(CHAVE_V1);
    if (!textoV1) return { ok: true, codigo: "migracao.sem_v1" };
    let v1;
    try { v1 = JSON.parse(textoV1); } catch { return { ok: false, codigo: "migracao.v1_ilegivel", jsonV1: textoV1 }; }
    try {
      if (await carregar()) return { ok: false, codigo: "migracao.idb_ja_tem_dados", jsonV1: textoV1 };
      // Só quem tem dados da v1 paga por este módulo (e pelo validador da v1): fora da carga inicial de todo o resto.
      const { conferirMigracao, migrar } = await import("./migracao.mjs");
      const r = migrar(v1, { agora });
      if (!r.ok) return { ok: false, codigo: r.erros[0]?.codigo ?? "migracao.falhou", erros: r.erros, jsonV1: textoV1 };
      await adaptador.gravarTudo(paraRegistros(r.dados));
      const relido = await carregar();
      const conf = conferirMigracao(v1, relido);
      if (!conf.ok) {
        try { await adaptador.limpar(); } catch { /* a v1 segue intacta; a v2 meio-gravada será refeita na próxima abertura */ }
        return { ok: false, codigo: "migracao.divergencia", divergencias: conf.divergencias, jsonV1: textoV1 };
      }
      const marcador = { em: agora(), contagens: Object.fromEntries(["pesos", "medidas", "treinos", "lancamentos"].map((c) => [c, relido[c].length])) };
      const gravou = ls(() => { localStorage.setItem(MARCADOR_V2, JSON.stringify(marcador)); return true; });
      return { ok: true, codigo: gravou ? "migracao.feita" : "migracao.feita_sem_marcador", marcador, dados: relido };
    } catch (e) {
      return { ok: false, codigo: "migracao.gravacao_falhou", detalhe: String(e?.message ?? e), jsonV1: textoV1 };
    }
  }

  function estadoV1(hoje) {
    const marcador = lerLS(MARCADOR_V2), temV1 = !!lerLS(CHAVE_V1);
    return { temV1, migrada: !!marcador, podeApagarV1: temV1 && !!marcador && !!hoje && v1PodeSerApagada(marcador, hoje) };
  }
  // Apagar a v1 é a única escrita destrutiva daqui, e só depois dos 90 dias (a UI pede confirmação antes).
  function apagarV1(hoje) {
    if (!estadoV1(hoje).podeApagarV1) return { ok: false, codigo: "v1.ainda_na_guarda" };
    return ls(() => { localStorage.removeItem(CHAVE_V1); return { ok: true, codigo: "v1.apagada" }; }) ?? { ok: false, codigo: "v1.sem_localstorage" };
  }
  async function pedirPersistencia() {
    try { return typeof navegador?.storage?.persist === "function" ? !!(await navegador.storage.persist()) : null; } catch { return null; }
  }
  async function estimativa() {
    try { if (typeof navegador?.storage?.estimate !== "function") return null; const e = await navegador.storage.estimate(); return { usoBytes: e.usage ?? null, cotaBytes: e.quota ?? null }; } catch { return null; }
  }
  return { carregar, salvarLote, exportarTudo, migrarDaV1, estadoV1, apagarV1, pedirPersistencia, estimativa };
}
