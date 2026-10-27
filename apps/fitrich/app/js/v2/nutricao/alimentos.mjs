// Base de alimentos: busca local sem acento, nutrientes por quantidade e porções caseiras. A base (TACO) é
// injetada: a tela carrega `base-alimentos.mjs` sob demanda e passa para cá; os testes passam uma base pequena.
// Nada de rede e nada de relógio. Valores por 100 g; porção caseira é aproximação (medida típica).
export const normalizar = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const r1 = (v) => Math.round(v * 10 + 1e-9) / 10;

// Linha da base -> objeto. Fibra nula = não medida (soma como 0 e a tela sabe que é "sem dado").
export function alimentoDeLinha(l, porcoes = {}) {
  const [id, nome, cat, kcal, p, c, g, fibra, origem] = l;
  return { id, nome, cat, kcal, p, c, g, fibra, origem, porcoes: (porcoes[id] ?? []).map(([chave, gramas]) => ({ chave, g: gramas })) };
}

export function criarBase({ ALIMENTOS, BUSCA, PORCOES, POPULARES }) {
  const porId = new Map(ALIMENTOS.map((l) => [l[0], l]));
  const rankPop = new Map(POPULARES.map((id, i) => [id, i]));
  const obter = (id) => (porId.has(id) ? alimentoDeLinha(porId.get(id), PORCOES) : null);
  // Todas as palavras digitadas precisam aparecer (em qualquer ordem). Ordem: popular, palavra que COMEÇA o nome,
  // cozido/pronto antes de cru (quem digita "arroz" quer o do prato), nome curto.
  function buscar(texto, limite = 12) {
    const tokens = normalizar(texto).split(" ").filter(Boolean);
    if (!tokens.length) return POPULARES.slice(0, limite).map(obter);
    const achados = [];
    for (const l of ALIMENTOS) {
      const alvo = BUSCA[l[0]];
      if (!tokens.every((t) => alvo.includes(t))) continue;
      const nomeN = normalizar(l[1]);
      const comeca = nomeN.startsWith(tokens[0]) ? 0 : alvo.includes(" " + tokens[0]) || nomeN.includes(" " + tokens[0]) ? 1 : 2;
      const cru = /\bcru[a]?\b/.test(nomeN) ? 1 : 0;
      achados.push({ l, chave: [rankPop.has(l[0]) ? 0 : 1, comeca, cru, rankPop.get(l[0]) ?? 999, nomeN.length] });
    }
    achados.sort((a, b) => { for (let i = 0; i < a.chave.length; i++) if (a.chave[i] !== b.chave[i]) return a.chave[i] - b.chave[i]; return 0; });
    return achados.slice(0, limite).map((x) => alimentoDeLinha(x.l, PORCOES));
  }
  return { obter, buscar, total: ALIMENTOS.length, populares: (n = 12) => POPULARES.slice(0, n).map(obter) };
}

// Nutrientes de `gramas` de um alimento (por 100 g). kcal inteira; macros com 1 casa.
export function nutrientes(alimento, gramas) {
  const f = gramas / 100;
  return { kcal: Math.round(alimento.kcal * f + 1e-9), p: r1(alimento.p * f), c: r1(alimento.c * f), g: r1(alimento.g * f), fibra: r1((alimento.fibra ?? 0) * f) };
}

// Gramas de "n porções" de uma medida caseira (ou null se o alimento não tem a medida).
export const gramasDaPorcao = (alimento, chave, n = 1) => { const p = alimento.porcoes.find((x) => x.chave === chave); return p ? Math.round(p.g * n * 10) / 10 : null; };
