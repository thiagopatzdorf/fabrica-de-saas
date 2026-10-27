// Gráficos da UI v2 construídos como DOM (via `hs`), nunca como texto HTML inserido na página: rótulo de
// conta e nome de meta são dado da pessoa. Reusa `escala` do `js/graficos.mjs` (marcas "redondas" do eixo);
// o `esc` de lá não é necessário porque aqui o texto vira nó de texto. Regras de marca: linha de 2 px,
// ponto com anel da cor da superfície, uma série por linha, grade fina, texto sempre na cor de texto
// (a cor da série fica na marca), `<title>`/`<desc>` e tabela-irmã (em `_comum.tabelaIrma`) ao lado.
// Dinheiro negativo não é "erro": a barra divergente usa azul↔laranja, nunca verde↔vermelho.
import { escala } from "../../graficos.mjs";

const f = (n) => Math.round(n * 10) / 10;
let seq = 0;
const abre = (hs, l, a, titulo, desc) => {
  const id = `g${++seq}`;
  return hs("svg", { class: "grafico", viewBox: `0 0 ${l} ${a}`, role: "img", "aria-labelledby": `${id}t ${id}d`, preserveAspectRatio: "xMidYMid meet" },
    hs("title", { id: `${id}t` }, titulo), hs("desc", { id: `${id}d` }, desc));
};
const texto = (hs, cls, x, y, anchor, s) => hs("text", { class: cls, x: f(x), y: f(y), "text-anchor": anchor }, s);

// pontos: [{x, y, tip}] (x = número de dia ou índice), media: [{x, y}] (linha), meta: número|null.
export function graficoLinha({ hs, pontos = [], media = [], meta = null, xRotulos = [], fmtY = (v) => String(v), largura = 640, altura = 240, titulo, desc, rotuloMeta = "", classe = "s1" }) {
  const E = 56, D = 24, T = 16, B = 30, W = largura - E - D, H = altura - T - B;
  const svg = abre(hs, largura, altura, titulo, desc);
  const ys = [...pontos.map((p) => p.y), ...media.map((p) => p.y), ...(meta == null ? [] : [meta])];
  const xs = [...pontos.map((p) => p.x), ...media.map((p) => p.x)];
  if (!ys.length) return svg;
  const ey = escala(Math.min(...ys), Math.max(...ys)), x0 = Math.min(...xs) - (xs.length === 1 ? 3 : 0), x1 = Math.max(...xs) + (xs.length === 1 ? 3 : 0);
  const X = (x) => E + ((x - x0) / (x1 - x0 || 1)) * W, Y = (y) => T + (1 - (y - ey.min) / (ey.max - ey.min || 1)) * H;
  for (const m of ey.marcas) svg.append(hs("line", { class: "g", x1: E, x2: E + W, y1: f(Y(m)), y2: f(Y(m)) }), texto(hs, "tk", E - 8, Y(m) + 4, "end", fmtY(m)));
  for (const r of xRotulos) svg.append(texto(hs, "tk", X(r.x), altura - 8, "middle", r.texto));
  if (meta != null) svg.append(hs("line", { class: "meta", x1: E, x2: E + W, y1: f(Y(meta)), y2: f(Y(meta)) }), texto(hs, "tk", E + W, Y(meta) - 6, "end", `${rotuloMeta} ${fmtY(meta)}`.trim()));
  if (media.length > 1) svg.append(hs("polyline", { class: ["ln", classe], fill: "none", points: media.map((p) => `${f(X(p.x))},${f(Y(p.y))}`).join(" ") }));
  for (const p of pontos) svg.append(hs("circle", { class: ["pt", classe], cx: f(X(p.x)), cy: f(Y(p.y)), r: 4 }));
  if (media.length) { const u = media[media.length - 1]; svg.append(texto(hs, "fim", X(u.x), Y(u.y) - 10, "end", fmtY(u.y))); }
  for (const p of pontos) if (p.tip) svg.append(hs("circle", { class: "hit", cx: f(X(p.x)), cy: f(Y(p.y)), r: 14, tabindex: "0" }, hs("title", null, p.tip)));
  return svg;
}

