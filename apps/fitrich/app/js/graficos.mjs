// Gráficos em SVG como texto puro (sem DOM): a página só insere o resultado. Regras de marca seguidas:
// linha de 2 px, ponto com anel da cor da superfície, coluna de até 24 px com topo arredondado e base
// reta, grade fina e discreta, um eixo só (nunca dois eixos y) e texto sempre na cor de texto, nunca na
// cor da série (a cor da série fica na marca). As cores são classes (.s1, .s2) que a página define.
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const numBR = (n, c = 0) => { const f = Math.abs(n).toFixed(c); const [i, d] = f.split("."); return `${n < 0 ? "−" : ""}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${d ? "," + d : ""}`; };

// Marcas "redondas" para o eixo: 0, 20, 40... em vez de 0, 17, 34...
export function escala(min, max, alvo = 4) {
  if (!(max > min)) { const m = Math.abs(min) || 1; min -= m * 0.5; max += m * 0.5; }
  const bruto = (max - min) / alvo, pot = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((f) => f * pot).find((p) => p >= bruto);
  const lo = Math.floor(min / passo + 1e-9) * passo, hi = Math.ceil(max / passo - 1e-9) * passo, marcas = [];
  for (let v = lo; v <= hi + passo / 2; v += passo) marcas.push(Math.round(v / passo) * passo);
  return { min: lo, max: hi, marcas };
}

