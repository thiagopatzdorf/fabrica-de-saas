// Salvar/abrir o arquivo de dados e mesclar duas cópias: é assim que o Fitrich sincroniza
// entre aparelhos SEM backend. A pessoa guarda o arquivo numa pasta de nuvem que ela já
// tem (Drive, OneDrive, iCloud); cada aparelho abre, mescla e salva. WebRTC e servidor de
// sinalização foram descartados no plano v2: os dois exigem um servidor nosso.
//
// Duas metades:
// 1. `mesclar(a, b)`: pura, sem DOM. Merge por `id` + `atualizadoEm` (último escrito vence,
//    por registro), tombstones em `meta.removidos` ({ id: quandoRemoveu }) para apagar
//    valer em todos os aparelhos. Determinística e comutativa: mesclar(a,b) === mesclar(b,a),
//    e mesclar(a,a) === a (idempotente). Empate de `atualizadoEm` desempata pelo JSON
//    canônico, para o resultado não depender da ordem dos argumentos.
// 2. `salvarArquivo` / `abrirArquivo`: File System Access API quando existe (Chromium
//    desktop; o handle fica guardado para "salvar sempre neste arquivo") e fallback de
//    download + <input type=file> no resto (Firefox, Safari, celular).
import { criarNativo } from "./plataforma/nativo.mjs";


// JSON com chaves ordenadas em TODOS os níveis (o replacer-array do JSON.stringify filtraria
// chaves aninhadas e faria objetos diferentes parecerem iguais, quebrando a comutatividade).
function canonico(v) {
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonico(v[k])}`).join(",")}}`;
  return JSON.stringify(v === undefined ? null : v);
}
const comparar = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
const carimbo = (r) => (typeof r?.atualizadoEm === "string" ? r.atualizadoEm : "");

// Qual dos dois registros do mesmo id vence: o mais novo; em empate, o de JSON canônico maior
// (critério arbitrário, mas igual dos dois lados, logo comutativo).
function maisNovo(x, y) {
  const c = comparar(carimbo(x), carimbo(y));
  if (c !== 0) return c > 0 ? x : y;
  return comparar(canonico(x), canonico(y)) >= 0 ? x : y;
}

function mesclarColecao(la, lb, removidos) {
  const porId = new Map();
  for (const r of [...(Array.isArray(la) ? la : []), ...(Array.isArray(lb) ? lb : [])]) {
    if (!r || typeof r !== "object" || r.id == null) continue;
    const id = String(r.id);
    porId.set(id, porId.has(id) ? maisNovo(porId.get(id), r) : r);
  }
  const out = [];
  for (const [id, r] of porId) {
    // Tombstone vence a edição mais antiga que ele; edição mais nova que o tombstone ressuscita.
    const em = removidos[id];
    if (em != null && comparar(em, carimbo(r)) >= 0) continue;
    out.push(r);
  }
  // Ordem determinística: por id (string), independente da ordem de entrada.
  return out.sort((x, y) => comparar(String(x.id), String(y.id)));
}

function mesclarRemovidos(a, b) {
  const out = {};
  for (const fonte of [a?.meta?.removidos, b?.meta?.removidos]) {
    if (!fonte || typeof fonte !== "object") continue;
    for (const [id, em] of Object.entries(fonte)) if (typeof em === "string" && (out[id] == null || em > out[id])) out[id] = em;
  }
  return Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
}

/** Mescla dois conjuntos de dados do Fitrich (qualquer versão com ids string e atualizadoEm). */
export function mesclar(a, b) {
  const removidos = mesclarRemovidos(a, b);
  // Seções sem id (perfil, orçamento, meta): vence o lado com meta.atualizadoEm mais novo; empate pelo JSON.
  // Seções sem id (perfil, orçamento, versao, chaves de meta): por chave, vence o lado com
  // meta.atualizadoEm mais novo; empate, o valor de JSON canônico maior. É um máximo
  // lexicográfico de (carimbo, valor), ou seja, um reticulado: por isso associa e comuta
  // mesmo encadeando três aparelhos, o que "vence o arquivo mais novo" não garantiria.
  const ta = carimbo(a?.meta), tb = carimbo(b?.meta);
  const escalar = (va, vb) => {
    if (va === undefined) return vb;
    if (vb === undefined) return va;
    const c = comparar(ta, tb) || comparar(canonico(va), canonico(vb));
    return c >= 0 ? va : vb;
  };
  const out = {};
  for (const chave of [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].sort()) {
    if (chave === "meta") continue;
    const va = a?.[chave], vb = b?.[chave];
    out[chave] = Array.isArray(va) || Array.isArray(vb) ? mesclarColecao(va, vb, removidos) : escalar(va, vb);
  }
  const meta = {};
  for (const chave of [...new Set([...Object.keys(a?.meta || {}), ...Object.keys(b?.meta || {})])].sort()) {
    if (chave !== "removidos" && chave !== "atualizadoEm") meta[chave] = escalar(a?.meta?.[chave], b?.meta?.[chave]);
  }
  const atualizadoEm = [ta, tb].sort().pop();
  if (atualizadoEm) meta.atualizadoEm = atualizadoEm;
  // Tombstone de id que nem existe mais em lugar nenhum continua: outro aparelho pode ainda ter o registro.
  out.meta = { ...meta, removidos };
  return out;
}

