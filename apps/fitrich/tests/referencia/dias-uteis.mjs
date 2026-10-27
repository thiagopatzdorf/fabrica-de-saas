// REFERÊNCIA DE TESTE: implementação independente (de outro projeto) usada só para conferir, nos testes,
// que o Fitrich calcula a Páscoa e o salário líquido do mesmo jeito. Não é importada pelo app.
// Dias úteis no Brasil: feriados nacionais fixos e móveis (a Páscoa vem do
// algoritmo de Gauss/Meeus), contagem entre duas datas e "data daqui a N dias
// úteis". Sem DOM e sem relógio.
//
// O que NÃO está aqui, de propósito: feriado estadual e municipal (varia por
// lugar e muda por lei local). Quem precisa informa à mão em `extras`.

import { diaDaSemana, diferencaDias, lerData, nomeDoDia, paraISO, somarDias } from "./datas.mjs";

export const ANO_MIN = 1900;
export const ANO_MAX = 2200;

/** Domingo de Páscoa (calendário gregoriano) em ISO. Algoritmo anônimo de
 * Meeus/Jones/Butcher, o mesmo resultado do método de Gauss; vale de 1583 em
 * diante, e os anos aceitos aqui ficam dentro disso. */
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
  return paraISO({ a: ano, m: mes, d: dia });
}

// [mês, dia, nome]. Consciência Negra virou feriado nacional em 2024 (Lei 14.759/2023).
const FIXOS = [
  [1, 1, "Confraternização Universal"],
  [4, 21, "Tiradentes"],
  [5, 1, "Dia do Trabalho"],
  [9, 7, "Independência do Brasil"],
  [10, 12, "Nossa Senhora Aparecida"],
  [11, 2, "Finados"],
  [11, 15, "Proclamação da República"],
  [12, 25, "Natal"],
];
const CONSCIENCIA_NEGRA = [11, 20, "Dia da Consciência Negra"];
const ANO_CONSCIENCIA_NEGRA = 2024;

function exigirAno(ano) {
  if (!Number.isInteger(ano) || ano < ANO_MIN || ano > ANO_MAX) {
    throw new RangeError(`ano fora de ${ANO_MIN}-${ANO_MAX}: ${ano}`);
  }
}

/** Feriados nacionais do ano, em ordem de data.
 * `facultativos` (padrão true) inclui Carnaval (segunda e terça) e Corpus
 * Christi, que na lei são ponto facultativo mas param a maior parte do país;
 * Sexta-feira Santa é feriado de verdade (Lei 662/1949 e 10.607/2002).
 * Cada item: { data, nome, tipo: "fixo"|"movel", facultativo }. */
export function feriadosDoAno(ano, { facultativos = true } = {}) {
  exigirAno(ano);
  const lista = FIXOS.map(([m, d, nome]) => ({ data: paraISO({ a: ano, m, d }), nome, tipo: "fixo", facultativo: false }));
  if (ano >= ANO_CONSCIENCIA_NEGRA) {
    const [m, d, nome] = CONSCIENCIA_NEGRA;
    lista.push({ data: paraISO({ a: ano, m, d }), nome, tipo: "fixo", facultativo: false });
  }
  const p = pascoa(ano);
  lista.push({ data: somarDias(p, -2), nome: "Sexta-feira Santa", tipo: "movel", facultativo: false });
  if (facultativos) {
    lista.push({ data: somarDias(p, -48), nome: "Carnaval (segunda-feira)", tipo: "movel", facultativo: true });
    lista.push({ data: somarDias(p, -47), nome: "Carnaval (terça-feira)", tipo: "movel", facultativo: true });
    lista.push({ data: somarDias(p, 60), nome: "Corpus Christi", tipo: "movel", facultativo: true });
  }
  return lista.sort((x, y) => (x.data < y.data ? -1 : 1));
}

/** Monta o consultor de feriados de uma configuração: guarda os anos já
 * calculados e junta os feriados informados à mão (`extras`: lista ISO). */
