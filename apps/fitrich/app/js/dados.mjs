// O que o Fitrich guarda e como guarda. Tudo fica no armazenamento do próprio aparelho (localStorage);
// nenhuma informação sai daqui: não há conta, servidor nem envio. Exportar e importar são o único
// jeito de levar os dados para outro lugar, e é a pessoa que faz.
import { ehISO } from "./datas.mjs";

export const VERSAO = 1;
export const CHAVE = "fitrich-dados-v1";
export const CATEGORIAS_DESPESA = ["Moradia", "Mercado", "Transporte", "Saúde e fitness", "Lazer", "Educação", "Outros"];
export const CATEGORIAS_RECEITA = ["Salário", "Extra", "Outros"];
export const TIPOS_TREINO = ["Musculação", "Corrida", "Caminhada", "Bicicleta", "Esporte", "Outro"];
export const CATEGORIA_FITNESS = "Saúde e fitness";
const COLECOES = ["pesos", "medidas", "treinos", "lancamentos"];

export function vazio() {
  return {
    versao: VERSAO, prox: 1,
    perfil: { sexo: "", alturaCm: null },
    metas: { pesoKg: null, treinosSemana: 3, poupancaPct: 20, reservaAlvo: null, reservaAtual: 0 },
    orcamento: {},
    pesos: [], medidas: [], treinos: [], lancamentos: [],
  };
}

const numero = (v, a, b) => typeof v === "number" && Number.isFinite(v) && v >= a && v <= b;
const inteiro = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
const nulaOu = (v, f) => v === null || v === undefined || f(v);

// Cada regra devolve texto de erro, então a importação diz o que está errado em vez de só recusar.
export function validarItem(colecao, x) {
  if (!x || typeof x !== "object") return "item inválido";
  if (!inteiro(x.id, 1, 1e9)) return "id inválido";
  if (!ehISO(x.data)) return "data inválida";
  if (colecao === "pesos") return numero(x.kg, 20, 500) ? null : "peso fora de 20 a 500 kg";
  if (colecao === "medidas") {
    for (const k of ["cinturaCm", "pescocoCm", "quadrilCm", "peitoCm", "bracoCm", "coxaCm"]) if (!nulaOu(x[k], (v) => numero(v, 5, 300))) return `${k} fora de 5 a 300 cm`;
    return null;
  }
  if (colecao === "treinos") {
    if (!TIPOS_TREINO.includes(x.tipo)) return "tipo de treino desconhecido";
    if (!inteiro(x.minutos, 1, 1440)) return "duração fora de 1 a 1440 minutos";
    return nulaOu(x.esforco, (v) => inteiro(v, 1, 5)) ? null : "esforço fora de 1 a 5";
  }
  if (colecao === "lancamentos") {
    if (x.tipo !== "receita" && x.tipo !== "despesa") return "tipo de lançamento inválido";
    if (!inteiro(x.centavos, 1, 1e11)) return "valor inválido";
    const cats = x.tipo === "receita" ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA;
    if (!cats.includes(x.categoria)) return "categoria desconhecida";
    return typeof (x.descricao ?? "") === "string" && (x.descricao ?? "").length <= 120 ? null : "descrição longa demais";
  }
  return "coleção desconhecida";
}

export function validar(d) {
  const erros = [];
  if (!d || typeof d !== "object") return { ok: false, erros: ["o arquivo não é um objeto"] };
  if (d.versao !== VERSAO) erros.push(`versão ${d.versao} não é a ${VERSAO}`);
  if (!inteiro(d.prox, 1, 1e9)) erros.push("contador de ids inválido");
  const p = d.perfil;
  if (!p || (p.sexo !== "" && p.sexo !== "m" && p.sexo !== "f") || !nulaOu(p.alturaCm, (v) => numero(v, 80, 250))) erros.push("perfil inválido");
  const m = d.metas;
  if (!m || !nulaOu(m.pesoKg, (v) => numero(v, 20, 500)) || !inteiro(m.treinosSemana, 1, 14) || !numero(m.poupancaPct, 0, 100) || !nulaOu(m.reservaAlvo, (v) => inteiro(v, 1, 1e12)) || !inteiro(m.reservaAtual ?? 0, 0, 1e12)) erros.push("metas inválidas");
  if (!d.orcamento || typeof d.orcamento !== "object" || Object.entries(d.orcamento).some(([c, v]) => !CATEGORIAS_DESPESA.includes(c) || !inteiro(v, 1, 1e11))) erros.push("orçamento inválido");
  const ids = new Set();
  for (const c of COLECOES) {
    if (!Array.isArray(d[c])) { erros.push(`${c} não é uma lista`); continue; }
    for (const x of d[c]) {
      const e = validarItem(c, x);
      if (e) { erros.push(`${c}: ${e}`); break; }
      if (ids.has(x.id)) { erros.push(`${c}: id repetido ${x.id}`); break; }
      ids.add(x.id);
      if (x.id >= d.prox) { erros.push(`${c}: id ${x.id} maior que o contador`); break; }
    }
  }
  return { ok: erros.length === 0, erros };
}

export function importarJSON(texto) {
  let d;
  try { d = JSON.parse(texto); } catch { return { ok: false, erros: ["o arquivo não é JSON válido"] }; }
  const v = validar(d);
  return v.ok ? { ok: true, dados: d } : v;
}
export const exportarJSON = (d) => JSON.stringify(d, null, 1);

// Adicionar e remover devolvem um objeto novo: o estado antigo nunca é mexido (dá para desfazer e testar).
export function adicionar(d, colecao, item) {
  const novo = { ...item, id: d.prox };
  const e = validarItem(colecao, novo);
  if (e) throw new Error(e);
  return { ...d, prox: d.prox + 1, [colecao]: [...d[colecao], novo].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.id - b.id)) };
}
export const remover = (d, colecao, id) => ({ ...d, [colecao]: d[colecao].filter((x) => x.id !== id) });
export const definir = (d, parte, valores) => ({ ...d, [parte]: { ...d[parte], ...valores } });

// CSV para planilha brasileira: separador ";", decimal com vírgula, texto entre aspas.
export function exportarCSV(lancs) {
  // Planilha executa célula que começa com = + - @: o apóstrofo a mantém como texto.
  const q = (s) => `"${String(s ?? "").replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`;
  const v = (c) => `${Math.floor(c / 100)},${String(c % 100).padStart(2, "0")}`;
  return ["data;tipo;categoria;valor;descricao", ...lancs.map((l) => [l.data, l.tipo, q(l.categoria), v(l.centavos), q(l.descricao)].join(";"))].join("\n");
}

export function carregar(armazem, chave = CHAVE) {
  try {
    const t = armazem.getItem(chave);
    if (!t) return vazio();
    const r = importarJSON(t);
    return r.ok ? r.dados : vazio();
  } catch { return vazio(); }
}
export function salvar(armazem, d, chave = CHAVE) {
  try { armazem.setItem(chave, exportarJSON(d)); return true; } catch { return false; }
}
// Só tocar em window.localStorage já pode lançar (cookies bloqueados): o acesso fica dentro do try.
export function armazemSeguro(global = globalThis) {
  try { const a = global.localStorage; if (a && typeof a.getItem === "function") return a; } catch { /* bloqueado */ }
  let memoria = {};
  return { getItem: (k) => (k in memoria ? memoria[k] : null), setItem: (k, v) => { memoria[k] = String(v); }, removeItem: (k) => { delete memoria[k]; }, mem: true };
}
