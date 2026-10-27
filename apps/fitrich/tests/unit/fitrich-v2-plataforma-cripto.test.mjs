// Backup cifrado (js/v2/cripto.mjs). Node 18: a WebCrypto vem de node:crypto, injetada.
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { test } from "node:test";
import { ITERACOES_MINIMAS, IV_BYTES, SAL_BYTES, cifrar, decifrar, lerCabecalho } from "../../app/js/v2/cripto.mjs";

const cripto = webcrypto;
const DADOS = JSON.stringify({ versao: 2, lancamentos: [{ id: "a1", centavos: 1250, descricao: "feira ç" }] });

test("round-trip: decifrar(cifrar(x, senha), senha) devolve x byte a byte, com o piso de iterações", async () => {
  const arq = await cifrar(DADOS, "correta", { cripto });
  const cab = lerCabecalho(arq);
  assert.equal(cab.fmt, "fitrich-enc");
  assert.equal(cab.kdf, "pbkdf2-sha256");
  assert.ok(cab.iter >= 600_000 && ITERACOES_MINIMAS >= 600_000, "piso de 600 mil");
  assert.equal(cab.salt.length, SAL_BYTES);
  assert.equal(cab.iv.length, IV_BYTES);
  assert.equal(await decifrar(arq, "correta", { cripto }), DADOS);
});

test("senha errada falha limpa, com a mesma mensagem de arquivo adulterado, e não devolve nada", async () => {
  const arq = await cifrar(DADOS, "correta", { cripto });
  await assert.rejects(decifrar(arq, "errada", { cripto }), { message: "senha incorreta ou arquivo adulterado" });
});

test("arquivo adulterado (um byte do corpo) falha na tag do GCM", async () => {
  const arq = JSON.parse(await cifrar(DADOS, "correta", { cripto }));
  const b = Buffer.from(arq.dados, "base64");
  b[0] ^= 0x01;
  const mexido = JSON.stringify({ ...arq, dados: b.toString("base64") });
  await assert.rejects(decifrar(mexido, "correta", { cripto }), { message: "senha incorreta ou arquivo adulterado" });
});

test("arquivo com iter abaixo do piso é recusado antes de derivar (anti-downgrade)", async () => {
  const arq = JSON.parse(await cifrar(DADOS, "correta", { cripto }));
  const rebaixado = JSON.stringify({ ...arq, iter: 1000 });
  await assert.rejects(decifrar(rebaixado, "correta", { cripto }), /abaixo do piso/);
  await assert.rejects(cifrar(DADOS, "x", { iter: 599_999, cripto }), /abaixo do piso/);
});

test("sal e IV são únicos por cifragem: o mesmo texto com a mesma senha dá arquivos diferentes", async () => {
  const [a, b] = await Promise.all([cifrar(DADOS, "s", { cripto }), cifrar(DADOS, "s", { cripto })]);
  const ca = lerCabecalho(a), cb = lerCabecalho(b);
  assert.notDeepEqual([...ca.salt], [...cb.salt]);
  assert.notDeepEqual([...ca.iv], [...cb.iv]);
  assert.notEqual(JSON.parse(a).dados, JSON.parse(b).dados);
});

test("cabeçalho: formato, versão ou kdf desconhecidos e tamanhos errados são recusados sem senha", () => {
  assert.throws(() => lerCabecalho("{nao json"), /JSON/);
  assert.throws(() => lerCabecalho(JSON.stringify({ fmt: "outro" })), /não é um backup/);
  const base = { fmt: "fitrich-enc", v: 1, kdf: "pbkdf2-sha256", iter: 600_000, salt: Buffer.alloc(16).toString("base64"), iv: Buffer.alloc(12).toString("base64"), dados: Buffer.alloc(16).toString("base64") };
  assert.throws(() => lerCabecalho(JSON.stringify({ ...base, v: 2 })), /versão/);
  assert.throws(() => lerCabecalho(JSON.stringify({ ...base, kdf: "argon2id" })), /kdf/);
  assert.throws(() => lerCabecalho(JSON.stringify({ ...base, salt: Buffer.alloc(8).toString("base64") })), /sal/);
  assert.throws(() => lerCabecalho(JSON.stringify({ ...base, iv: Buffer.alloc(16).toString("base64") })), /IV/);
  assert.throws(() => lerCabecalho(JSON.stringify({ ...base, dados: "" })), /tag/);
  assert.doesNotThrow(() => lerCabecalho(JSON.stringify(base)));
});

test("senha vazia é recusada nos dois sentidos", async () => {
  await assert.rejects(cifrar(DADOS, "", { cripto }), /senha vazia/);
  const arq = await cifrar(DADOS, "s", { cripto });
  await assert.rejects(decifrar(arq, "", { cripto }), /senha vazia/);
});
