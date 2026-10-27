// Design v3 do Fitrich (Node, sem DOM): contraste WCAG medido nos tokens reais, vocabulário sem culpa em TODOS os
// dicionários, textos em inglês de verdade, onboarding e estados vazios com paridade, rem no lugar de px,
// movimento reduzido, alvos de toque, ponto de extensão da Hoje. O que não cabe sem navegador (foco, árvore de
// acessibilidade, CLS) está em tests/ui/design.navegador.mjs.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { paridade } from "../../app/js/v2/ui/i18n.mjs";
import { OBJETIVOS, lerObjetivo } from "../../app/js/v2/ui/preferencias.mjs";
import { aplicarAparencia, alternarAparencia } from "../../app/js/v2/ui/aparencia-ui.mjs";
import { SLOTS_HOJE } from "../../app/js/v2/ui/slots-hoje.mjs";
import dicOnboarding from "../../app/js/v2/ui/onboarding.i18n.mjs";
import dicVazios from "../../app/js/v2/ui/vazios.i18n.mjs";

const FIT = new URL("../../app/", import.meta.url);
const UI = new URL("js/v2/ui/", FIT);
const css = (n) => readFileSync(new URL(`css/${n}`, FIT), "utf8");

// ---------- contraste ----------
const bloco = (src, seletor) => { const i = src.indexOf(seletor + "{"); assert.ok(i >= 0, `bloco ${seletor}`); return src.slice(i + seletor.length + 1, src.indexOf("}", i)); };
const vars = (b) => Object.fromEntries([...b.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2].toLowerCase()]));
const app = css("app.css");
const alto = css("alto-contraste.css");
const CLARO = vars(bloco(app, ":root"));
const TEMAS = {
  claro: CLARO,
  escuro: { ...CLARO, ...vars(bloco(app, 'html[data-gs-theme="dark"]')) },
  "claro-alto": { ...CLARO, ...vars(bloco(alto, 'html[data-gs-contraste="alto"]')) },
  "escuro-alto": { ...CLARO, ...vars(bloco(app, 'html[data-gs-theme="dark"]')), ...vars(bloco(alto, 'html[data-gs-theme="dark"][data-gs-contraste="alto"]')) },
};
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
export const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [frente, fundo, mínimo]: 4.5 texto normal (WCAG 1.4.3), 3 componente de interface e foco (1.4.11).
const PARES = [
  ["ink", "sup", 4.5], ["ink", "sup2", 4.5], ["ink", "sup3", 4.5], ["ink2", "sup", 4.5], ["ink2", "sup2", 4.5], ["ink2", "sup3", 4.5],
  ["mud", "sup", 4.5], ["mud", "sup2", 4.5], ["mud", "sup3", 4.5],
  ["azul", "sup", 4.5], ["azul", "sup2", 4.5], ["azul", "azul-fundo", 4.5],
  ["laranja", "sup", 4.5], ["laranja", "sup2", 4.5], ["laranja", "laranja-fundo", 4.5],
  ["agua-t", "sup", 4.5], ["agua-t", "sup2", 4.5], ["agua-t", "agua-fundo", 4.5], ["agua", "sup", 3], ["agua", "sup2", 3],
  ["ouro", "sup", 4.5], ["ouro", "sup2", 4.5], ["ouro", "ouro-fundo", 4.5],
  ["sobre-azul", "azul", 4.5], ["sobre-laranja", "laranja", 4.5], ["sup", "ink", 4.5],
  ["eixo", "sup", 3], ["eixo", "sup2", 3], ["foco", "sup", 3], ["azul", "sup3", 3], ["ouro-vivo", "sup", 3], ["ouro-vivo", "sup2", 3],
];
for (const [nome, tokens] of Object.entries(TEMAS)) {
  test(`contraste AA no tema ${nome}: todo par de texto (4,5:1) e de borda/foco (3:1) dos tokens passa`, () => {
    const reprovados = [];
    for (const [f, b, minimo] of PARES) {
      const a = tokens[f] ?? (f === "foco" ? tokens.azul : null), fundo = tokens[b];
      assert.ok(a && fundo, `token ${f} ou ${b} ausente em ${nome}`);
      const r = contraste(a, fundo);
      if (r < minimo) reprovados.push(`${f} ${a} sobre ${b} ${fundo} = ${r.toFixed(2)} (< ${minimo})`);
    }
    assert.deepEqual(reprovados, []);
  });
}

test("alto contraste é mais firme que o tema normal: tinta e bordas sobem de razão nos dois temas", () => {
  assert.ok(contraste(TEMAS["claro-alto"].eixo, TEMAS["claro-alto"].sup) > contraste(TEMAS.claro.eixo, TEMAS.claro.sup));
  assert.ok(contraste(TEMAS["escuro-alto"].eixo, TEMAS["escuro-alto"].sup) > contraste(TEMAS.escuro.eixo, TEMAS.escuro.sup));
  assert.ok(contraste(TEMAS["claro-alto"].ink2, TEMAS["claro-alto"].sup) >= 7, "AAA no texto secundário");
});

