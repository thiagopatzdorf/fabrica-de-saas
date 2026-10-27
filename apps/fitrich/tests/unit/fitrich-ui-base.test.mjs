import assert from "node:assert/strict";
import { test } from "node:test";
import { criarFmt } from "../../app/js/v2/ui/fmt.mjs";
import { criarI18n, paridade } from "../../app/js/v2/ui/i18n.mjs";

test("dinheiro: mesmos centavos, vírgula e ponto trocados por idioma, negativo com sinal de menos real", () => {
  const pt = criarFmt("pt-BR"), en = criarFmt("en");
  assert.equal(pt.moeda(123456).replace(/\s/g, " "), "R$ 1.234,56");
  assert.equal(en.moeda(123456), "R$1,234.56");
  assert.equal(pt.moeda(-5).replace(/\s/g, " "), "−R$ 0,05");
  assert.equal(pt.moeda(99900, "BRL", { sinal: true }).replace(/\s/g, " "), "+R$ 999,00");
  assert.match(en.moeda(10000, "USD"), /\$100\.00/);
});

test("data ISO não vira o dia por fuso e sai no formato do idioma", () => {
  assert.equal(criarFmt("pt-BR").data("2026-03-01"), "01/03/2026");
  assert.equal(criarFmt("en").data("2026-03-01"), "03/01/2026");
  assert.equal(criarFmt("pt-BR").dataCurta("2026-12-31"), "31/12");
  assert.equal(criarFmt("pt-BR").mes("2026-10").replace(/\s/g, " "), "out. de 26".replace(".", ""));
});

test("percentual vem de basis points inteiros", () => {
  assert.equal(criarFmt("pt-BR").percentualBp(1365), "13,7%");
  assert.equal(criarFmt("en").percentualBp(-250, 2), "−2.50%");
});

test("t(): placeholders, plural por Intl.PluralRules e chave que falta aparece como [chave] e fica registrada", () => {
  const i = criarI18n({ idioma: "pt-BR", dicionarios: [{ "pt-BR": { "a.oi": "Oi, {nome}", "a.treino.one": "{n} treino", "a.treino.other": "{n} treinos" }, en: { "a.oi": "Hi, {nome}", "a.treino.one": "{n} workout", "a.treino.other": "{n} workouts" } }] });
  assert.equal(i.t("a.oi", { nome: "Ana" }), "Oi, Ana");
  assert.equal(i.t("a.treino", { n: 1 }), "1 treino");
  assert.equal(i.t("a.treino", { n: 3 }), "3 treinos");
  i.definir("en");
  assert.equal(i.t("a.treino", { n: 1 }), "1 workout");
  assert.equal(i.t("nao.existe"), "[nao.existe]");
  assert.deepEqual(i.faltando(), ["en:nao.existe"]);
});

test("paridade: chave sem tradução, placeholder diferente e texto vazio são apanhados", () => {
  assert.deepEqual(paridade({ "pt-BR": { a: "x {n}", b: "y" }, en: { a: "x {n}", b: "y" } }), []);
  const e = paridade({ "pt-BR": { a: "x {n}", b: "y", c: "z" }, en: { a: "x {m}", b: " " } });
  assert.ok(e.includes("placeholders divergem em a"));
  assert.ok(e.includes("en sem c"));
  assert.ok(e.some((x) => x.startsWith("en:b vazio")));
});
