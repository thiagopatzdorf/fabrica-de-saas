// Gráficos das telas Finanças e Cartões em SVG montado por `hs` (DOM, nunca texto HTML): as formas são as
// mesmas já validadas no v1 (`js/graficos.mjs`, de onde vem `escala`): linha de 2 px, coluna ≤ 24 px com topo
// de 4 px arredondado, barra horizontal com rótulo direto, grade fina, texto sempre na cor de texto (a cor da
// série fica só na marca: classes .s1 azul, .s2 laranja, .s3 verde-água). Todo gráfico tem <title>/<desc>;
// a tabela-irmã e a leitura por toque ficam na `figura()` da tela. Nenhum atributo `style`: largura e
// posição são atributos SVG, que a CSP não bloqueia.
import { escala } from "../../graficos.mjs";
import { hs } from "./h.mjs";

const f = (n) => Math.round(n * 10) / 10;
let seq = 0;

function abre(largura, altura, titulo, desc, classe = "") {
  const id = `gf${(seq += 1).toString(36)}`;
  return hs("svg", { class: ["grafico", classe], viewBox: `0 0 ${largura} ${altura}`, role: "img", "aria-labelledby": `${id}t ${id}d`, preserveAspectRatio: "xMidYMid meet" },
    hs("title", { id: `${id}t` }, titulo), hs("desc", { id: `${id}d` }, desc));
}
const topo = (x, y, w, h, r = 4) => { r = Math.min(r, w / 2, h); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; };
const direita = (x, y, w, h, r = 4) => { r = Math.min(r, h / 2, w); return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`; };
const texto = (classe, x, y, conteudo, anchor = "start") => hs("text", { class: classe, x: f(x), y: f(y), "text-anchor": anchor }, conteudo);
const hit = (attrs, tip) => hs("rect", { class: "hit", tabindex: 0, "data-tip": tip ?? "", ...attrs });

// Colunas agrupadas (até 2 séries): grupos [{rotulo, valores:[a, b?], tip}], series [{classe}].
export function graficoColunas({ grupos, series, fmtY = String, largura = 640, altura = 240, titulo, desc }) {
  const E = 56, D = 12, T = 16, B = 28, W = largura - E - D, H = altura - T - B;
  const max = Math.max(1, ...grupos.flatMap((g) => g.valores)), ey = escala(0, max);
  const Y = (v) => T + (1 - v / ey.max) * H, banda = W / Math.max(1, grupos.length), n = series.length;
  const larg = Math.max(4, Math.min(24, Math.floor((banda * 0.7 - 2 * (n - 1)) / n)));
  const svg = abre(largura, altura, titulo, desc);
  for (const m of ey.marcas) svg.append(hs("line", { class: "g", x1: E, x2: E + W, y1: f(Y(m)), y2: f(Y(m)) }), texto("tk", E - 8, Y(m) + 4, fmtY(m), "end"));
  grupos.forEach((g, i) => {
    const total = n * larg + 2 * (n - 1), x0 = E + banda * i + (banda - total) / 2;
    svg.append(texto("tk", E + banda * (i + 0.5), altura - 8, g.rotulo, "middle"));
    g.valores.forEach((v, k) => { const h = (v / ey.max) * H; if (h >= 1) svg.append(hs("path", { class: series[k].classe, d: topo(f(x0 + k * (larg + 2)), f(Y(v)), larg, f(h)) })); });
  });
  svg.append(hs("line", { class: "eixo", x1: E, x2: E + W, y1: f(Y(0)), y2: f(Y(0)) }));
  grupos.forEach((g, i) => svg.append(hit({ x: f(E + banda * i), y: T, width: f(banda), height: H }, g.tip)));
  return svg;
}

// Barras horizontais ordenadas, uma cor só (a identidade é o rótulo, não a cor), valor na ponta.
export function graficoBarrasH({ itens, fmt = String, largura = 640, titulo, desc, classe = "s1" }) {
  const L = Math.min(130, Math.round(largura * 0.34)), D = Math.min(96, Math.round(largura * 0.22)), linha = 30;
  const altura = Math.max(40, itens.length * linha + 8), W = largura - L - D, max = Math.max(1, ...itens.map((i) => i.valor));
  const maxChars = Math.max(6, Math.floor((L - 10) / 7)); // rótulo que não cabe à esquerda é cortado com "…"; o nome inteiro está no data-tip e na tabela
  const svg = abre(largura, altura, titulo, desc);
  itens.forEach((it, i) => {
    const y = 4 + i * linha, w = Math.max(0, (it.valor / max) * W), rotulo = it.rotulo.length > maxChars ? `${it.rotulo.slice(0, maxChars - 1)}…` : it.rotulo;
    svg.append(texto("tk2", L - 10, y + 19, rotulo, "end"));
    if (w >= 1) svg.append(hs("path", { class: classe, d: direita(L, y + 6, f(w), 14) }));
    svg.append(texto("fim", L + w + 8, y + 19, fmt(it.valor)), hit({ x: 0, y, width: largura, height: linha }, it.tip));
  });
  svg.append(hs("line", { class: "eixo", x1: L, x2: L, y1: 2, y2: altura - 2 }));
  return svg;
}

// Sparkline (small multiple): 6 pontos, 1 cor, sem eixo, rótulo só no último ponto.
export function sparkline({ valores, largura = 160, altura = 44, titulo, desc, rotuloFim, classe = "s1" }) {
  const svg = abre(largura, altura, titulo, desc, "sparkline");
  if (!valores.length) return svg;
  const D = Math.min(largura * 0.6, String(rotuloFim ?? "").length * 8 + 14), W = largura - 6 - D, T = 8, H = altura - 16; // espaço do rótulo final
  const min = Math.min(0, ...valores), max = Math.max(1, ...valores);
  const X = (i) => 4 + (valores.length === 1 ? W / 2 : (i / (valores.length - 1)) * W), Y = (v) => T + (1 - (v - min) / (max - min || 1)) * H;
  svg.append(hs("polyline", { class: ["ln", classe], fill: "none", points: valores.map((v, i) => `${f(X(i))},${f(Y(v))}`).join(" ") }));
  const u = valores.length - 1;
  svg.append(hs("circle", { class: ["pt", classe], cx: f(X(u)), cy: f(Y(valores[u])), r: 4 }), texto("fim", X(u) + 8, Y(valores[u]) + 4, rotuloFim));
  return svg;
}

// Linha do saldo diário projetado: zero tracejado quando a faixa cruza o zero, marca (anel) no menor saldo,
// `hits` por dia para a leitura. Saldo negativo não é "erro": a linha continua azul, a marca é texto.
export function graficoLinhaSaldo({ pontos, indiceMenor, xRotulos = [], fmtY = String, largura = 640, altura = 220, titulo, desc, rotuloMenor }) {
  const E = 60, D = 16, T = 18, B = 28, W = largura - E - D, H = altura - T - B;
  const svg = abre(largura, altura, titulo, desc);
  if (!pontos.length) return svg;
  const ys = pontos.map((p) => p.y), ey = escala(Math.min(0, ...ys), Math.max(...ys, 1));
  const n = pontos.length, X = (i) => E + (n === 1 ? W / 2 : (i / (n - 1)) * W), Y = (y) => T + (1 - (y - ey.min) / (ey.max - ey.min || 1)) * H;
  for (const m of ey.marcas) svg.append(hs("line", { class: m === 0 ? "zero" : "g", x1: E, x2: E + W, y1: f(Y(m)), y2: f(Y(m)) }), texto("tk", E - 8, Y(m) + 4, fmtY(m), "end"));
  for (const r of xRotulos) svg.append(texto("tk", X(r.i), altura - 8, r.texto, "middle"));
  svg.append(hs("polyline", { class: "ln s1", fill: "none", points: pontos.map((p, i) => `${f(X(i))},${f(Y(p.y))}`).join(" ") }));
  if (indiceMenor != null) {
    const p = pontos[indiceMenor];
    svg.append(hs("circle", { class: "pt s2", cx: f(X(indiceMenor)), cy: f(Y(p.y)), r: 5 }));
    const anchor = indiceMenor > n * 0.7 ? "end" : indiceMenor < n * 0.3 ? "start" : "middle";
    svg.append(texto("fim", X(indiceMenor), Y(p.y) - 10, rotuloMenor, anchor));
  }
  const passo = W / Math.max(1, n - 1);
  pontos.forEach((p, i) => svg.append(hit({ x: f(X(i) - passo / 2), y: T, width: f(passo), height: H }, p.tip)));
  return svg;
}

// Bullet (orçamento × real): trilho = maior entre limite e gasto; barra = gasto (azul); traço = limite.
// Em viewBox 0–100 com preserveAspectRatio="none" a largura é percentual, sem `style` nem medir a tela.
export function bullet({ gasto, limite, titulo, desc }) {
  const maior = Math.max(limite, gasto, 1), pct = (v) => f(Math.max(0, Math.min(100, (v / maior) * 100)));
  const svg = abre(100, 12, titulo, desc, "bullet");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.append(hs("rect", { class: "trilho", x: 0, y: 3, width: 100, height: 6, rx: 1 }),
    hs("rect", { class: "s1", x: 0, y: 3, width: pct(gasto), height: 6, rx: 1 }),
    hs("rect", { class: "limite", x: Math.min(99, pct(limite)), y: 0, width: 1, height: 12 }));
  return svg;
}

// Linha do tempo de 3 ciclos do cartão (anterior · aberta · próxima), 3 tons da rampa azul por classe.
export function linhaDoTempoCiclos({ ciclos, largura = 320, titulo, desc }) {
  const svg = abre(largura, 14, titulo, desc, "ciclos");
  svg.setAttribute("preserveAspectRatio", "none"); // estica na largura da lista de ciclos abaixo dela
  const w = largura / ciclos.length;
  ciclos.forEach((c, i) => svg.append(hs("rect", { class: ["ciclo", `ciclo-${c.classe}`], x: f(i * w + (i ? 1 : 0)), y: 2, width: f(w - (i ? 1 : 0) - (i < ciclos.length - 1 ? 1 : 0)), height: 10, rx: 2 })));
  return svg;
}
