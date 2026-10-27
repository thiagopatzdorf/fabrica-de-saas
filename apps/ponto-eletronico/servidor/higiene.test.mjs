// Guardas do repositório público: o que não pode voltar a entrar.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
function arquivos(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n === ".git") continue;
    const p = join(dir, n);
    statSync(p).isDirectory() ? arquivos(p, acc) : acc.push(p);
  }
  return acc;
}
const texto = arquivos(RAIZ).filter((p) => ![".bin", ".webp", ".woff2"].includes(extname(p)) && !p.includes("vendor/human.esm.js") && !p.endsWith("higiene.test.mjs"));

test("nenhuma marca, domínio ou infraestrutura privada no código", () => {
  const proibido = /genesis|mybagcenter|factory-01|cofre|vault|pagar\.|wa\.me\/\d|\b10\.158\.|ssh /i;
  const achados = texto.filter((p) => proibido.test(readFileSync(p, "utf8"))).map((p) => p.replace(RAIZ, ""));
  assert.deepEqual(achados.filter((p) => !p.startsWith("README.md")), []);
});

test("sem cobrança embutida: nenhum gancho de pagamento no Worker nem nas telas", () => {
  for (const p of texto.filter((p) => /servidor\/(worker|src)|site\//.test(p))) {
    assert.doesNotMatch(readFileSync(p, "utf8"), /stripe|teste_dias|checkout|cobran[cç]a/i, p);
  }
});

test("pesos dos modelos ficam fora do Git (licença do antispoof não confirmada)", () => {
  const gi = readFileSync(join(RAIZ, ".gitignore"), "utf8");
  assert.match(gi, /site\/app\/modelos\//);
  assert.match(gi, /human\.esm\.js/);
});

test("CSP do app continua fechada em 'self' e a câmera/localização só valem no próprio site", () => {
  const h = readFileSync(join(RAIZ, "site/_headers"), "utf8");
  assert.match(h, /default-src 'none'/);
  assert.match(h, /camera=\(self\), geolocation=\(self\)/);
  assert.doesNotMatch(h, /unsafe-inline|unsafe-eval/);
});
