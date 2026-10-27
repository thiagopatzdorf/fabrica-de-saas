// Regras duras da tela Treino (contrato de UI do Fitrich v2), em Node 18 sem DOM: paridade pt-BR/en do
// dicionário, nenhuma chave usada sem tradução, nenhuma palavra de culpa, DOM só por h()/hs() (sem innerHTML,
// style, rede) e registro da tela no índice. O comportamento em navegador está em tests/ui/treino.navegador.mjs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { paridade } from "../../app/js/v2/ui/i18n.mjs";
import dic from "../../app/js/v2/ui/telas/treino.i18n.mjs";
import appDic from "../../app/js/v2/ui/app.i18n.mjs";
import { TELAS } from "../../app/js/v2/ui/telas/indice.mjs";
import { CATALOGO, GRUPOS, EQUIPAMENTOS, PADROES, MODALIDADES } from "../../app/js/v2/treino/catalogo.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const TELAS_DIR = join(AQUI, "..", "..", "app", "js", "v2", "ui", "telas");
const ARQUIVOS = [join(TELAS_DIR, "treino.mjs"), ...readdirSync(join(TELAS_DIR, "treino")).map((f) => join(TELAS_DIR, "treino", f))];

test("dicionário do treino sem paridade pt-BR/en ou com chave fora do prefixo treino.", () => {
  assert.deepEqual(paridade(dic), []);
  for (const k of Object.keys(dic["pt-BR"])) assert.ok(k.startsWith("treino."), k);
});
test("o shell não conhece o nome da tela Treino nos dois idiomas (a navegação precisa dele antes do módulo)", () => {
  assert.ok(appDic["pt-BR"]["tela.treino"] && appDic.en["tela.treino"]);
});
test("tela Treino fora do índice de telas ou com ícone que não existe", async () => {
  const e = TELAS.find((x) => x.id === "treino");
  assert.ok(e && e.grupo === "mais");
  const { NOMES_ICONES } = await import("../../app/js/v2/ui/icones.mjs");
  assert.ok(NOMES_ICONES.includes(e.icone));
  const { tela } = await import("../../app/js/v2/ui/telas/treino.mjs");
  assert.equal(tela.id, "treino"); assert.equal(typeof tela.montar, "function");
  assert.ok(tela.i18n.endsWith("treino.i18n.mjs") && tela.css.includes("/css/treino.css"));
});
test("chave treino.* usada no código sem texto no dicionário (apareceria como [chave] na tela)", () => {
  const usadas = new Set(), familias = new Set();
  for (const arq of ARQUIVOS) for (const m of readFileSync(arq, "utf8").matchAll(/["`](treino\.[A-Za-z0-9_.${}\[\]\-]+)["`]/g)) (m[1].includes("${") ? familias : usadas).add(m[1]);
  const pt = dic["pt-BR"], tem = (k) => k in pt || `${k}.one` in pt || `${k}.other` in pt;
  // Prefixos passados a `t(`${prefixo}.${valor}`)` (a lista de valores é conferida na família dinâmica abaixo).
  const prefixos = new Set(["treino.equip", "treino.padrao"]);
  for (const k of usadas) assert.ok(prefixos.has(k) || tem(k), `chave sem texto: ${k}`);
  // Famílias dinâmicas: toda variante possível precisa existir.
  const esperadas = { "treino.aba.": ["treinar", "rotinas", "progresso", "cardio", "biblioteca"], "treino.grupo.": GRUPOS, "treino.equip.": EQUIPAMENTOS, "treino.padrao.": PADROES, "treino.modalidade.": MODALIDADES,
    "treino.faixa.": ["sem_registro", "abaixo", "na_faixa", "acima"], "treino.sug.": ["inicio", "subir", "manter", "mais_reps", "reduzir", "variacao"], "treino.rec.": ["carga", "e1rm", "reps"], "treino.zonaNome.": [1, 2, 3, 4, 5], "treino.zonaDica.": [1, 2, 3, 4, 5] };
  for (const f of familias) { const pre = f.slice(0, f.indexOf("${")); assert.ok(esperadas[pre], `família sem lista: ${f}`); for (const v of esperadas[pre]) assert.ok(tem(`${pre}${v}`), `falta ${pre}${v}`); }
});
test("nenhuma palavra de culpa nos textos da tela Treino (platô e semana leve são convites)", () => {
  const proibidas = /estourou|falhou|falha\b|fracass|perdeu a sequ|sequência|sequencia|streak|atrasad|culpa|preguiç|failed|failure|you broke|lazy/i;
  for (const [idioma, d] of Object.entries(dic)) for (const [k, v] of Object.entries(d)) assert.ok(!proibidas.test(v), `${idioma} ${k}: "${v}"`);
});
test("tela Treino com innerHTML, atributo style, rede, import de JSON ou import de outra tela", () => {
  for (const arq of ARQUIVOS) {
    const src = readFileSync(arq, "utf8");
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(src), `${arq} usa innerHTML`);
    assert.ok(!/\bstyle:\s*["'`]/.test(src) && !/setAttribute\(\s*["']style/.test(src), `${arq} usa atributo style`);
    assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|indexedDB/.test(src), `${arq} fala com rede ou armazenamento`);
    assert.ok(!/import[^;]*\bwith\s*\{|\bassert\s*\{\s*type/.test(src), `${arq} usa import de JSON`);
    assert.ok(!/from "\.\.?\/(patrimonio|metas|dividas|shape|checkin|hoje|financas|cartoes)\.mjs"/.test(src), `${arq} importa outra tela`);
  }
});
test("módulo de motor importa DOM, rede ou armazenamento (o motor é puro e roda em Node)", () => {
  const dir = join(TELAS_DIR, "..", "..", "treino");
  for (const f of readdirSync(dir)) { const s = readFileSync(join(dir, f), "utf8"); assert.ok(!/\bdocument\b|\bwindow\b|fetch\(|localStorage|indexedDB/.test(s), f); }
});
test("catálogo com exercício sem texto de grupo, equipamento ou padrão traduzido", () => {
  const pt = dic["pt-BR"];
  for (const e of CATALOGO) { assert.ok(`treino.grupo.${e.grupo}` in pt && `treino.equip.${e.equipamento}` in pt && `treino.padrao.${e.padrao}` in pt, e.id); for (const g of [...e.primarios, ...e.secundarios]) assert.ok(`treino.grupo.${g}` in pt, `${e.id}/${g}`); }
});
