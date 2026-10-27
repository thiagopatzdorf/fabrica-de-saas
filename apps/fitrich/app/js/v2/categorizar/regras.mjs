// Regras de categoria: `{ id, padrao, tipo: "contem"|"regex", categoriaId?, categoriaNome?, prioridade,
// origem: "base"|"usuario"|"aprendida", acertos }`. Transparente de ponta a ponta: a pessoa vê, edita e
// apaga qualquer regra (modelo opaco foi descartado no plano).
//
// Ordem de decisão em `categorizar`: usuário > aprendida > base; dentro da mesma origem, maior
// `prioridade`, depois mais `acertos`, depois padrão mais longo (mais específico). Motivo de origem
// vir antes de prioridade: quando a pessoa escreveu a regra, ela quis aquilo, mesmo que a base
// tenha prioridade maior.
import { normalizarTexto } from "../importar/comum.mjs";

export const ORIGENS = { usuario: 3, aprendida: 2, base: 1 };
export const LIMITE_REGEX = 120; // caracteres do padrão
export const LIMITE_DESCRICAO = 300;

// Descrição de banco → forma comparável. Remove: prefixos de adquirente (`PG *`, `PAG*`, `MP *`, `EC *`,
// `DL *`, `IFD*`, `APL*`, `PP *`), parcela (`2/3`, `01/12`), datas (`02/07`), números soltos com 3+
// dígitos (documento, terminal, CNPJ), pontuação. "PG *IFOOD 2/3 12345" → "ifood".
// Mantém números curtos como palavra: "99" é uma empresa de transporte.
export function normalizarDescricao(descricao) {
  let s = normalizarTexto(String(descricao ?? "").slice(0, LIMITE_DESCRICAO));
  s = s.replace(/\b(pg|pag|pagto|mp|ec|dl|ifd|apl|pp|rec|mercpago)\s*\*\s*/g, " ");
  s = s.replace(/\b\d{1,2}\s*\/\s*\d{1,2}\b/g, " "); // parcela e data curta
  s = s.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, " ");
  s = s.replace(/\b\d{3,}\b/g, " ");
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");
  return s.replace(/\s+/g, " ").trim();
}

// Regex do usuário: recusa o que pode explodir (quantificador sobre grupo que já tem quantificador,
// backreference, lookbehind, padrão longo). Não existe timeout síncrono em JS; a defesa é não
// compilar o que é perigoso e limitar o tamanho da entrada.
export function validarRegex(padrao) {
  const p = String(padrao ?? "");
  if (!p) return { ok: false, motivo: "vazio" };
  if (p.length > LIMITE_REGEX) return { ok: false, motivo: "longo_demais" };
  if (/\\[1-9]/.test(p) || /\\k</.test(p)) return { ok: false, motivo: "backreference" };
  if (/\(\?<[=!]/.test(p)) return { ok: false, motivo: "lookbehind" };
  if (quantificadorAninhado(p)) return { ok: false, motivo: "quantificador_aninhado" };
  if (/(\.\*|\.\+).*(\.\*|\.\+)/.test(p)) return { ok: false, motivo: "curinga_duplo" };
  try { new RegExp(p, "iu"); } catch { return { ok: false, motivo: "sintaxe" }; }
  return { ok: true };
}

// Grupo que contém quantificador OU alternância e recebe quantificador por fora: (a+)+, (a*)*b, (a|aa)+,
// (.*a){20}, ^(([a-z])+.)+$ — a forma clássica de regex catastrófica. Varre contando parênteses, em
// qualquer profundidade; escapes e classes [...] são pulados.
export function quantificadorAninhado(p) {
  const pilha = []; // por grupo aberto: { perigoso }
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === "\\") { i++; continue; }
    if (ch === "[") { while (i < p.length && p[i] !== "]") { if (p[i] === "\\") i++; i++; } continue; }
    if (ch === "(") { pilha.push({ perigoso: false }); continue; }
    if (ch === "|" && pilha.length) { pilha[pilha.length - 1].perigoso = true; continue; }
    if (ch === ")") {
      const g = pilha.pop();
      const prox = p[i + 1];
      if (g?.perigoso && (prox === "+" || prox === "*" || prox === "{")) return true;
      if (g?.perigoso && pilha.length) pilha[pilha.length - 1].perigoso = true; // propaga para o grupo de fora
      continue;
    }
    if ((ch === "+" || ch === "*" || ch === "{") && pilha.length) pilha[pilha.length - 1].perigoso = true;
  }
  return false;
}

