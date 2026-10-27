import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const site = (f) => readFileSync(new URL(`./site/${f}`, import.meta.url), "utf8");
const paginas = readdirSync(new URL("./site/", import.meta.url)).filter((f) => f.endsWith(".html"));

test("todo id que o loja.js procura existe no index.html (id removido derruba a vitrine inteira com TypeError)", () => {
  const ids = [...site("loja.js").matchAll(/\$\("#([\w-]+)"\)/g)].map((m) => m[1]);
  assert.ok(ids.length > 5);
  const html = site("index.html");
  for (const id of new Set(ids)) assert.match(html, new RegExp(`id="${id}"`), `#${id} sumiu do index.html`);
});

test("página com style inline ou script inline é barrada pela CSP e quebra só em produção", () => {
  for (const f of paginas) {
    const html = site(f);
    assert.doesNotMatch(html, /\sstyle=/, `${f} tem style inline`);
    assert.doesNotMatch(html, /<style[\s>]/, `${f} tem <style>`);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/, `${f} tem script inline`);
  }
});

test("a vitrine mostra no máximo uma página de produtos por vez (centenas de cartões de uma vez travam o celular)", () => {
  assert.match(site("loja.js"), /const PAGINA = \d+;/);
  assert.match(site("loja.js"), /lista\.slice\(0, visiveis\)/);
});

test("o guia de agentes descreve só rotas que o Worker serve", () => {
  const worker = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
  for (const rota of ["/api/agente", "/api/agente/catalogo", "/api/agente/pedidos"]) {
    assert.ok(worker.includes(`"${rota}"`), `${rota} não existe no worker`);
    assert.ok(site("agentes.html").includes(rota), `${rota} sumiu do guia`);
  }
  assert.ok(worker.includes("/api/pedido/"));
});
