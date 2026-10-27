// Ícones do shell: SVG de traço, 24×24, montados por `hs` (nunca HTML em string). `icone(nome)` devolve um
// <svg aria-hidden> novo a cada chamada; o texto ao lado é quem dá o significado (estado nunca só por
// ícone, ícone nunca só por cor). Nome desconhecido devolve o ícone "ponto", não quebra a tela.
import { hs } from "./h.mjs";

const TRACOS = {
  hoje: ["M3 11l9-8 9 8", "M5 10v10h14V10", "M9 20v-6h6v6"],
  financas: ["M3 20h18", "M6 16V9", "M11 16V5", "M16 16v-4", "M21 16V7"],
  cartoes: ["M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z", "M3 10h18", "M7 15h3"],
  metas: ["M12 21a9 9 0 100-18 9 9 0 000 18z", "M12 17a5 5 0 100-10 5 5 0 000 10z", "M12 13a1 1 0 100-2 1 1 0 000 2z"],
  mais: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
  patrimonio: ["M3 21h18", "M5 21V8l7-5 7 5v13", "M9 21v-6h6v6"],
  plano: ["M12 21a9 9 0 100-18 9 9 0 000 18z", "M15.5 8.5l-2 5-5 2 2-5z"],
  dividas: ["M4 6h16v12H4z", "M4 10h16", "M8 14h4"],
  nutricao: ["M12 8c-2.5-2.2-7-1-7 4.5C5 17 8 21 12 21s7-4 7-8.5C19 7 14.5 5.8 12 8z", "M12 8c0-2.2 1-4.3 3.2-5"],
  shape: ["M6 8v8", "M18 8v8", "M3 10v4", "M21 10v4", "M6 12h12"],
  corpo: ["M12 21s-7-4.35-7-10a4 4 0 017-2.6A4 4 0 0119 11c0 5.65-7 10-7 10z", "M8 12h2l1.5-2.5L13 14l1-2h2"],
  checkin: ["M4 5h16v15H4z", "M4 9h16", "M8 3v4", "M16 3v4", "M9 14l2 2 4-4"],
  importar: ["M12 3v12", "M7 10l5 5 5-5", "M4 17v3h16v-3"],
  dados: ["M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z", "M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6", "M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"],
  regras: ["M4 6h16", "M4 12h10", "M4 18h7", "M17 15l2 2 3-3"],
  lancar: ["M12 5v14", "M5 12h14"],
  sol: ["M12 17a5 5 0 100-10 5 5 0 000 10z", "M12 2v2", "M12 20v2", "M4.9 4.9l1.4 1.4", "M17.7 17.7l1.4 1.4", "M2 12h2", "M20 12h2", "M4.9 19.1l1.4-1.4", "M17.7 6.3l1.4-1.4"],
  lua: ["M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"],
  info: ["M12 21a9 9 0 100-18 9 9 0 000 18z", "M12 11v5", "M12 8h.01"],
  atencao: ["M12 3l10 18H2z", "M12 10v4", "M12 18h.01"],
  ok: ["M12 21a9 9 0 100-18 9 9 0 000 18z", "M8 12l3 3 5-6"],
  fechar: ["M6 6l12 12", "M18 6L6 18"],
  desfazer: ["M4 8h10a5 5 0 010 10H9", "M8 4L4 8l4 4"],
  cadeado: ["M6 11h12v10H6z", "M8 11V8a4 4 0 018 0v3"],
  treino: ["M6 8v8", "M18 8v8", "M3 10v4", "M21 10v4", "M6 12h12"],
  peso: ["M4 4h16v16H4z", "M12 4v5", "M12 9l3 3", "M8 20v-4", "M16 20v-4"],
  vence: ["M4 5h16v15H4z", "M4 9h16", "M8 3v4", "M16 3v4", "M12 13v3", "M12 18h.01"],
  seta: ["M9 6l6 6-6 6"],
  relogio: ["M12 21a9 9 0 100-18 9 9 0 000 18z", "M12 7v5l3 2"],
  ponto: ["M12 13a1 1 0 100-2 1 1 0 000 2z"],
  exemplo: ["M4 7h16v10H4z", "M8 11h8", "M8 14h5"],
  celular: ["M7 2h10a1 1 0 011 1v18a1 1 0 01-1 1H7a1 1 0 01-1-1V3a1 1 0 011-1z", "M11 18h2"],
  instalar: ["M12 3v12", "M7 11l5 5 5-5", "M4 20h16"],
};

export const NOMES_ICONES = Object.keys(TRACOS);

export function icone(nome, { tamanho = 24 } = {}) {
  const tracos = TRACOS[nome] ?? TRACOS.ponto;
  return hs("svg", { viewBox: "0 0 24 24", width: tamanho, height: tamanho, fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" },
    ...tracos.map((d) => hs("path", { d })));
}
