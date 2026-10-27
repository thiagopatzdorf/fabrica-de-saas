// Gráfico do Plano: faixa de resultados (Monte Carlo) como DOM via `hs`. Faixa p10–p90 em área, mediana em
// linha de 2 px, alvo tracejado; `<title>`/`<desc>` e a tabela-irmã ficam com a tela. Cor nunca é a única
// pista: a legenda de texto diz o que é a faixa, a linha e o alvo.
import { escala } from "../../graficos.mjs";

const f = (n) => Math.round(n * 10) / 10;
let seq = 0;

// faixa: [{ ano, p10, p50, p90 }] (valores numéricos, na unidade que a escala aceitar), alvo: número|null.
export function graficoFaixa({ hs, faixa, alvo = null, fmtY = (v) => String(v), fmtX = (v) => String(v), largura = 640, altura = 260, titulo, desc, rotuloAlvo = "" }) {
  const E = 72, D = 20, T = 16, B = 30, W = largura - E - D, H = altura - T - B;
  const id = `gp${++seq}`;
  const svg = hs("svg", { class: "grafico", viewBox: `0 0 ${largura} ${altura}`, role: "img", "aria-labelledby": `${id}t ${id}d`, preserveAspectRatio: "xMidYMid meet" },
    hs("title", { id: `${id}t` }, titulo), hs("desc", { id: `${id}d` }, desc));
  if (!faixa.length) return svg;
  const ys = [...faixa.flatMap((p) => [p.p10, p.p90]), ...(alvo == null ? [] : [alvo]), 0];
  const ey = escala(Math.min(...ys), Math.max(...ys));
  const x0 = faixa[0].ano, x1 = faixa[faixa.length - 1].ano;
  const X = (x) => E + ((x - x0) / (x1 - x0 || 1)) * W, Y = (y) => T + (1 - (y - ey.min) / (ey.max - ey.min || 1)) * H;
  for (const m of ey.marcas) svg.append(hs("line", { class: "g", x1: E, x2: E + W, y1: f(Y(m)), y2: f(Y(m)) }), hs("text", { class: "tk", x: E - 8, y: f(Y(m) + 4), "text-anchor": "end" }, fmtY(m)));
  const passo = faixa.length > 21 ? 10 : faixa.length > 11 ? 5 : faixa.length > 6 ? 2 : 1;
  for (const p of faixa) if ((p.ano - x0) % passo === 0 || p.ano === x1) svg.append(hs("text", { class: "tk", x: f(X(p.ano)), y: altura - 8, "text-anchor": "middle" }, fmtX(p.ano)));
  const topo = faixa.map((p) => `${f(X(p.ano))},${f(Y(p.p90))}`), base = [...faixa].reverse().map((p) => `${f(X(p.ano))},${f(Y(p.p10))}`);
  svg.append(hs("path", { class: "s1b faixa", d: `M${topo.join("L")}L${base.join("L")}Z`, "fill-opacity": "0.55" }));
  svg.append(hs("polyline", { class: ["ln", "s1"], fill: "none", points: faixa.map((p) => `${f(X(p.ano))},${f(Y(p.p50))}`).join(" ") }));
  if (alvo != null) svg.append(hs("line", { class: "meta", x1: E, x2: E + W, y1: f(Y(alvo)), y2: f(Y(alvo)) }), hs("text", { class: "tk", x: E + W, y: f(Y(alvo) - 6), "text-anchor": "end" }, `${rotuloAlvo} ${fmtY(alvo)}`.trim()));
  const u = faixa[faixa.length - 1];
  svg.append(hs("circle", { class: ["pt", "s1"], cx: f(X(u.ano)), cy: f(Y(u.p50)), r: 4 }));
  svg.append(hs("line", { class: "eixo", x1: E, x2: E + W, y1: f(Y(Math.max(0, ey.min))), y2: f(Y(Math.max(0, ey.min))) }));
  return svg;
}
