// Feriados nacionais e dias úteis, por ano, sem rede: fixos por lei + móveis derivados da Páscoa.
// O app promete que nada sai do aparelho, então a lista é calculada, não baixada.
//
// A função `pascoa` é conferida contra uma implementação independente em tests/referencia/dias-uteis.mjs
// (o app é só a pasta app/ e não importa nada de fora em runtime). O teste confere as duas
// contra as mesmas datas.
//
// Fora daqui, de propósito: feriado estadual e municipal (varia por cidade). Quem precisa passa em
// `feriadosExtras`. Carnaval (seg/ter) e Corpus Christi são ponto facultativo na lei, mas param o
// país e não há liquidação bancária (calendário ANBIMA): entram por padrão (`facultativos`).
import { somarDias, ultimoDiaDoMes } from "../datas.mjs";

// Domingo de Páscoa (gregoriano), algoritmo anônimo de Meeus/Jones/Butcher; vale de 1583 em diante.
export function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// [mês, dia, código]. Códigos, não nomes: o texto vem da UI via t().
const FIXOS = [
  [1, 1, "confraternizacao"], [4, 21, "tiradentes"], [5, 1, "trabalho"], [9, 7, "independencia"],
  [10, 12, "aparecida"], [11, 2, "finados"], [11, 15, "republica"], [12, 25, "natal"],
];
const ANO_CONSCIENCIA_NEGRA = 2024; // Lei 14.759/2023

export function feriadosDoAno(ano, { facultativos = true } = {}) {
  if (!Number.isInteger(ano) || ano < 1900 || ano > 2200) throw new RangeError(`ano fora de 1900-2200: ${ano}`);
  const iso = (m, d) => `${ano}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const lista = FIXOS.map(([m, d, codigo]) => ({ data: iso(m, d), codigo, tipo: "fixo", facultativo: false }));
  if (ano >= ANO_CONSCIENCIA_NEGRA) lista.push({ data: iso(11, 20), codigo: "consciencia_negra", tipo: "fixo", facultativo: false });
  const p = pascoa(ano);
  lista.push({ data: somarDias(p, -2), codigo: "sexta_santa", tipo: "movel", facultativo: false });
  if (facultativos) {
    lista.push({ data: somarDias(p, -48), codigo: "carnaval_segunda", tipo: "movel", facultativo: true });
    lista.push({ data: somarDias(p, -47), codigo: "carnaval_terca", tipo: "movel", facultativo: true });
    lista.push({ data: somarDias(p, 60), codigo: "corpus_christi", tipo: "movel", facultativo: true });
  }
  return lista.sort((x, y) => (x.data < y.data ? -1 : 1));
}

const cache = new Map();
function ehFeriado(iso, facultativos) {
  const chave = `${iso.slice(0, 4)}:${facultativos}`;
  if (!cache.has(chave)) cache.set(chave, new Set(feriadosDoAno(Number(iso.slice(0, 4)), { facultativos }).map((f) => f.data)));
  return cache.get(chave).has(iso);
}

export const diaDaSemana = (iso) => new Date(iso + "T00:00:00Z").getUTCDay(); // 0 = domingo

// Domingo nunca é útil; sábado só com `sabadoUtil`; feriado nunca, mesmo no sábado.
export function ehDiaUtil(iso, { sabadoUtil = false, feriadosExtras = [], facultativos = true } = {}) {
  const dow = diaDaSemana(iso);
  if (dow === 0 || (dow === 6 && !sabadoUtil)) return false;
  return !ehFeriado(iso, facultativos) && !feriadosExtras.includes(iso);
}

// `n` dias úteis depois de `iso` (negativo: antes). O dia de partida não conta; n = 0 devolve `iso`.
export function somarDiasUteis(iso, n, opcoes = {}) {
  if (!Number.isInteger(n) || Math.abs(n) > 100000) throw new RangeError("n inteiro, até 100000 dias úteis");
  const passo = n < 0 ? -1 : 1;
  let atual = iso, restam = Math.abs(n);
  while (restam > 0) {
    atual = somarDias(atual, passo);
    if (ehDiaUtil(atual, opcoes)) restam--;
  }
  return atual;
}

// Primeiro dia útil em `iso` ou depois dele (`iso` útil devolve `iso`).
export const proximoDiaUtil = (iso, opcoes = {}) => (ehDiaUtil(iso, opcoes) ? iso : somarDiasUteis(iso, 1, opcoes));
// Último dia útil em `iso` ou antes dele.
export const diaUtilAnterior = (iso, opcoes = {}) => (ehDiaUtil(iso, opcoes) ? iso : somarDiasUteis(iso, -1, opcoes));

// N-ésimo dia útil do mês "AAAA-MM" (5º dia útil de fev/2026 → 2026-02-06). null se o mês não tem tantos.
export function enesimoDiaUtilDoMes(ym, n, opcoes = {}) {
  if (!Number.isInteger(n) || n < 1) throw new RangeError("n precisa ser inteiro ≥ 1");
  const ultimo = ultimoDiaDoMes(ym);
  let atual = `${ym}-01`, conta = 0;
  while (atual <= ultimo) {
    if (ehDiaUtil(atual, opcoes) && ++conta === n) return atual;
    atual = somarDias(atual, 1);
  }
  return null;
}
