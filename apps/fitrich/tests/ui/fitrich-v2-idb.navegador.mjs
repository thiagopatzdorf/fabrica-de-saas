// Prova do adaptador IndexedDB DE VERDADE, num Chromium headless (Playwright), contra a página estática do Fitrich.
// O adaptador em memória cobre a lógica nos testes de unidade; este cobre o que só o navegador tem:
// abrir o banco, criar stores e índices no onupgradeneeded, transação em lote, reler por outra conexão.
//
// Fora do `node --test` de propósito: precisa de Playwright e de um Chromium instalados. Rodar:
//   NODE_PATH=<pasta global do node_modules com playwright> PLAYWRIGHT_BROWSERS_PATH=<pasta dos browsers> \
//     node tests/fitrich-v2-idb.navegador.mjs
// Sai com código 0 e imprime o resultado em JSON; qualquer divergência sai com 1.
import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const FITRICH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "app");
const TIPOS = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };

const PAGINA = `<!doctype html><meta charset="utf-8"><title>teste idb</title><script type="module">
import { CHAVE_V1, MARCADOR_V2, criarAdaptadorIDB, criarArmazem } from "/js/v2/armazem.mjs";
import { adicionar as adicionarV1, exportarJSON as exportarV1, vazio as vazioV1 } from "/js/dados.mjs";
import { adicionar, filtrarLancamentos } from "/js/v2/esquema.mjs";
const agora = () => "2026-10-05T12:00:00.000Z";
window.resultado = (async () => {
  await new Promise((res) => { const r = indexedDB.deleteDatabase("fitrich"); r.onsuccess = r.onerror = r.onblocked = () => res(); });
  localStorage.clear();
  let v1 = vazioV1();
  for (let i = 1; i <= 120; i++) v1 = adicionarV1(v1, "lancamentos", { data: "2026-09-" + String(1 + (i % 28)).padStart(2, "0"), tipo: i % 4 ? "despesa" : "receita", centavos: i * 137, categoria: i % 4 ? "Mercado" : "Salário", descricao: "item " + i });
  v1 = adicionarV1(v1, "pesos", { data: "2026-09-01", kg: 80.5 });
  const textoV1 = exportarV1(v1);
  localStorage.setItem(CHAVE_V1, textoV1);

  const a1 = criarAdaptadorIDB(indexedDB);
  const arm1 = criarArmazem({ adaptador: a1, localStorage, agora, navegador: navigator });
  const mig = await arm1.migrarDaV1();
  const persistiu = await arm1.pedirPersistencia(), est = await arm1.estimativa();
  await a1.fechar();

  // Outra conexão: o que foi gravado tem de voltar igual, sem depender de cache do adaptador anterior.
  const a2 = criarAdaptadorIDB(indexedDB);
  const arm2 = criarArmazem({ adaptador: a2, localStorage, agora });
  const lido = await arm2.carregar();
  const d2 = adicionar(lido, "lancamentos", { data: "2026-10-01", tipo: "despesa", centavos: 999, categoriaId: "cat-lazer", contaId: "v1-conta-1", moeda: "BRL" }, { agora });
  const salvo = await arm2.salvarLote(d2);
  await a2.fechar();

  const a3 = criarAdaptadorIDB(indexedDB);
  const relido = await criarArmazem({ adaptador: a3, localStorage, agora }).carregar();
  const db = await a3.abrir();
  const porIndice = await new Promise((res, rej) => { const r = db.transaction("lancamentos").objectStore("lancamentos").index("data").getAll(IDBKeyRange.bound("2026-10-01", "2026-10-31")); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const indices = [...db.transaction("lancamentos").objectStore("lancamentos").indexNames];
  const stores = [...db.objectStoreNames].sort();
  await a3.fechar();
  return {
    mig: { ok: mig.ok, codigo: mig.codigo, contagens: mig.marcador?.contagens }, persistiu, estimativaTemUso: typeof est?.usoBytes === "number",
    v1Intacta: localStorage.getItem(CHAVE_V1) === textoV1, marcador: JSON.parse(localStorage.getItem(MARCADOR_V2) ?? "null")?.em,
    lidoIgualMigrado: JSON.stringify(lido) === JSON.stringify(mig.dados), salvo,
    relidoLancamentos: relido.lancamentos.length, relidoIgualSalvo: JSON.stringify(relido) === JSON.stringify(d2),
    porIndice: porIndice.map((l) => l.centavos), filtro: filtrarLancamentos(relido, { texto: "ITEM 7" }).length, indices, stores,
  };
})().catch((e) => ({ erro: String(e && e.stack || e) }));
</script>`;

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/_teste-idb.html") { res.writeHead(200, { "content-type": TIPOS[".html"] }); return res.end(PAGINA); }
  try {
    const arq = path.join(FITRICH, path.normalize(url.pathname));
    if (!arq.startsWith(FITRICH)) throw new Error("fora da pasta");
    res.writeHead(200, { "content-type": TIPOS[path.extname(arq)] ?? "application/octet-stream" });
    res.end(await readFile(arq));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${servidor.address().port}`;

const navegador = await chromium.launch();
try {
  const pagina = await navegador.newPage();
  const erros = [];
  pagina.on("pageerror", (e) => erros.push(String(e)));
  await pagina.goto(`${base}/_teste-idb.html`);
  const r = await pagina.evaluate(() => window.resultado);
  console.log(JSON.stringify({ ...r, errosDaPagina: erros, chromium: navegador.version() }, null, 1));
  assert.equal(r.erro, undefined, r.erro);
  assert.deepEqual(erros, []);
  assert.deepEqual(r.mig, { ok: true, codigo: "migracao.feita", contagens: { pesos: 1, medidas: 0, treinos: 0, lancamentos: 120 } });
  assert.equal(r.v1Intacta, true); assert.equal(r.marcador, "2026-10-05T12:00:00.000Z");
  assert.equal(r.lidoIgualMigrado, true, "segunda conexão leu o que a primeira gravou");
  assert.deepEqual(r.salvo, { ok: true });
  assert.equal(r.relidoLancamentos, 121); assert.equal(r.relidoIgualSalvo, true);
  assert.deepEqual(r.porIndice, [999], "índice `data` responde a um intervalo");
  assert.equal(r.filtro, 11, "item 7, 17, 27, …, 70-79 (11 descrições contêm 'item 7')");
  assert.deepEqual(r.indices, ["contaId", "data", "hash", "importacaoId"]);
  assert.equal(r.stores.length, 16);
  assert.equal(r.estimativaTemUso, true);
  console.log("OK: ida e volta no IndexedDB real");
} finally {
  await navegador.close();
  servidor.close();
}