/** Marca `id` como removido em `dados` (tombstone) e tira o registro da coleção. Puro: devolve cópia. */
export function removerComTombstone(dados, colecao, id, agora) {
  const removidos = { ...(dados.meta?.removidos || {}), [String(id)]: agora };
  return { ...dados, [colecao]: (dados[colecao] || []).filter((r) => String(r.id) !== String(id)),
    meta: { ...(dados.meta || {}), atualizadoEm: agora, removidos } };
}

// ------------------------------------------------------------- arquivo (navegador)
const OPCOES = { suggestedName: "fitrich.json", types: [{ description: "Dados do Fitrich", accept: { "application/json": [".json"] } }] };

export const temFileSystemAccess = (w = globalThis) => typeof w.showSaveFilePicker === "function" && typeof w.showOpenFilePicker === "function";

/** Salva `texto`. Com FSA e um `handle` guardado, grava no mesmo arquivo sem perguntar
 *  (pede permissão se o navegador exigir). Sem FSA, baixa o arquivo. Devolve { handle } para
 *  guardar e reutilizar, ou { handle: null } no fallback. */
export async function salvarArquivo(texto, { handle = null, nome = "fitrich.json", w = globalThis, doc = globalThis.document } = {}) {
  // Casca nativa (Capacitor): `<a download>` não funciona no WebView do iOS; usa a folha de compartilhar do sistema.
  const nativo = criarNativo({ win: w });
  if (nativo.ativo && nativo.tem("Share") && nativo.tem("Filesystem")) {
    const r = await nativo.compartilharArquivo({ nome, texto });
    if (r.ok) return { handle: null };
    if (r.codigo === "nativo.cancelado") throw Object.assign(new Error("compartilhamento cancelado"), { name: "AbortError" });
  }
  if (temFileSystemAccess(w)) {
    let h = handle;
    if (h && (await h.queryPermission?.({ mode: "readwrite" })) === "prompt") {
      if ((await h.requestPermission?.({ mode: "readwrite" })) !== "granted") h = null;
    }
    if (!h) h = await w.showSaveFilePicker({ ...OPCOES, suggestedName: nome });
    const escrita = await h.createWritable();
    await escrita.write(texto);
    await escrita.close();
    return { handle: h };
  }
  const a = doc.createElement("a");
  a.href = URL.createObjectURL(new Blob([texto], { type: "application/json" }));
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return { handle: null };
}

/** Baixa `texto` como arquivo (JSON cifrado, CSV...). No navegador é `<a download>`; na casca nativa o WebView não
 *  baixa blob, então abre a folha de compartilhar do sistema. Nunca lança: a pessoa vê o resultado no próprio app. */
export function baixarTexto(nome, texto, tipo = "application/json", { w = globalThis, doc = globalThis.document } = {}) {
  const nativo = criarNativo({ win: w });
  if (nativo.ativo && nativo.tem("Share") && nativo.tem("Filesystem")) return nativo.compartilharArquivo({ nome, texto }).then(() => undefined);
  const a = doc.createElement("a");
  a.href = URL.createObjectURL(new Blob([texto], { type: tipo }));
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return Promise.resolve();
}

/** Abre um arquivo e devolve { texto, handle }. Sem FSA, abre um <input type=file>. */
export async function abrirArquivo({ w = globalThis, doc = globalThis.document } = {}) {
  if (temFileSystemAccess(w)) {
    const [h] = await w.showOpenFilePicker({ ...OPCOES, multiple: false });
    return { texto: await (await h.getFile()).text(), handle: h };
  }
  return new Promise((resolve, reject) => {
    const i = doc.createElement("input");
    i.type = "file";
    i.accept = "application/json,.json";
    i.addEventListener("change", async () => {
      const f = i.files && i.files[0];
      if (!f) return reject(new Error("nenhum arquivo escolhido"));
      resolve({ texto: await f.text(), handle: null });
    });
    i.click();
  });
}
