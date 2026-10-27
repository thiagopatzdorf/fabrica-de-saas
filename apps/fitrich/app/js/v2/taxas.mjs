// Aritmética comum do motor v2: dinheiro em CENTAVOS inteiros, taxas em BASIS POINTS inteiros
// (1 bp = 0,01 %; 1365 bp = 13,65 %). Juros são calculados em ponto flutuante e arredondados
// UMA vez por período, half-up sobre o módulo: `Math.round(-2.5)` dá -2 em JavaScript, então
// arredondamos o valor absoluto e devolvemos o sinal. Nada aqui toca DOM, relógio ou rede.

// Half-up sobre o módulo: arredondar(2.5) = 3, arredondar(-2.5) = -3, arredondar(-2.4) = -2.
export function arredondar(valor) {
  const a = Math.round(Math.abs(valor));
  return valor < 0 ? -a : a;
}

export const ehInteiro = (v) => typeof v === "number" && Number.isSafeInteger(v);

// Taxa em bp → fração (1365 → 0.1365). Recusa taxa que não seja inteiro: 1,5 % é 150 bp, não 1.5.
export function fracaoDeBp(bp) {
  if (!ehInteiro(bp)) throw new RangeError("taxa_invalida");
  return bp / 10000;
}

export const bpDeFracao = (fracao) => arredondar(fracao * 10000);

// Juros negativos não existem em dívida nem em aplicação de renda fixa deste app: código, não cálculo.
export function exigirTaxaNaoNegativa(bp) {
  if (!ehInteiro(bp)) throw new RangeError("taxa_invalida");
  if (bp < 0) throw new RangeError("juros_negativos");
  return bp;
}

export function exigirCentavos(c) {
  if (!ehInteiro(c)) throw new RangeError("centavos_invalidos");
  return c;
}

export function exigirPrazo(n) {
  if (!ehInteiro(n) || n < 1) throw new RangeError("prazo_invalido");
  return n;
}

// Taxa ao ano → ao mês, SEMPRE geométrica: (1+a)^(1/12) − 1. Dividir por 12 superestima
// (13,65 %/12 = 1,1375 % contra 1,0720 % geométrico) e erra todo cálculo de juros compostos.
export const aaParaAm = (bpAa) => (1 + fracaoDeBp(bpAa)) ** (1 / 12) - 1;
export const amParaAa = (fracaoAm) => (1 + fracaoAm) ** 12 - 1;
export const aaParaAmBp = (bpAa) => bpDeFracao(aaParaAm(bpAa));

// Taxa real de Fisher: (1+nominal)/(1+inflação) − 1. Nunca "nominal − inflação" (erra 0,04 p.p. a.a.
// com os índices de hoje e cresce com inflação alta).
export const taxaReal = (fracaoNominal, fracaoInflacao) => (1 + fracaoNominal) / (1 + fracaoInflacao) - 1;

// Juros de um período sobre um saldo, já arredondados (o único arredondamento daquele período).
export const jurosDoPeriodo = (saldoCentavos, fracao) => arredondar(saldoCentavos * fracao);
