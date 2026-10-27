// Aritmética de datas compartilhada pelas calculadoras de prazo (dias úteis,
// dias entre datas, idade). Sem DOM e sem relógio: quem precisa de "hoje"
// recebe a data de fora, então o resultado é igual no navegador e no teste.
//
// Por que tudo é feito em UTC sobre texto ISO ("2026-10-05"): `new Date(y, m, d)`
// usa o fuso local, e num dia de horário de verão (o Brasil teve até 2019) a
// diferença entre duas meias-noites locais dá 23 ou 25 horas; dividir por 24 e
// arredondar para baixo perde um dia. Em UTC todo dia tem exatamente 86 400 000 ms.
// O módulo é servido tal qual, sem build (arquivo de referência).

const MS_DIA = 86400000;

export const NOMES_DIA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
export const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const pad = (n, t = 2) => String(n).padStart(t, "0");

export function bissexto(ano) {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}

export function diasNoMes(ano, mes) {
  return [31, bissexto(ano) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1];
}

/** "2026-10-05" ou "05/10/2026" -> { a, m, d }. Data que não existe (30/02,
 * 31/04, 29/02 de ano comum) devolve null: `Date` aceitaria e "rolaria" para
 * março, escondendo o erro de digitação. */
export function lerData(texto) {
  if (typeof texto !== "string") return null;
  const t = texto.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  let a, mes, d;
  if (m) { [a, mes, d] = [m[1], m[2], m[3]].map(Number); }
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) { [d, mes, a] = [m[1], m[2], m[3]].map(Number); }
  else return null;
  if (a < 1 || mes < 1 || mes > 12 || d < 1 || d > diasNoMes(a, mes)) return null;
  return { a, m: mes, d };
}

export function paraISO({ a, m, d }) {
  return `${pad(a, 4)}-${pad(m)}-${pad(d)}`;
}

/** Normaliza para ISO ou devolve null. */
export function normalizar(texto) {
  const l = lerData(texto);
  return l ? paraISO(l) : null;
}

function exigir(iso) {
  const l = lerData(iso);
  if (!l) throw new RangeError(`data inválida: ${iso}`);
  return l;
}

/** ISO -> número de dias desde 1970-01-01 (UTC). */
export function paraDias(iso) {
  const { a, m, d } = exigir(iso);
  // setUTCFullYear evita que anos 0-99 virem 1900-1999 em Date.UTC.
  const dt = new Date(0);
  dt.setUTCFullYear(a, m - 1, d);
  return Math.round(dt.getTime() / MS_DIA);
}

export function deDias(n) {
  const dt = new Date(n * MS_DIA);
  return paraISO({ a: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
}

export function somarDias(iso, n) {
  return deDias(paraDias(iso) + n);
}

/** Dias corridos de `a` até `b` (negativo se `b` é antes de `a`). */
export function diferencaDias(a, b) {
  return paraDias(b) - paraDias(a);
}

/** 0 = domingo ... 6 = sábado. */
export function diaDaSemana(iso) {
  return (((paraDias(iso) + 4) % 7) + 7) % 7; // 1970-01-01 foi quinta (4)
}

export function nomeDoDia(iso) {
  return NOMES_DIA[diaDaSemana(iso)];
}

export function formatarBR(iso) {
  const { a, m, d } = exigir(iso);
  return `${pad(d)}/${pad(m)}/${pad(a, 4)}`;
}

/** Soma meses mantendo o dia; se o mês de chegada não tem esse dia, cai no
 * último (31/01 + 1 mês = 28/02, ou 29/02 em ano bissexto). A conta é sempre
 * a partir da data original, nunca em cadeia: 31/01 + 2 meses = 31/03, e não
 * 28/02 + 1 mês = 28/03. */
export function somarMeses(iso, n) {
  const { a, m, d } = exigir(iso);
  const total = a * 12 + (m - 1) + n;
  const ano = Math.floor(total / 12);
  const mes = total - ano * 12 + 1;
  return paraISO({ a: ano, m: mes, d: Math.min(d, diasNoMes(ano, mes)) });
}

/** Diferença "de calendário" entre duas datas, `a` <= `b`: anos, meses e dias.
 * Acha o maior número de meses inteiros que cabe (somarMeses a partir de `a`)
 * e os dias que sobram. É a mesma convenção da idade: 31/01 até 01/03 = 1 mês
 * e 1 dia, porque 31/01 + 1 mês cai em 28/02. */
export function diferencaCalendario(a, b) {
  if (diferencaDias(a, b) < 0) throw new RangeError("a data final vem antes da inicial");
  const la = exigir(a), lb = exigir(b);
  let meses = (lb.a - la.a) * 12 + (lb.m - la.m);
  if (diferencaDias(somarMeses(a, meses), b) < 0) meses -= 1;
  const resto = diferencaDias(somarMeses(a, meses), b);
  return { anos: Math.floor(meses / 12), meses: meses % 12, dias: resto, mesesTotais: meses };
}

/** Texto livre (um por linha, vírgula ou ponto e vírgula) -> { datas, invalidas }.
 * Datas repetidas entram uma vez, em ordem. */
export function lerListaDatas(texto) {
  const datas = [], invalidas = [];
  for (const pedaco of String(texto || "").split(/[\n,;]+/)) {
    const t = pedaco.trim();
    if (!t) continue;
    const iso = normalizar(t);
    if (!iso) invalidas.push(t);
    else if (!datas.includes(iso)) datas.push(iso);
  }
  datas.sort();
  return { datas, invalidas };
}

/** Data de hoje (ISO) a partir de um Date, pelo calendário local de quem usa. */
export function hojeISO(agora = new Date()) {
  return paraISO({ a: agora.getFullYear(), m: agora.getMonth() + 1, d: agora.getDate() });
}