// Colunas de UMA série: grupos [{rotulo, valor, tip}], meta tracejada. Até 24 px de largura, topo arredondado.
export function graficoColunas({ hs, grupos, meta = null, fmtY = (v) => String(v), largura = 640, altura = 220, titulo, desc, rotuloMeta = "", classe = "s1" }) {
  const E = 44, D = 16, T = 16, B = 28, W = largura - E - D, H = altura - T - B;
  const max = Math.max(1, ...grupos.map((g) => g.valor), meta ?? 0), ey = escala(0, max);
  const Y = (v) => T + (1 - v / ey.max) * H, banda = W / Math.max(1, grupos.length), larg = Math.min(24, Math.floor(banda * 0.7));
  const svg = abre(hs, largura, altura, titulo, desc);
  for (const m of ey.marcas) svg.append(hs("line", { class: "g", x1: E, x2: E + W, y1: f(Y(m)), y2: f(Y(m)) }), texto(hs, "tk", E - 8, Y(m) + 4, "end", fmtY(m)));
  // Banda estreita (< 44 px, caso de 8 colunas em 390 px): rótulos de data se sobrepunham; mostra um sim, um não.
  const pulaRotulo = banda < 44 ? 2 : 1;
  grupos.forEach((g, i) => {
    const x0 = E + banda * i + (banda - larg) / 2, hh = (g.valor / ey.max) * H, r = Math.min(4, larg / 2, hh);
    if ((grupos.length - 1 - i) % pulaRotulo === 0) svg.append(texto(hs, "tk", E + banda * (i + 0.5), altura - 8, "middle", g.rotulo));
    if (hh >= 1) svg.append(hs("path", { class: classe, d: `M${f(x0)},${f(Y(0))}V${f(Y(g.valor) + r)}Q${f(x0)},${f(Y(g.valor))} ${f(x0 + r)},${f(Y(g.valor))}H${f(x0 + larg - r)}Q${f(x0 + larg)},${f(Y(g.valor))} ${f(x0 + larg)},${f(Y(g.valor) + r)}V${f(Y(0))}Z` }));
    if (g.tip) svg.append(hs("rect", { class: "hit", x: f(E + banda * i), y: T, width: f(banda), height: H, tabindex: "0" }, hs("title", null, g.tip)));
  });
  if (meta != null) svg.append(hs("line", { class: "meta", x1: E, x2: E + W, y1: f(Y(meta)), y2: f(Y(meta)) }), texto(hs, "tk", E + W, Y(meta) - 6, "end", rotuloMeta));
  svg.append(hs("line", { class: "eixo", x1: E, x2: E + W, y1: f(Y(0)), y2: f(Y(0)) }));
  return svg;
}

// Barra empilhada horizontal DIVERGENTE: ativos à direita do zero (classes s1/s3…), passivos à esquerda
// (classe s2, laranja). Uma barra só, 28 px, com o zero onde a proporção manda. Devolve o SVG; a legenda
// e a tabela-irmã (texto) ficam com quem chama, porque a cor nunca é a única pista.
export function barraDivergente({ hs, ativos = [], passivos = [], fmt = (v) => String(v), largura = 640, titulo, desc }) {
  const altura = 64, M = 8, W = largura - 2 * M, y = 18, hB = 28;
  const somaA = ativos.reduce((s, a) => s + a.valor, 0), somaP = passivos.reduce((s, p) => s + p.valor, 0), total = somaA + somaP || 1;
  const x0 = M + (somaP / total) * W;
  const svg = abre(hs, largura, altura, titulo, desc);
  let x = x0;
  for (const p of [...passivos].reverse()) { const w = (p.valor / total) * W; x -= w; if (w >= 1) svg.append(hs("rect", { class: ["seg", p.classe ?? "s2"], x: f(x), y, width: f(Math.max(0, w - 1)), height: hB, rx: 3 }, hs("title", null, `${p.rotulo}: ${fmt(p.valor)}`))); }
  x = x0;
  for (const a of ativos) { const w = (a.valor / total) * W; if (w >= 1) svg.append(hs("rect", { class: ["seg", a.classe ?? "s1"], x: f(x + 1), y, width: f(Math.max(0, w - 1)), height: hB, rx: 3 }, hs("title", null, `${a.rotulo}: ${fmt(a.valor)}`))); x += w; }
  svg.append(hs("line", { class: "eixo", x1: f(x0), x2: f(x0), y1: y - 6, y2: y + hB + 6 }));
  if (somaP) svg.append(texto(hs, "tk", Math.max(M, x0 - 6), altura - 4, "end", `−${fmt(somaP)}`));
  if (somaA) svg.append(texto(hs, "tk", Math.min(M + W, x0 + 6), altura - 4, "start", fmt(somaA)));
  return svg;
}

// Legenda de texto para qualquer gráfico: quadrado da classe + rótulo (+ valor). Cor reforça, texto diz.
export function legenda(h, itens) {
  return h("ul", { class: "legenda" }, itens.map((i) => h("li", null, h("i", { class: ["q", i.classe], "aria-hidden": "true" }), h("span", null, i.rotulo), i.valor != null ? h("b", null, i.valor) : null)));
}
