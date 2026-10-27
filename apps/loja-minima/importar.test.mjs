import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lerCsv, reaisParaCentavos, paraProduto, montarCatalogo, lerEntrada, idSeguro } from "./importar.mjs";
import { paraVitrine, validarProduto } from "./src/catalogo.js";

test("preço em reais vira centavos inteiros sem erro de ponto flutuante", () => {
  assert.equal(reaisParaCentavos("19,90"), 1990);
  assert.equal(reaisParaCentavos(19.9), 1990);
  assert.equal(reaisParaCentavos("0,29"), 29);
  assert.equal(reaisParaCentavos("R$ 1.299,90"), 129990);
  assert.equal(reaisParaCentavos("1,299.90"), 129990);
  assert.equal(reaisParaCentavos("12"), 1200);
});

test("preço ilegível vira null em vez de virar R$ 0 em silêncio", () => {
  for (const v of ["", "abc", "-5", "1,2,3x", undefined, null]) assert.equal(reaisParaCentavos(v), null, String(v));
});

test("CSV com aspas, vírgula dentro do campo, aspas escapadas e ponto e vírgula como separador", () => {
  const [a] = lerCsv('id,nome,descricao\nx,"Caneca, grande","diz ""oi"""\n');
  assert.deepEqual(a, { id: "x", nome: "Caneca, grande", descricao: 'diz "oi"' });
  const [b] = lerCsv("id;nome;preco\r\ny;Boné;44,90\r\n");
  assert.deepEqual(b, { id: "y", nome: "Boné", preco: "44,90" });
});

test("o catálogo de exemplo em CSV e o JSON de exemplo descrevem os mesmos produtos válidos", () => {
  const csv = montarCatalogo(lerEntrada("x.csv", readFileSync(new URL("./exemplo/produtos.csv", import.meta.url), "utf8")).map(paraProduto));
  const json = JSON.parse(readFileSync(new URL("./exemplo/catalogo.json", import.meta.url), "utf8"));
  assert.deepEqual(csv.recusados, {});
  assert.equal(Object.keys(csv.catalogo).length, 8);
  assert.deepEqual(csv.catalogo, json);
});

test("produto abaixo de R$ 1,00 ou sem preço é recusado e contado, não importado em silêncio", () => {
  const { catalogo, recusados } = montarCatalogo([
    { nome: "Bom", preco: "10,00" }, { nome: "Barato", preco: "0,50" }, { nome: "Sem preço", preco: "" },
  ].map(paraProduto));
  assert.deepEqual(Object.keys(catalogo), ["bom"]);
  assert.equal(Object.values(recusados).reduce((a, b) => a + b, 0), 2);
});

test("dois produtos com o mesmo id: o segundo é recusado, não sobrescreve o primeiro", () => {
  const { catalogo, recusados } = montarCatalogo([{ id: "a", nome: "Um", preco: "5" }, { id: "a", nome: "Dois", preco: "6" }].map(paraProduto));
  assert.equal(catalogo.a.nome, "Um");
  assert.equal(recusados["id repetido"], 1);
});

test("id é derivado do nome sem acento e nunca passa de 48 caracteres nem termina em traço", () => {
  assert.equal(idSeguro("Camiseta Básica P/M"), "camiseta-basica-p-m");
  const id = idSeguro("a".repeat(47) + " bbb");
  assert.ok(id.length <= 48 && !id.endsWith("-"));
});

test("JSON como lista ou como objeto id -> produto entram do mesmo jeito", () => {
  const p = { id: "x", nome: "X", preco: 10 };
  assert.deepEqual(lerEntrada("a.json", JSON.stringify([p])), lerEntrada("a.json", JSON.stringify({ x: p })));
});

test("foto com endereço http inseguro ou caminho '//outro-site' é recusada; caminho do próprio site vale", () => {
  const base = { id: "x", nome: "X", preco: 1000 };
  assert.ok(validarProduto({ ...base, fotos: ["http://inseguro.test/a.jpg"] }).erro);
  assert.ok(validarProduto({ ...base, fotos: ["//outro.test/a.jpg"] }).erro);
  assert.ok(validarProduto({ ...base, fotos: ["/img/../segredo.svg"] }).erro);
  assert.deepEqual(validarProduto({ ...base, fotos: ["/img/a.svg", "https://cdn.exemplo.test/b.jpg"] }).ok.fotos, ["/img/a.svg", "https://cdn.exemplo.test/b.jpg"]);
});

test("a vitrine pública não mostra o número exato do estoque", () => {
  const v = paraVitrine(validarProduto({ id: "x", nome: "X", preco: 1000, estoque: 4 }).ok);
  assert.equal(v.estoque, undefined);
  assert.equal(v.disponivel, true);
});

test("a fileira de categorias rola de lado no celular em vez de ocupar a tela inteira", () => {
  const css = readFileSync(new URL("./site/estilo.css", import.meta.url), "utf8");
  assert.match(css, /\.chips\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(css, /\.chips\s*\{[^}]*flex-wrap:\s*nowrap/);
});
