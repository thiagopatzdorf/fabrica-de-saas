// REFERÊNCIA DE TESTE: implementação independente (de outro projeto) usada só para conferir, nos testes,
// que o Fitrich calcula o imposto de renda do mesmo jeito. Não é importada pelo app.
// Conta do salário líquido CLT 2026, sem DOM (roda igual no navegador e em
// `node --test`). Todo número oficial vive em TABELAS_2026; a página mostra
// os mesmos valores e a fonte de cada um.

// Arredonda para centavos sem o erro de ponto flutuante (1.005 -> 1.01).
function arredondarCentavos(valor) {
  const numero = Number(valor);
  const centavos = Math.round(Number((Math.abs(numero) * 100).toPrecision(15)));
  return (Math.sign(numero) * centavos) / 100 || 0;
}

export const TABELAS_2026 = Object.freeze({
  // Portaria Interministerial MPS/MF nº 13, de 09/01/2026 (Anexo II).
  // Faixas do salário de contribuição; a alíquota vale só para a fatia.
  inssFaixas: Object.freeze([
    { ate: 1621.0, aliquota: 0.075 },
    { ate: 2902.84, aliquota: 0.09 },
    { ate: 4354.27, aliquota: 0.12 },
    { ate: 8475.55, aliquota: 0.14 },
  ]),
  inssTeto: 8475.55,
  // Receita Federal, tabela mensal de jan/2026 em diante.
  irrfFaixas: Object.freeze([
    { ate: 2428.8, aliquota: 0, deduzir: 0 },
    { ate: 2826.65, aliquota: 0.075, deduzir: 182.16 },
    { ate: 3751.05, aliquota: 0.15, deduzir: 394.16 },
    { ate: 4664.68, aliquota: 0.225, deduzir: 675.49 },
    { ate: Infinity, aliquota: 0.275, deduzir: 908.73 },
  ]),
  dependente: 189.59,
  descontoSimplificado: 607.2,
  // Lei 15.270/2025: redutor mensal sobre o imposto.
  redutorTeto: 312.89, // até R$ 5.000,00 o redutor zera o imposto (máx. 312,89)
  redutorAte: 5000.0,
  redutorFimFaixa: 7350.0, // a partir daqui não há redução
  redutorA: 978.62, // entre os dois: 978,62 - 0,133145 x rendimento
  redutorB: 0.133145,
});

/** INSS progressivo: cada alíquota só vale para a fatia do salário dentro da
 * sua faixa; acima do teto, a contribuição para de crescer. */
export function calcularINSS(bruto, tabelas = TABELAS_2026) {
  const base = Math.min(Math.max(bruto, 0), tabelas.inssTeto);
  let anterior = 0;
  let total = 0;
  const faixas = [];
  for (const f of tabelas.inssFaixas) {
    const fatia = Math.max(Math.min(base, f.ate) - anterior, 0);
    const valor = fatia * f.aliquota;
    faixas.push({ de: anterior, ate: f.ate, aliquota: f.aliquota, fatia, valor });
    total += valor;
    anterior = f.ate;
  }
  return { valor: arredondarCentavos(total), faixas, limitadoNoTeto: bruto > tabelas.inssTeto };
}

/** Imposto pela tabela progressiva (antes do redutor), nunca negativo. */
export function impostoTabela(base, tabelas = TABELAS_2026) {
  if (!(base > 0)) return { imposto: 0, faixa: tabelas.irrfFaixas[0] };
  const faixa = tabelas.irrfFaixas.find((f) => base <= f.ate);
  const imposto = Math.max(base * faixa.aliquota - faixa.deduzir, 0);
  return { imposto: arredondarCentavos(imposto), faixa };
}

/** Redutor da Lei 15.270/2025. `rendimento` é o rendimento tributável bruto
 * do mês (antes do INSS). Nunca passa do imposto: não gera restituição. */
export function redutor(rendimento, imposto, tabelas = TABELAS_2026) {
  let r = 0;
  if (rendimento <= tabelas.redutorAte) r = tabelas.redutorTeto;
  else if (rendimento < tabelas.redutorFimFaixa) {
    // Conta em inteiros (1e-8 real): em ponto flutuante 978,62 - 0,133145 x 7000
    // dá 46,60499... e arredonda para 46,60 em vez de 46,61.
    const centavos = Math.round(rendimento * 100);
    r = (Math.round(tabelas.redutorA * 1e8) - Math.round(tabelas.redutorB * 1e6) * centavos) / 1e8;
  }
  r = arredondarCentavos(Math.max(r, 0));
  return Math.min(r, imposto);
}

/**
 * Salário líquido. p = { bruto, dependentes, pensao, outros, modo }
 * modo: "auto" (o mais vantajoso), "legal" (INSS + dependentes + pensão)
 * ou "simplificado" (desconto simplificado no lugar das deduções legais).
 * `outros` (vale-transporte, plano de saúde, adiantamento...) só reduz o
 * líquido; não muda a base do IRRF.
 */
export function calcular(p, tabelas = TABELAS_2026) {
  const bruto = Number(p.bruto) || 0;
  if (bruto < 0) throw new Error("Salário bruto não pode ser negativo.");
  const dependentes = Math.max(Math.floor(Number(p.dependentes) || 0), 0);
  const pensao = Math.max(Number(p.pensao) || 0, 0);
  const outros = Math.max(Number(p.outros) || 0, 0);
  const modo = p.modo || "auto";

  const inss = calcularINSS(bruto, tabelas);
  const deducaoDep = arredondarCentavos(dependentes * tabelas.dependente);
  const baseLegal = Math.max(bruto - inss.valor - deducaoDep - pensao, 0);
  const baseSimples = Math.max(bruto - Math.min(tabelas.descontoSimplificado, bruto), 0);
  const legal = impostoTabela(baseLegal, tabelas);
  const simples = impostoTabela(baseSimples, tabelas);

  let escolhido = modo;
  if (modo === "auto") escolhido = simples.imposto < legal.imposto ? "simplificado" : "legal";
  const sel = escolhido === "simplificado" ? simples : legal;
  const base = escolhido === "simplificado" ? baseSimples : baseLegal;
  const red = redutor(bruto, sel.imposto, tabelas);
  const irrf = arredondarCentavos(sel.imposto - red);
  const liquido = arredondarCentavos(bruto - inss.valor - irrf - pensao - outros);

  return {
    bruto, dependentes, deducaoDep, pensao, outros,
    inss, modo: escolhido, baseLegal: arredondarCentavos(baseLegal), baseSimples: arredondarCentavos(baseSimples),
    base: arredondarCentavos(base), faixa: sel.faixa, impostoTabela: sel.imposto,
    impostoLegal: legal.imposto, impostoSimplificado: simples.imposto,
    redutor: red, irrf, liquido,
    totalDescontos: arredondarCentavos(bruto - liquido),
  };
}
