// Tributos da pessoa física como ESTIMATIVA: IRPF mensal 2026 com a redução da Lei 15.270/2025,
// DAS do MEI e o lembrete do carnê-leão. Nada aqui substitui a apuração oficial (aviso `estimativa`
// em toda saída). Centavos inteiros; a mesma lógica de `tests/referencia/salario-liquido.mjs`
// (que trabalha em reais), conferida por teste de conformidade — o app não importa aquele arquivo em runtime.
import { somarMeses, ultimoDiaDoMes, somarDias } from "../datas.mjs";
import { arredondar, exigirCentavos } from "./taxas.mjs";

// ✅ Receita Federal, tabela progressiva mensal a partir de jan/2026 (valores em centavos).
export const IRPF_2026 = Object.freeze({
  faixas: Object.freeze([
    { ateCentavos: 242880, aliquotaBp: 0, deduzirCentavos: 0 },
    { ateCentavos: 282665, aliquotaBp: 750, deduzirCentavos: 18216 },
    { ateCentavos: 375105, aliquotaBp: 1500, deduzirCentavos: 39416 },
    { ateCentavos: 466468, aliquotaBp: 2250, deduzirCentavos: 67549 },
    { ateCentavos: Infinity, aliquotaBp: 2750, deduzirCentavos: 90873 },
  ]),
  descontoSimplificadoCentavos: 60720,
  dependenteCentavos: 18959,
  // ✅ Lei 15.270/2025, art. 3º-A: rendimento ≤ 5.000,00 → redução igual ao imposto (zera);
  // 5.000,01 a 7.349,99 → 978,62 − 0,133145 × rendimento; ≥ 7.350,00 → nada. Vale também no 13º.
  reducao: Object.freeze({ zeraAteCentavos: 500000, fimCentavos: 735000, aCentavos: 97862, bMilionesimos: 133145 }),
});

// Imposto pela tabela (antes da redução), nunca negativo.
export function impostoTabela(baseCentavos, tabela = IRPF_2026) {
  if (baseCentavos <= 0) return { impostoCentavos: 0, faixa: tabela.faixas[0] };
  const faixa = tabela.faixas.find((f) => baseCentavos <= f.ateCentavos);
  return { impostoCentavos: Math.max(0, arredondar((baseCentavos * faixa.aliquotaBp) / 10000) - faixa.deduzirCentavos), faixa };
}

// Redução do art. 3º-A, em inteiros: (978,62 × 10⁶ − 133.145 × rendimento) / 10⁶ em centavos, half-up.
// Em ponto flutuante 978,62 − 0,133145 × 7.000 dá 46,60499… e cairia em 46,60; o valor exato é 46,605
// → 46,61 (mesma escolha do `salario-liquido.mjs`). Nunca passa do imposto: não gera restituição.
export function reducaoLei15270(rendimentoCentavos, impostoCentavos, tabela = IRPF_2026) {
  const r = tabela.reducao;
  let reducao = 0;
  if (rendimentoCentavos <= r.zeraAteCentavos) reducao = impostoCentavos;
  else if (rendimentoCentavos < r.fimCentavos) reducao = Math.max(0, arredondar((r.aCentavos * 1e6 - r.bMilionesimos * rendimentoCentavos) / 1e6));
  return Math.min(reducao, impostoCentavos);
}