const topo = (x, y, w, h, r = 4) => { r = Math.min(r, w / 2, h); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; };
const direita = (x, y, w, h, r = 4) => { r = Math.min(r, h / 2, w); return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`; };
const f = (n) => Math.round(n * 10) / 10;
const abre = (l, a, titulo, desc) => `<svg class="grafico" viewBox="0 0 ${l} ${a}" role="img" aria-labelledby="t d" preserveAspectRatio="xMidYMid meet"><title id="t">${esc(titulo)}</title><desc id="d">${esc(desc)}</desc>`;

// pontos: [{x, y, tip}], media: [{x, y}], meta: número|null. x são números de dia; xRotulos: [{x, texto}].
export function graficoLinha({ pontos, media = [], meta = null, xRotulos = [], fmtY = (v) => numBR(v, 1), largura = 640, altura = 260, titulo, desc, rotuloMeta = "Meta" }) {
  const E = 48, D = 24, T = 16, B = 30, W = largura - E - D, H = altura - T - B;
  const ys = [...pontos.map((p) => p.y), ...media.map((p) => p.y), ...(meta == null ? [] : [meta])];
  const xs = [...pontos.map((p) => p.x), ...media.map((p) => p.x)];
  if (!ys.length) return `${abre(largura, altura, titulo, desc)}</svg>`;
  const ey = escala(Math.min(...ys), Math.max(...ys)), x0 = Math.min(...xs) - (xs.length === 1 ? 3 : 0), x1 = Math.max(...xs) + (xs.length === 1 ? 3 : 0);
  const X = (x) => E + ((x - x0) / (x1 - x0 || 1)) * W, Y = (y) => T + (1 - (y - ey.min) / (ey.max - ey.min || 1)) * H;
  let s = abre(largura, altura, titulo, desc);
  for (const m of ey.marcas) s += `<line class="g" x1="${E}" x2="${E + W}" y1="${f(Y(m))}" y2="${f(Y(m))}"/><text class="tk" x="${E - 8}" y="${f(Y(m)) + 4}" text-anchor="end">${esc(fmtY(m))}</text>`;
  for (const r of xRotulos) s += `<text class="tk" x="${f(X(r.x))}" y="${altura - 8}" text-anchor="middle">${esc(r.texto)}</text>`;
  if (meta != null) s += `<line class="meta" x1="${E}" x2="${E + W}" y1="${f(Y(meta))}" y2="${f(Y(meta))}"/><text class="tk" x="${E + W}" y="${f(Y(meta)) - 6}" text-anchor="end">${esc(rotuloMeta)} ${esc(fmtY(meta))}</text>`;
  if (media.length > 1) s += `<polyline class="ln s1" fill="none" points="${media.map((p) => `${f(X(p.x))},${f(Y(p.y))}`).join(" ")}"/>`;
  for (const p of pontos) s += `<circle class="pt s1" cx="${f(X(p.x))}" cy="${f(Y(p.y))}" r="4"/>`;
  if (media.length) { const u = media[media.length - 1]; s += `<text class="fim" x="${f(X(u.x))}" y="${f(Y(u.y)) - 10}" text-anchor="end">${esc(fmtY(u.y))}</text>`; }
  for (const p of pontos) s += `<circle class="hit" cx="${f(X(p.x))}" cy="${f(Y(p.y))}" r="14" tabindex="0" data-tip="${esc(p.tip ?? "")}"/>`;
  return s + "</svg>";
}

// grupos: [{rotulo, valores:[a, b?], tips:[..]}]; series: [{nome, classe}]. Colunas de até 24 px, 2 px entre as do mesmo grupo.
export function graficoColunas({ grupos, series, meta = null, fmtY = (v) => numBR(v), largura = 640, altura = 240, titulo, desc, rotuloMeta = "Meta", rotuloFim = null }) {
  const E = 52, D = 16, T = 16, B = 28, W = largura - E - D, H = altura - T - B;
  const max = Math.max(1, ...grupos.flatMap((g) => g.valores), meta ?? 0), ey = escala(0, max);
  const Y = (v) => T + (1 - v / ey.max) * H, banda = W / Math.max(1, grupos.length), n = series.length;
  const larg = Math.min(24, Math.floor((banda * 0.7 - 2 * (n - 1)) / n));
  let s = abre(largura, altura, titulo, desc);
  for (const m of ey.marcas) s += `<line class="g" x1="${E}" x2="${E + W}" y1="${f(Y(m))}" y2="${f(Y(m))}"/><text class="tk" x="${E - 8}" y="${f(Y(m)) + 4}" text-anchor="end">${esc(fmtY(m))}</text>`;
  grupos.forEach((g, i) => {
    const total = n * larg + 2 * (n - 1), x0 = E + banda * i + (banda - total) / 2;
    s += `<text class="tk" x="${f(E + banda * (i + 0.5))}" y="${altura - 8}" text-anchor="middle">${esc(g.rotulo)}</text>`;
    g.valores.forEach((v, k) => { const h = (v / ey.max) * H; if (h >= 1) s += `<path class="${series[k].classe}" d="${topo(f(x0 + k * (larg + 2)), f(Y(v)), larg, f(h))}"/>`; });
    if (rotuloFim && i === grupos.length - 1) g.valores.forEach((v, k) => { if (v > 0) s += `<text class="fim" x="${f(x0 + k * (larg + 2) + larg / 2)}" y="${f(Y(v)) - 6}" text-anchor="middle">${esc(rotuloFim(v))}</text>`; });
  });
  if (meta != null) s += `<line class="meta" x1="${E}" x2="${E + W}" y1="${f(Y(meta))}" y2="${f(Y(meta))}"/><text class="tk" x="${E + W}" y="${f(Y(meta)) - 6}" text-anchor="end">${esc(rotuloMeta)}</text>`;
  s += `<line class="eixo" x1="${E}" x2="${E + W}" y1="${f(Y(0))}" y2="${f(Y(0))}"/>`;
  grupos.forEach((g, i) => { s += `<rect class="hit" x="${f(E + banda * i)}" y="${T}" width="${f(banda)}" height="${H}" tabindex="0" data-tip="${esc(g.tip ?? "")}"/>`; });
  return s + "</svg>";
}

// itens: [{rotulo, valor, tip}] já ordenados. Barra de 14 px, valor na ponta, uma cor só (a categoria é o rótulo).
export function graficoBarrasH({ itens, fmt = (v) => numBR(v), largura = 640, titulo, desc }) {
  const L = 130, D = 96, linha = 30, altura = Math.max(40, itens.length * linha + 8), W = largura - L - D, max = Math.max(1, ...itens.map((i) => i.valor));
  let s = abre(largura, altura, titulo, desc);
  itens.forEach((it, i) => {
    const y = 4 + i * linha, w = Math.max(0, (it.valor / max) * W);
    s += `<text class="tk2" x="${L - 10}" y="${y + 19}" text-anchor="end">${esc(it.rotulo)}</text>`;
    if (w >= 1) s += `<path class="s1" d="${direita(L, y + 6, f(w), 14)}"/>`;
    s += `<text class="fim" x="${f(L + w + 8)}" y="${y + 19}">${esc(fmt(it.valor))}</text><rect class="hit" x="0" y="${y}" width="${largura}" height="${linha}" tabindex="0" data-tip="${esc(it.tip ?? "")}"/>`;
  });
  return s + `<line class="eixo" x1="${L}" x2="${L}" y1="2" y2="${altura - 2}"/></svg>`;
}