function calendario({ facultativos = true, extras = [] } = {}) {
  const cache = new Map();
  const maos = new Map();
  for (const iso of extras) {
    if (!lerData(iso)) throw new RangeError(`data inválida em extras: ${iso}`);
    maos.set(iso, "Feriado informado");
  }
  return function feriadoEm(iso) {
    const ano = lerData(iso).a;
    if (!cache.has(ano)) {
      const m = new Map();
      for (const f of feriadosDoAno(ano, { facultativos })) m.set(f.data, f.nome);
      cache.set(ano, m);
    }
    return cache.get(ano).get(iso) ?? maos.get(iso) ?? null;
  };
}

/** Por que o dia não conta (texto), ou null se é dia útil. Domingo nunca é
 * útil; sábado só se `sabadoUtil`; feriado nunca, mesmo caindo no sábado. */
function motivoDeFolga(iso, feriadoEm, sabadoUtil) {
  const dow = diaDaSemana(iso);
  const feriado = feriadoEm(iso);
  if (feriado) return feriado;
  if (dow === 0) return "Domingo";
  if (dow === 6 && !sabadoUtil) return "Sábado";
  return null;
}

export function ehDiaUtil(iso, opcoes = {}) {
  return motivoDeFolga(iso, calendario(opcoes), !!opcoes.sabadoUtil) === null;
}

/** Dias úteis de `inicio` a `fim` (ISO, `fim` >= `inicio`).
 * `contarInicio` (padrão true): conta a data inicial se for útil, como o
 * DIAS.ÚTEIS do Excel/Planilhas. Com false a contagem começa no dia seguinte,
 * como em prazo de dias úteis ("a partir de amanhã"). O fim sempre entra.
 * Devolve também o que ficou de fora, para a conta poder ser conferida:
 * { uteis, corridos, folgas: [{ data, motivo, diaDaSemana }] }, onde `folgas`
 * são os dias do intervalo que não contaram (fins de semana e feriados). */
export function contarDiasUteis(inicio, fim, { sabadoUtil = false, facultativos = true, extras = [], contarInicio = true } = {}) {
  const corridosBrutos = diferencaDias(inicio, fim);
  if (corridosBrutos < 0) throw new RangeError("a data final vem antes da inicial");
  const feriadoEm = calendario({ facultativos, extras });
  const primeiro = contarInicio ? 0 : 1;
  let uteis = 0;
  const folgas = [];
  for (let i = primeiro; i <= corridosBrutos; i++) {
    const iso = somarDias(inicio, i);
    const motivo = motivoDeFolga(iso, feriadoEm, sabadoUtil);
    if (motivo === null) uteis++;
    else folgas.push({ data: iso, motivo, diaDaSemana: nomeDoDia(iso) });
  }
  return { uteis, corridos: corridosBrutos - primeiro + 1, folgas };
}

/** Data que cai `n` dias úteis depois de `inicio` (n negativo: antes). O dia
 * de partida não conta; n = 0 devolve o próprio `inicio`. Dias pulados vêm em
 * `pulados` com o motivo. Limite de 100 000 dias úteis, para o laço terminar. */
export function somarDiasUteis(inicio, n, { sabadoUtil = false, facultativos = true, extras = [] } = {}) {
  if (!Number.isInteger(n) || Math.abs(n) > 100000) throw new RangeError("n precisa ser inteiro, até 100000 dias úteis");
  const feriadoEm = calendario({ facultativos, extras });
  const passo = n < 0 ? -1 : 1;
  let restam = Math.abs(n);
  let atual = inicio;
  const pulados = [];
  while (restam > 0) {
    atual = somarDias(atual, passo);
    const ano = lerData(atual).a;
    if (ano < ANO_MIN || ano > ANO_MAX) throw new RangeError(`o cálculo saiu de ${ANO_MIN}-${ANO_MAX}`);
    const motivo = motivoDeFolga(atual, feriadoEm, sabadoUtil);
    if (motivo === null) restam--;
    else pulados.push({ data: atual, motivo, diaDaSemana: nomeDoDia(atual) });
  }
  return { data: atual, pulados, corridos: Math.abs(diferencaDias(inicio, atual)) };
}
