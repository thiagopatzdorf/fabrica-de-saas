// Merge por id + atualizadoEm (js/v2/arquivo.mjs): comutativo, idempotente, tombstone vence edição
// mais antiga. Teste de propriedade com dados aleatórios de semente fixa (mulberry32), reproduzível.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mesclar, removerComTombstone, salvarArquivo, temFileSystemAccess } from "../../app/js/v2/arquivo.mjs";

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const carimbo = (n) => `2026-10-${String(1 + (n % 28)).padStart(2, "0")}T${String(n % 24).padStart(2, "0")}:00:00Z`;

function dadosAleatorios(rnd, n = 12) {
  const lanc = [], removidos = {};
  for (let i = 0; i < n; i++) {
    const id = `id${Math.floor(rnd() * 10)}`;  // ids colidem de propósito (0..9)
    if (rnd() < 0.2) removidos[id] = carimbo(Math.floor(rnd() * 100));
    else lanc.push({ id, centavos: Math.floor(rnd() * 10000), atualizadoEm: carimbo(Math.floor(rnd() * 100)) });
  }
  // dentro de um mesmo conjunto cada id aparece uma vez e nunca junto do próprio tombstone (como num arquivo real)
  const vistos = new Set(), unicos = lanc.filter((l) => !(l.id in removidos) && !vistos.has(l.id) && vistos.add(l.id));
  return { versao: 2, meta: { atualizadoEm: carimbo(Math.floor(rnd() * 100)), removidos }, perfil: { alturaCm: 150 + Math.floor(rnd() * 40) }, lancamentos: unicos };
}

test("propriedade (200 pares, semente 7): mesclar é comutativo, idempotente e associativo", () => {
  const rnd = mulberry32(7);
  for (let i = 0; i < 200; i++) {
    const a = dadosAleatorios(rnd), b = dadosAleatorios(rnd), c = dadosAleatorios(rnd);
    const ab = mesclar(a, b), ba = mesclar(b, a);
    assert.deepEqual(ab, ba, `par ${i} não comuta`);
    assert.deepEqual(mesclar(ab, ab), ab, `par ${i} não é idempotente`);
    assert.deepEqual(mesclar(a, a).lancamentos, [...a.lancamentos].sort((x, y) => (x.id < y.id ? -1 : 1)), `mesclar(a,a) mudou registros em ${i}`);
    assert.deepEqual(mesclar(mesclar(a, b), c), mesclar(a, mesclar(b, c)), `trio ${i} não associa`);
  }
});

test("último escrito vence por registro, não por arquivo", () => {
  const a = { versao: 2, meta: { atualizadoEm: "2026-10-05T10:00:00Z" }, lancamentos: [{ id: "x", centavos: 1, atualizadoEm: "2026-10-05T10:00:00Z" }, { id: "y", centavos: 1, atualizadoEm: "2026-10-01T00:00:00Z" }] };
  const b = { versao: 2, meta: { atualizadoEm: "2026-10-03T00:00:00Z" }, lancamentos: [{ id: "x", centavos: 2, atualizadoEm: "2026-10-02T00:00:00Z" }, { id: "y", centavos: 2, atualizadoEm: "2026-10-03T00:00:00Z" }] };
  const m = mesclar(a, b);
  assert.deepEqual(m.lancamentos.map((l) => [l.id, l.centavos]), [["x", 1], ["y", 2]]);
  assert.equal(m.meta.atualizadoEm, "2026-10-05T10:00:00Z");
});

test("tombstone vence a edição mais antiga que ele e perde para a mais nova (ressuscita)", () => {
  const base = { versao: 2, meta: { atualizadoEm: "2026-10-01T00:00:00Z" }, lancamentos: [{ id: "k", centavos: 5, atualizadoEm: "2026-10-01T00:00:00Z" }, { id: "z", centavos: 9, atualizadoEm: "2026-10-09T00:00:00Z" }] };
  const apagou = removerComTombstone(base, "lancamentos", "k", "2026-10-02T00:00:00Z");
  assert.equal(apagou.lancamentos.some((l) => l.id === "k"), false);
  assert.equal(apagou.meta.removidos.k, "2026-10-02T00:00:00Z");
  const outroAparelho = { ...base, lancamentos: [{ id: "k", centavos: 7, atualizadoEm: "2026-10-01T12:00:00Z" }] };  // editou antes de saber do apagão
  assert.deepEqual(mesclar(apagou, outroAparelho).lancamentos.map((l) => l.id), ["z"], "edição anterior ao tombstone some");
  const reeditado = { ...base, lancamentos: [{ id: "k", centavos: 8, atualizadoEm: "2026-10-03T00:00:00Z" }] };
  assert.deepEqual(mesclar(apagou, reeditado).lancamentos.map((l) => [l.id, l.centavos]), [["k", 8], ["z", 9]], "edição posterior ao tombstone volta");
  // o tombstone de outro aparelho (apagou "z" depois) também é respeitado, e o mais novo dos dois carimbos fica
  const apagouZ = { versao: 2, meta: { atualizadoEm: "2026-10-10T00:00:00Z", removidos: { z: "2026-10-10T00:00:00Z", k: "2026-10-01T00:00:00Z" } }, lancamentos: [] };
  const m = mesclar(apagou, apagouZ);
  assert.deepEqual(m.lancamentos, []);
  assert.deepEqual(m.meta.removidos, { k: "2026-10-02T00:00:00Z", z: "2026-10-10T00:00:00Z" });
});

test("seções sem id (perfil, orçamento) vêm do arquivo com meta.atualizadoEm mais novo", () => {
  const a = { versao: 2, meta: { atualizadoEm: "2026-10-05T00:00:00Z" }, perfil: { alturaCm: 180 }, orcamento: { Mercado: 100 } };
  const b = { versao: 2, meta: { atualizadoEm: "2026-10-04T00:00:00Z" }, perfil: { alturaCm: 170 }, orcamento: { Mercado: 200 }, lancamentos: [] };
  assert.deepEqual(mesclar(a, b).perfil, { alturaCm: 180 });
  assert.deepEqual(mesclar(b, a).orcamento, { Mercado: 100 });
  assert.deepEqual(mesclar(a, b).lancamentos, []);
});

test("sem File System Access, salvar vira download e não exige showSaveFilePicker", async () => {
  assert.equal(temFileSystemAccess({}), false);
  const cliques = [];
  const doc = { createElement: () => ({ click() { cliques.push(this.download); } }) };
  globalThis.URL.createObjectURL ??= () => "blob:x";
  globalThis.URL.revokeObjectURL ??= () => {};
  const r = await salvarArquivo("{}", { w: {}, doc, nome: "fitrich.json" });
  assert.deepEqual([r.handle, cliques], [null, ["fitrich.json"]]);
});

test("com File System Access, o handle guardado é reaproveitado e devolvido", async () => {
  const escritos = [];
  const handle = { queryPermission: async () => "granted", createWritable: async () => ({ write: async (t) => escritos.push(t), close: async () => {} }) };
  const w = { showSaveFilePicker: async () => { throw new Error("não deveria pedir arquivo novo"); }, showOpenFilePicker: async () => [] };
  const r = await salvarArquivo('{"a":1}', { handle, w });
  assert.equal(r.handle, handle);
  assert.deepEqual(escritos, ['{"a":1}']);
});
