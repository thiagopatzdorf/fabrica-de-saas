// Venda inteira no Chromium: sobe o serve.mjs, roda tests/e2e.mjs e confere os números.
// Pula (skip) se o Playwright não estiver instalado: npm i -D playwright && npx playwright install chromium
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const aqui = (p) => fileURLToPath(new URL(p, import.meta.url));
let temPlaywright = true;
try { createRequire(import.meta.url)(process.env.PLAYWRIGHT || "playwright"); } catch { temPlaywright = false; }

test("venda inteira no navegador fecha com troco, cupom, caixa e persistência errados", { skip: !temPlaywright && "playwright não instalado" }, async () => {
  const porta = 18000 + Math.floor(Math.random() * 1000);
  const srv = spawn(process.execPath, [aqui("../serve.mjs"), String(porta)], { stdio: "ignore" });
  try {
    await new Promise((r) => setTimeout(r, 600));
    const { stdout } = await promisify(execFile)(process.execPath, [aqui("./e2e.mjs"), `http://127.0.0.1:${porta}`], { maxBuffer: 1e7 });
    const saida = JSON.parse(stdout);
    for (const largura of ["1440", "390"]) {
      const r = saida[largura];
      assert.deepEqual(r.erros, [], `erro de console/CSP/rede em ${largura}px`);
      assert.equal(r.pdvRolagem, 0, `rolagem lateral em ${largura}px`);
      assert.equal(r.mesas, 12);
      assert.match(r.semCaixa, /Abra o caixa/, "recebeu sem caixa aberto");
      assert.equal(r.totalMesa, "R$ 155,76");
      assert.match(r.pixAcima, /não existe troco/, "Pix acima do total aceito");
      assert.equal(r.troco, "R$ 4,24");
      assert.match(r.cupom, /SEM VALOR FISCAL/, "prévia da NFC-e sem o aviso de que não tem valor fiscal");
      assert.match(r.cupom, /não foi enviada à SEFAZ/);
      assert.equal(r.mesaLivre, "livre");
      assert.equal(r.kds.length, 2, "cozinha não recebeu os dois itens");
      assert.equal(r.gaveta, "R$ 255,76");
      assert.match(r.fechado, /Diferença\s*R\$ 0,00/);
      assert.match(r.depoisDeRecarregar, /R\$ 155,76/, "venda sumiu ao recarregar a página");
    }
  } finally {
    srv.kill();
  }
});
