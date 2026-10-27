import assert from "node:assert/strict";
import { test } from "node:test";
import { adicionar, definir, exportarCSV, exportarJSON, importarJSON, remover, vazio, validar } from "../../app/js/dados.mjs";
import { escala, esc, graficoBarrasH, graficoColunas, graficoLinha } from "../../app/js/graficos.mjs";

test("adicionar não altera o original, gera ids únicos e mantém por data", () => {
  const a = vazio(), b = adicionar(a, "pesos", { data: "2026-10-05", kg: 80 }), c = adicionar(b, "pesos", { data: "2026-10-01", kg: 81 });
  assert.equal(a.pesos.length, 0);
  assert.deepEqual(c.pesos.map((p) => p.data), ["2026-10-01", "2026-10-05"]);
  assert.notEqual(c.pesos[0].id, c.pesos[1].id);
  assert.equal(remover(c, "pesos", c.pesos[0].id).pesos.length, 1);
});

test("exportar e importar devolve exatamente os mesmos dados", () => {
  let d = adicionar(vazio(), "lancamentos", { data: "2026-10-02", tipo: "despesa", centavos: 1250, categoria: "Mercado", descricao: "feira" });
  d = adicionar(d, "treinos", { data: "2026-10-03", tipo: "Corrida", minutos: 30, esforco: 3 });
  const r = importarJSON(exportarJSON(d));
  assert.ok(r.ok, JSON.stringify(r));
  assert.deepEqual(r.dados, d);
});

test("importar recusa JSON quebrado, versão desconhecida e item inválido sem aplicar nada", () => {
  assert.equal(importarJSON("{não é json").ok, false);
  assert.equal(importarJSON(JSON.stringify({ versao: 99 })).ok, false);
  const ruim = { ...vazio(), pesos: [{ id: 1, data: "2026-02-31", kg: 80 }] };
  assert.equal(importarJSON(JSON.stringify(ruim)).ok, false);
  const negativo = { ...vazio(), lancamentos: [{ id: 1, data: "2026-10-01", tipo: "despesa", centavos: -5, categoria: "Mercado", descricao: "" }] };
  assert.equal(importarJSON(JSON.stringify(negativo)).ok, false);
  assert.equal(validar(vazio()).ok, true);
});

test("CSV usa ponto e vírgula e vírgula decimal, e protege texto com aspas e fórmula", () => {
  const d = adicionar(vazio(), "lancamentos", { data: "2026-10-02", tipo: "despesa", centavos: 1250, categoria: "Mercado", descricao: '=SOMA(A1); "x"' });
  const csv = exportarCSV(d.lancamentos);
  assert.match(csv, /12,50/);
  assert.ok(csv.includes("\"'=SOMA"), "fórmula não pode abrir a célula");
  assert.ok(csv.split("\n")[0].includes(";"));
});

test("escala escolhe marcas redondas e aguenta série constante", () => {
  const e = escala(0, 87);
  assert.deepEqual(e.marcas, [0, 25, 50, 75, 100]);
  const c = escala(80, 80);
  assert.ok(c.max > c.min);
});

test("gráficos escapam texto do usuário e nunca saem vazios de título", () => {
  assert.equal(esc('<img onerror="x">'), "&lt;img onerror=&quot;x&quot;&gt;");
  const s = graficoBarrasH({ itens: [{ rotulo: "<b>", valor: 10, tip: '"><script>' }], titulo: "T", desc: "D" });
  assert.ok(!s.includes("<b>") && !s.includes("<script>"));
  const l = graficoLinha({ pontos: [{ x: 1, y: 80, tip: "a" }], titulo: "peso", desc: "d" });
  assert.match(l, /<title id="t">peso<\/title>/);
  assert.ok(graficoLinha({ pontos: [], titulo: "p", desc: "d" }).includes("</svg>"));
  const k = graficoColunas({ grupos: [{ rotulo: "out", valores: [0, 0], tip: "" }], series: [{ classe: "s1" }, { classe: "s2" }], titulo: "t", desc: "d" });
  assert.ok(!/<path class="s1"/.test(k), "valor zero não desenha coluna");
});