// IRPF mensal estimado. `deducoesLegaisCentavos` = INSS + pensão (o que a pessoa já sabe); `modo`
// auto escolhe o menor imposto entre desconto simplificado e deduções legais. Casos (simplificado):
// 5.000 → 0,00; 6.000 → 394,54; 7.000 → 802,68; 7.350 → redução 0 (imposto cheio 945,54).
export function irpfMensal({ rendimentoCentavos, dependentes = 0, deducoesLegaisCentavos = 0, modo = "auto", decimoTerceiro = false }, tabela = IRPF_2026) {
  exigirCentavos(rendimentoCentavos); exigirCentavos(deducoesLegaisCentavos);
  if (rendimentoCentavos < 0 || deducoesLegaisCentavos < 0 || !Number.isInteger(dependentes) || dependentes < 0) throw new RangeError("valor_invalido");
  const baseLegal = Math.max(0, rendimentoCentavos - deducoesLegaisCentavos - dependentes * tabela.dependenteCentavos);
  const baseSimples = Math.max(0, rendimentoCentavos - Math.min(tabela.descontoSimplificadoCentavos, rendimentoCentavos));
  const legal = impostoTabela(baseLegal, tabela), simples = impostoTabela(baseSimples, tabela);
  const escolhido = modo === "auto" ? (simples.impostoCentavos < legal.impostoCentavos ? "simplificado" : "legal") : modo;
  if (escolhido !== "simplificado" && escolhido !== "legal") throw new RangeError("modo_invalido");
  const sel = escolhido === "simplificado" ? simples : legal;
  const reducao = reducaoLei15270(rendimentoCentavos, sel.impostoCentavos, tabela);
  const imposto = sel.impostoCentavos - reducao;
  return {
    modo: escolhido, baseCentavos: escolhido === "simplificado" ? baseSimples : baseLegal, faixaAliquotaBp: sel.faixa.aliquotaBp,
    impostoTabelaCentavos: sel.impostoCentavos, reducaoCentavos: reducao, impostoCentavos: imposto,
    aliquotaEfetivaBp: rendimentoCentavos > 0 ? Math.round((imposto / rendimentoCentavos) * 10000) : 0,
    avisos: decimoTerceiro ? ["estimativa", "decimo_terceiro_tributado_em_separado"] : ["estimativa"],
  };
}

// ⚠️ DAS do MEI 2026: INSS 5 % do salário mínimo (R$ 1.621,00 → 81,05) + R$ 1 de ICMS (comércio/
// indústria) e/ou R$ 5 de ISS (serviços): 82,05 / 86,05 / 87,05. Salário mínimo e regra conferidos em
// fonte secundária na pesquisa (LC 123/2006, art. 18-A, § 3º, V; Decreto 12.797/2025) — por isso ⚠️.
export const SALARIO_MINIMO_2026_CENTAVOS = 162100;
export function dasMei({ atividade, salarioMinimoCentavos = SALARIO_MINIMO_2026_CENTAVOS }) {
  exigirCentavos(salarioMinimoCentavos);
  const inss = arredondar(salarioMinimoCentavos * 0.05);
  const icms = atividade === "comercio_industria" || atividade === "ambos" ? 100 : 0;
  const iss = atividade === "servicos" || atividade === "ambos" ? 500 : 0;
  if (!icms && !iss) throw new RangeError("atividade_invalida");
  return { inssCentavos: inss, icmsCentavos: icms, issCentavos: iss, totalCentavos: inss + icms + iss, avisos: ["fonte_secundaria", "estimativa"] };
}

// Carnê-leão só como LEMBRETE: quem recebe de pessoa física ou do exterior recolhe por DARF código
// 0190 até o último dia útil do mês seguinte. O cálculo em si não é feito aqui (depende de livro-caixa
// e deduções que o app não tem). `ehDiaUtil` injetável: sem feriados (área 2), só fim de semana.
const semFimDeSemana = (iso) => { const d = new Date(iso + "T00:00:00Z").getUTCDay(); return d !== 0 && d !== 6; };
export function lembreteCarneLeao(ymRendimento, { ehDiaUtil = semFimDeSemana } = {}) {
  if (!/^\d{4}-\d{2}$/.test(ymRendimento)) throw new RangeError("ym_invalido");
  let venc = ultimoDiaDoMes(somarMeses(ymRendimento, 1));
  while (!ehDiaUtil(venc)) venc = somarDias(venc, -1);
  return { codigo: "lembrete", darf: "0190", competencia: ymRendimento, vencimento: venc, avisos: ehDiaUtil === semFimDeSemana ? ["feriados_nao_considerados"] : [] };
}