const cacheRegex = new Map();
function compilar(padrao) {
  if (cacheRegex.has(padrao)) return cacheRegex.get(padrao);
  const v = validarRegex(padrao);
  const re = v.ok ? new RegExp(padrao, "iu") : null;
  cacheRegex.set(padrao, re);
  return re;
}

// Uma regra casa? `contem` compara a forma normalizada dos dois lados (acento, caixa e pontuação não
// importam) e exige que o padrão comece em início de palavra: "tim" casa "tim celular" e não "intimus";
// "extra" casa "extrafarma" (prefixo), e aí o padrão mais longo ("extrafarma") desempata.
export function regraCasa(regra, descricaoNormalizada) {
  if (!regra?.padrao) return false;
  if (regra.tipo === "regex") { const re = compilar(regra.padrao); return re ? re.test(descricaoNormalizada) : false; }
  const p = normalizarDescricao(regra.padrao);
  return p.length > 0 && (" " + descricaoNormalizada).includes(" " + p);
}

export const compararRegras = (a, b) =>
  (ORIGENS[b.origem] ?? 0) - (ORIGENS[a.origem] ?? 0) || (b.prioridade ?? 0) - (a.prioridade ?? 0) || (b.acertos ?? 0) - (a.acertos ?? 0) || String(b.padrao).length - String(a.padrao).length;

// Devolve { categoriaId, categoriaNome, regraId, origem } ou null. `regras` desativadas (`ativa: false`) são puladas.
export function categorizar(descricao, regras) {
  const d = normalizarDescricao(descricao);
  if (!d) return null;
  const candidatas = regras.filter((r) => r.ativa !== false && regraCasa(r, d)).sort(compararRegras);
  const r = candidatas[0];
  return r ? { categoriaId: r.categoriaId ?? null, categoriaNome: r.categoriaNome ?? null, regraId: r.id, origem: r.origem, alternativas: candidatas.slice(1, 4).map((x) => x.id) } : null;
}

// `categorias-br.json` → regras `base`. O JSON é a fonte editável; o id de categoria é resolvido
// pelo NOME contra a lista de categorias do núcleo (`categorias`), porque os ids nascem lá.
export function regrasDaBase(json, categorias = [], { prefixoId = "base" } = {}) {
  const porNome = new Map(categorias.map((c) => [normalizarTexto(c.nome), c.id]));
  const regras = [];
  for (const cat of json.categorias ?? []) {
    const categoriaId = porNome.get(normalizarTexto(cat.nome)) ?? null;
    for (const padrao of cat.padroes ?? []) regras.push({ id: `${prefixoId}:${normalizarTexto(padrao).replace(/\s+/g, "-")}`, padrao, tipo: "contem", categoriaId, categoriaNome: cat.nome, prioridade: cat.prioridade ?? 0, origem: "base", acertos: 0 });
  }
  return regras;
}

// Edição pela pessoa: tudo imutável, devolve lista nova.
export function criarRegra(regras, { padrao, tipo = "contem", categoriaId = null, categoriaNome = null, prioridade = 0, origem = "usuario" }, { novoId }) {
  if (!String(padrao ?? "").trim()) throw new Error("padrão vazio");
  if (tipo === "regex") { const v = validarRegex(padrao); if (!v.ok) throw new Error(`regex recusada: ${v.motivo}`); }
  return [...regras, { id: novoId(), padrao: String(padrao).trim(), tipo, categoriaId, categoriaNome, prioridade, origem, acertos: 0 }];
}
export const editarRegra = (regras, id, mudancas) => {
  if (mudancas.tipo === "regex" || (mudancas.padrao !== undefined && regras.find((r) => r.id === id)?.tipo === "regex")) {
    const v = validarRegex(mudancas.padrao ?? regras.find((r) => r.id === id)?.padrao);
    if (!v.ok) throw new Error(`regex recusada: ${v.motivo}`);
  }
  return regras.map((r) => (r.id === id ? { ...r, ...mudancas, id } : r));
};
export const removerRegra = (regras, id) => regras.filter((r) => r.id !== id);
export const registrarAcerto = (regras, id) => regras.map((r) => (r.id === id ? { ...r, acertos: (r.acertos ?? 0) + 1 } : r));