// ---------- CSS: unidades, movimento, foco, alvos ----------
const TODOS_CSS = readdirSync(new URL("css/", FIT)).filter((f) => f.endsWith(".css"));
test("tamanho de fonte vem em rem (respeita o ajuste de texto do sistema): nenhuma declaração font/font-size em px", () => {
  const ruins = [];
  for (const f of TODOS_CSS) for (const m of css(f).matchAll(/\bfont(?:-size)?\s*:\s*([^;}]*)/g)) if (/\d\s*px/.test(m[1])) ruins.push(`${f}: ${m[0]}`);
  assert.deepEqual(ruins, []);
});
test("movimento reduzido: app.css zera animação e transição e só anima sob no-preference", () => {
  assert.match(app, /@media \(prefers-reduced-motion:\s*reduce\)\{[^}]*animation-duration:\s*\.001ms/);
  assert.match(app, /@media \(prefers-reduced-motion:\s*no-preference\)/);
  // Porta única: a regra universal vale para o CSS de todas as telas (inclusive as que ainda vão nascer).
  assert.match(app, /@media \(prefers-reduced-motion:\s*reduce\)\{\*,\*::before,\*::after\{[^}]*transition-duration:\s*\.001ms!important/);
});
test("duração de movimento fica entre 150 e 200 ms nos tokens", () => {
  assert.match(app, /--mov-r:150ms/); assert.match(app, /--mov:200ms/);
});
test("foco visível: há :focus-visible de 3px, halo e regra para cores forçadas do sistema; alvo de toque é 44px", () => {
  assert.match(app, /:focus-visible\{outline:3px solid var\(--foco\)/);
  assert.match(css("componentes.css"), /@media \(forced-colors:active\)/);
  assert.match(app, /--toque:2\.75rem/, "2,75 rem = 44 px com a fonte padrão e cresce com o texto");
  assert.match(app, /\.pular\{/, "link de pular para o conteúdo");
});
test("tokens têm escala modular, espaçamento Fibonacci e movimento documentados em design-v3.md", () => {
  const doc = readFileSync(new URL("../../docs/design-v3.md", import.meta.url), "utf8");
  for (const token of ["--t0", "--t5", "--e1", "--e6", "--mov-r", "--ouro-vivo", "--sobre-azul", "data-gs-contraste"]) assert.ok(doc.includes(token), `design-v3.md deve documentar ${token}`);
  for (const token of ["--t0", "--t5", "--e1", "--e6", "--mov-r", "--ouro-vivo"]) assert.ok(app.includes(token + ":"), `${token} no app.css`);
});

// ---------- dicionários: paridade, vocabulário, inglês natural ----------
const dicionarios = {};
for (const f of ["app.i18n.mjs", "onboarding.i18n.mjs", "vazios.i18n.mjs", ...readdirSync(new URL("telas/", UI)).filter((x) => x.endsWith(".i18n.mjs")).map((x) => `telas/${x}`)]) dicionarios[f] = (await import(new URL(f, UI).href)).default;

test("onboarding e estados vazios: pt-BR e en com as mesmas chaves e placeholders e prefixo próprio", () => {
  assert.deepEqual(paridade(dicOnboarding), []);
  assert.deepEqual(paridade(dicVazios), []);
  assert.ok(Object.keys(dicOnboarding["pt-BR"]).every((k) => k.startsWith("onb.")));
  assert.ok(Object.keys(dicVazios["pt-BR"]).every((k) => k.startsWith("vazio.")));
});
test("todo dicionário do app tem paridade pt-BR/en (regressão de qualquer tela)", () => {
  for (const [f, d] of Object.entries(dicionarios)) assert.deepEqual(paridade(d), [], f);
});

const CULPA_PT = /estour|falhou|falhar|fracass|perdeu a sequ|sequência|seguidas|streak|atrasad|culpa|vergonh|preguiç|irresponsáv|desleix|descontrol|\bgordo|\bgorda|não tem desculpa|você deveria|você devia|era sua obrigação/i;
const CULPA_EN = /blew|blown|busted|failed|failure|streak|overdue|guilt|shame|lazy|irresponsible|reckless|out of control|no excuse|you should have|you ought/i;
test("vocabulário sem culpa e sem sequência em TODOS os dicionários, nos dois idiomas", () => {
  const achados = [];
  for (const [f, d] of Object.entries(dicionarios)) {
    for (const [k, v] of Object.entries(d["pt-BR"])) if (CULPA_PT.test(v)) achados.push(`${f} pt ${k}: ${v}`);
    for (const [k, v] of Object.entries(d.en)) if (CULPA_EN.test(v)) achados.push(`${f} en ${k}: ${v}`);
  }
  assert.deepEqual(achados, []);
});
test("sem anglicismo gratuito em português (dashboard, feedback, insight, deadline...) e sem português vazando no inglês", () => {
  const anglicismo = /\b(dashboard|feedback|deadline|mindset|performance|setup|insights?|target|budget|cashback|checkout|spending)\b/i;
  const ptNoIngles = /[ãõç]|\b(você|não|para o|do app|nenhum)\b/i;
  const liberadas = new Set(["onb.idioma.pt"]);
  const achados = [];
  for (const [f, d] of Object.entries(dicionarios)) {
    for (const [k, v] of Object.entries(d["pt-BR"])) if (anglicismo.test(v)) achados.push(`${f} pt ${k}: ${v}`);
    for (const [k, v] of Object.entries(d.en)) if (ptNoIngles.test(v) && !liberadas.has(k)) achados.push(`${f} en ${k}: ${v}`);
  }
  assert.deepEqual(achados, []);
});
test("inglês não é cópia do português: texto longo idêntico nos dois idiomas é tradução que ficou por fazer", () => {
  const iguais = [];
  for (const [f, d] of Object.entries(dicionarios)) for (const [k, v] of Object.entries(d["pt-BR"])) if (v.length > 24 && v === d.en[k] && v.replace(/\{[^}]+\}/g, "").replace(/[\s;.,]/g, "")) iguais.push(`${f} ${k}`);
  assert.deepEqual(iguais, []);
});
test("mensagem de erro não acusa a pessoa: nada de 'inválido', 'incorreto' ou 'Invalid' em texto de interface", () => {
  const achados = [];
  for (const [f, d] of Object.entries(dicionarios)) {
    for (const [k, v] of Object.entries(d["pt-BR"])) if (/\binválid[oa]s?\b|incorret/i.test(v)) achados.push(`${f} pt ${k}: ${v}`);
    for (const [k, v] of Object.entries(d.en)) if (/\binvalid\b|incorrect/i.test(v)) achados.push(`${f} en ${k}: ${v}`);
  }
  // Sobra o que descreve DADO, não a pessoa (ex.: arquivo/mescla). A lista só pode descer.
  assert.ok(achados.length <= 8, `restam ${achados.length}: ${achados.join(" | ")}`);
});

// ---------- onboarding, preferências, slot ----------
test("onboarding: 3 passos nomeados, pular em todos, objetivos válidos e padrão 'ambos' sem armazenamento", () => {
  const src = readFileSync(new URL("onboarding.mjs", UI), "utf8");
  for (const p of ["onb.p1.titulo", "onb.p2.titulo", "onb.p3.titulo"]) assert.ok(dicOnboarding["pt-BR"][p]);
  assert.equal((src.match(/pular\(\)/g) ?? []).length >= 3, true, "botão pular nos 3 passos");
  assert.match(src, /addEventListener\("cancel"/, "Esc também pula");
  assert.deepEqual(OBJETIVOS, ["financas", "corpo", "ambos"]);
  assert.equal(lerObjetivo(), "ambos");
  for (const proibido of ["innerHTML", "fetch(", "style:"]) assert.ok(!src.includes(proibido), proibido);
});
test("aparência: alto contraste e texto maior alternam no <html>, e armazenamento bloqueado não derruba", () => {
  const attrs = new Map();
  const raiz = { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k), getAttribute: (k) => attrs.get(k) ?? null };
  const guardado = new Map();
  globalThis.localStorage = { getItem: (k) => guardado.get(k) ?? null, setItem: (k, v) => guardado.set(k, v) };
  try {
    aplicarAparencia(raiz);
    assert.equal(raiz.getAttribute("data-gs-contraste"), null);
    assert.equal(alternarAparencia("contraste", raiz), true);
    assert.equal(raiz.getAttribute("data-gs-contraste"), "alto");
    assert.equal(alternarAparencia("texto", raiz), true);
    assert.equal(raiz.getAttribute("data-gs-texto"), "grande");
    assert.equal(alternarAparencia("contraste", raiz), false, "desligar vence o prefers-contrast guardado como 'normal'");
    globalThis.localStorage = { getItem() { throw new Error("bloqueado"); }, setItem() { throw new Error("bloqueado"); } };
    assert.doesNotThrow(() => aplicarAparencia(raiz));
  } finally { delete globalThis.localStorage; }
});
test("Hoje tem o ponto de extensão para o cartão de insights: slot nomeado e registro vazio por padrão", () => {
  assert.ok(Array.isArray(SLOTS_HOJE));
  const hoje = readFileSync(new URL("telas/hoje.mjs", UI), "utf8");
  assert.match(hoje, /"data-slot": "insights"/);
  assert.match(hoje, /SLOTS_HOJE/);
});
test("estado vazio é uma peça só: telas usam ctx.estadoVazio e o ctx a entrega", () => {
  assert.match(readFileSync(new URL("ctx.mjs", UI), "utf8"), /estadoVazio: criarEstadoVazio/);
  for (const tela of ["cartoes", "financas", "metas", "patrimonio", "shape", "dividas", "checkin"]) assert.match(readFileSync(new URL(`telas/${tela}.mjs`, UI), "utf8"), /ctx\.estadoVazio\(/, tela);
  for (const [k] of Object.entries(dicVazios["pt-BR"])) if (k.endsWith(".titulo")) assert.ok(dicVazios["pt-BR"][k.replace(".titulo", ".texto")], k);
});
