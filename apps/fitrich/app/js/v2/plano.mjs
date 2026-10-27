// Planejamento e patrimônio a longo prazo. Reúne o que `metas`, `dividas`, `investimentos`, `patrimonio`
// e `indices` não faziam sozinhos: independência financeira com faixa (cenários + Monte Carlo
// determinístico), plano mensal "para onde vai cada real", reserva por estabilidade de renda, quitação
// com três métodos, comparador de renda fixa e marcos do patrimônio.
//
// Regras de casa: centavos inteiros, taxas em bp inteiros, juros arredondados UMA vez por período
// (half-up sobre o módulo, via `taxas.mjs`); nada aqui toca DOM, relógio, rede nem aleatório do navegador.
// As funções devolvem números e CÓDIGOS; a frase é da UI. Tudo é estimativa, nunca promessa.
// Pesquisa e decisões: docs/pesquisa-plano.md.
import { somarDias, somarMeses, mesDe } from "../datas.mjs";
import { aaParaAm, arredondar, bpDeFracao, exigirCentavos, exigirPrazo, exigirTaxaNaoNegativa, fracaoDeBp, jurosDoPeriodo, taxaReal } from "./taxas.mjs";
import { despesasDoMes, receitasDoMes } from "./lancamentos-soma.mjs";
import { simularQuitacao, quitarOuInvestir } from "./dividas.mjs";
import { rendimentoAteVencimento } from "./investimentos.mjs";
import { progressoMeta } from "./metas.mjs";
import { saldoDaConta } from "./esquema.mjs";

// ---------------------------------------------------------------------------------------------
// 1. Independência financeira
// ---------------------------------------------------------------------------------------------

// Taxas de retirada: 4 % (Bengen 1994 / Trinity 1998, base EUA, 30 anos), 3,5 % e 3 % como margens.
// Fora dos EUA a regra falha mais (Pfau 2010: 20 países) e o Brasil não tem 30 anos de histórico
// comparável: por isso o padrão do app é 3,5 %, não 4 %.
export const TAXAS_RETIRADA = Object.freeze([
  Object.freeze({ id: "classica", bp: 400 }),
  Object.freeze({ id: "conservadora", bp: 350 }),
  Object.freeze({ id: "prudente", bp: 300 }),
]);
export const RETIRADA_PADRAO_BP = 350;

// Patrimônio para viver da renda: despesa anual ÷ taxa de retirada. 5.000,00/mês a 4 % → 1.500.000,00;
// a 3,5 % → 1.714.285,71 (171.428.571 centavos, 6.000.000/0,035 = 171.428.571,43 → half-up).
export function alvoIndependencia({ despesaMensalCentavos, retiradaBp }) {
  exigirCentavos(despesaMensalCentavos);
  if (!Number.isInteger(retiradaBp) || retiradaBp < 1) throw new RangeError("retirada_invalida");
  return arredondar((despesaMensalCentavos * 12 * 10000) / retiradaBp);
}

// Taxa real líquida de HOJE de um título a 100 % do CDI, com IR de 15 % (prazo > 720 dias), contra o
// IPCA 12 m do snapshot: (1 + CDI·(1−IR)) / (1 + IPCA) − 1. Com os índices de 02/10/2026:
// 13,65 % × 0,85 = 11,6025 %; 1,116025 / 1,0422 − 1 = 7,0852 % → 709 bp. É um período atípico:
// serve de referência ao lado das taxas de projeção, nunca como a taxa de projeção.
export function taxaRealLiquidaHoje(indices, { irBp = 1500 } = {}) {
  const liquido = fracaoDeBp(indices.cdiBp) * (1 - fracaoDeBp(irBp));
  const fracao = taxaReal(liquido, fracaoDeBp(indices.ipca12Bp));
  return { fracao, bp: bpDeFracao(fracao) };
}

// Cenários de taxa REAL líquida a.a. (acima da inflação). Fixos de propósito: o juro real brasileiro
// de hoje não se projeta por décadas. A pessoa pode editar.
export const TAXAS_REAIS_PADRAO = Object.freeze({ pessimistaBp: 200, baseBp: 400, otimistaBp: 600 });

// Evolução mês a mês em termos REAIS (poder de compra de hoje): juros do mês sobre o saldo, arredondados,
// e o aporte entra no fim do mês. Aporte constante em valor real = acompanha a inflação.
// 0 de saldo, 1.000,00/mês, 12 meses, 0 % → 12.000,00 (1.200.000 centavos).
export function acumular({ patrimonioCentavos = 0, aporteMensalCentavos = 0, anos, taxaRealAaBp }) {
  exigirCentavos(patrimonioCentavos); exigirCentavos(aporteMensalCentavos); exigirPrazo(anos);
  exigirTaxaNaoNegativa(taxaRealAaBp);
  const i = aaParaAm(taxaRealAaBp);
  let saldo = patrimonioCentavos;
  const serie = [{ ano: 0, centavos: saldo }];
  for (let m = 1; m <= anos * 12; m++) {
    saldo += jurosDoPeriodo(saldo, i) + aporteMensalCentavos;
    if (m % 12 === 0) serie.push({ ano: m / 12, centavos: saldo });
  }
  return { serie, finalCentavos: saldo };
}

// Meses até o patrimônio alcançar o alvo, mesma recorrência de `acumular`. 0 se já alcançou; null se
// não alcança em `maxMeses` (50 anos): "não chega nesse ritmo" é resposta, não erro.
export function mesesAteAlvo({ patrimonioCentavos = 0, aporteMensalCentavos = 0, alvoCentavos, taxaRealAaBp, maxMeses = 600 }) {
  exigirCentavos(patrimonioCentavos); exigirCentavos(aporteMensalCentavos); exigirCentavos(alvoCentavos);
  exigirTaxaNaoNegativa(taxaRealAaBp);
  if (patrimonioCentavos >= alvoCentavos) return 0;
  const i = aaParaAm(taxaRealAaBp);
  let saldo = patrimonioCentavos;
  for (let m = 1; m <= maxMeses; m++) {
    saldo += jurosDoPeriodo(saldo, i) + aporteMensalCentavos;
    if (saldo >= alvoCentavos) return m;
  }
  return null;
}

// Três cenários lado a lado. `ordem` garante pessimista ≤ base ≤ otimista (taxas fora de ordem são erro
// de quem digitou, não um cenário).
export function cenarios({ patrimonioCentavos = 0, aporteMensalCentavos = 0, anos, alvoCentavos, taxas = TAXAS_REAIS_PADRAO }) {
  if (!(taxas.pessimistaBp <= taxas.baseBp && taxas.baseBp <= taxas.otimistaBp)) throw new RangeError("taxas_fora_de_ordem");
  return ["pessimista", "base", "otimista"].map((id) => {
    const taxaRealAaBp = taxas[`${id}Bp`];
    const r = acumular({ patrimonioCentavos, aporteMensalCentavos, anos, taxaRealAaBp });
    const meses = mesesAteAlvo({ patrimonioCentavos, aporteMensalCentavos, alvoCentavos, taxaRealAaBp });
    return { id, taxaRealAaBp, serie: r.serie, finalCentavos: r.finalCentavos, mesesAteAlvo: meses, alcancaNoHorizonte: meses != null && meses <= anos * 12 };
  });
}

// ---- PRNG e Monte Carlo ----------------------------------------------------------------------

// mulberry32 (Tommy Ettinger, domínio público): 32 bits de estado, só aritmética inteira, mesma sequência em
// qualquer motor JS. Semente fixa → mesma entrada, mesmo resultado.
export function mulberry32(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Normal padrão por Box–Muller; `1 − u` evita log(0).
export function normalPadrao(aleatorio) {
  const u1 = 1 - aleatorio(), u2 = aleatorio();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Percentil por posto mais próximo (nearest-rank) sobre lista ORDENADA: ceil(q·n) − 1. [1..10]: p10 = 1, p50 = 5, p90 = 9.
export function percentil(ordenada, q) {
  if (!ordenada.length) throw new RangeError("lista_vazia");
  return ordenada[Math.max(0, Math.min(ordenada.length - 1, Math.ceil(q * ordenada.length) - 1))];
}

export const SEMENTE_PADRAO = 20261005;
export const PERFIS_RISCO = Object.freeze({ conservador: 400, moderado: 800, arrojado: 1200 }); // volatilidade anual em bp
export const CAMINHOS_PADRAO = 1000;

// Monte Carlo do patrimônio em termos reais. Cada ano sorteia um retorno lognormal com MÉDIA igual à taxa
// real escolhida: R = exp(m + σZ) − 1, m = ln(1+μ) − σ²/2. Dentro do ano, 12 meses de juros (taxa mensal
// geométrica do retorno do ano) com aporte no fim do mês, arredondado por mês. Com σ = 0 o resultado é
// IDÊNTICO a `acumular` (teste). Devolve percentis 10/50/90 por ano e a fração de caminhos que alcança o alvo.
// ⚠️ Modelo ilustrativo: retornos independentes de um ano para o outro, sem caudas gordas e sem regime de crise.
export function monteCarlo({ patrimonioCentavos = 0, aporteMensalCentavos = 0, anos, taxaRealAaBp, volatilidadeBp, alvoCentavos = null, caminhos = CAMINHOS_PADRAO, semente = SEMENTE_PADRAO }) {
  exigirCentavos(patrimonioCentavos); exigirCentavos(aporteMensalCentavos); exigirPrazo(anos);
  exigirTaxaNaoNegativa(taxaRealAaBp); exigirTaxaNaoNegativa(volatilidadeBp);
  if (anos > 60) throw new RangeError("prazo_invalido");
  if (!Number.isInteger(caminhos) || caminhos < 10 || caminhos > 20000) throw new RangeError("caminhos_invalidos");
  const mu = fracaoDeBp(taxaRealAaBp), sigma = fracaoDeBp(volatilidadeBp);
  const m = Math.log(1 + mu) - (sigma * sigma) / 2;
  const alea = mulberry32(semente);
  const porAno = Array.from({ length: anos + 1 }, () => new Array(caminhos));
  let alcancou = 0;
  for (let c = 0; c < caminhos; c++) {
    let saldo = patrimonioCentavos;
    porAno[0][c] = saldo;
    for (let a = 1; a <= anos; a++) {
      const fator = sigma === 0 ? 1 + mu : Math.exp(m + sigma * normalPadrao(alea));
      const i = fator ** (1 / 12) - 1;
      for (let k = 0; k < 12; k++) saldo += jurosDoPeriodo(saldo, i) + aporteMensalCentavos;
      porAno[a][c] = saldo;
    }
    if (alvoCentavos != null && saldo >= alvoCentavos) alcancou++;
  }
  const faixa = porAno.map((v, ano) => {
    const o = Float64Array.from(v).sort();
    return { ano, p10Centavos: percentil(o, 0.1), p50Centavos: percentil(o, 0.5), p90Centavos: percentil(o, 0.9) };
  });
  return { semente, caminhos, taxaRealAaBp, volatilidadeBp, faixa, probAlvoBp: alvoCentavos == null ? null : Math.round((alcancou / caminhos) * 10000) };
}

// ---------------------------------------------------------------------------------------------
// 2. Marcos do patrimônio
// ---------------------------------------------------------------------------------------------

// Degraus em reais (viram centavos). Cada um é um ponto de passagem, não uma nota.
export const MARCOS_CENTAVOS = Object.freeze([10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000].map((r) => r * 100));

// "X % do caminho" entre o último marco alcançado e o próximo (o primeiro parte de zero).
// 37.500,00 → alcançou 25.000, próximo 50.000: (37.500 − 25.000)/(50.000 − 25.000) = 50 % (5000 bp).
// Patrimônio negativo conta como zero: o marco não pune dívida, só ainda não começou a contar.
export function marcos(patrimonioCentavos) {
  exigirCentavos(patrimonioCentavos);
  const p = Math.max(0, patrimonioCentavos);
  const alcancados = MARCOS_CENTAVOS.filter((m) => p >= m);
  const proximo = MARCOS_CENTAVOS.find((m) => p < m) ?? null;
  const anterior = alcancados.length ? alcancados[alcancados.length - 1] : 0;
  return {
    patrimonioCentavos: p,
    alcancados,
    anteriorCentavos: anterior,
    proximoCentavos: proximo,
    progressoBp: proximo == null ? 10000 : Math.round(((p - anterior) / (proximo - anterior)) * 10000),
    faltaCentavos: proximo == null ? 0 : proximo - p,
  };
}

// Progresso até o alvo de independência, em bp, travado em 100 %.
export const progressoAlvoBp = (patrimonioCentavos, alvoCentavos) => (alvoCentavos > 0 ? Math.min(10000, Math.round((Math.max(0, patrimonioCentavos) / alvoCentavos) * 10000)) : null);

// ---------------------------------------------------------------------------------------------
// 3. Reserva de emergência por estabilidade de renda
// ---------------------------------------------------------------------------------------------

// Faixas em MEIOS-MESES (inteiros): 6 = 3 meses, 9 = 4,5 meses. CLT 3–6 e autônomo 6–12 são as de
// `metas.sugestaoCobertura` (seguro-desemprego, aviso prévio e FGTS existem só no CLT).
export const FAIXAS_RESERVA = Object.freeze({
  estavel: Object.freeze({ minMeios: 6, maxMeios: 8 }), // servidor/estabilidade em lei: 3 a 4 meses
  clt: Object.freeze({ minMeios: 6, maxMeios: 12 }), // 3 a 6
  variavel: Object.freeze({ minMeios: 12, maxMeios: 18 }), // comissão, bônus grande: 6 a 9
  autonomo: Object.freeze({ minMeios: 12, maxMeios: 24 }), // autônomo, MEI, empresário: 6 a 12
});

// Alvo = ponto médio da faixa; dependentes e renda única da casa empurram +1 mês cada, até o teto.
// CLT (4,5) com dependentes e renda única → 6,5 → trava em 6. Reserva = despesa × alvo (em meios ÷ 2).
export function reservaPlano({ despesaMensalCentavos, atualCentavos = 0, estabilidade, dependentes = false, rendaUnica = false }) {
  exigirCentavos(despesaMensalCentavos); exigirCentavos(atualCentavos);
  const faixa = FAIXAS_RESERVA[estabilidade];
  if (!faixa) throw new RangeError("estabilidade_invalida");
  const medio = (faixa.minMeios + faixa.maxMeios) / 2;
  const alvoMeios = Math.min(faixa.maxMeios, Math.round(medio) + (dependentes ? 2 : 0) + (rendaUnica ? 2 : 0));
  const alvoCentavos = arredondar((despesaMensalCentavos * alvoMeios) / 2);
  return {
    faixa, alvoMeios, alvoCentavos,
    minimoCentavos: arredondar((despesaMensalCentavos * faixa.minMeios) / 2),
    faltaCentavos: Math.max(0, alvoCentavos - atualCentavos),
    // Cobertura atual em meios-meses (arredondada para baixo: não prometer cobertura que não existe).
    coberturaMeios: despesaMensalCentavos > 0 ? Math.floor((atualCentavos * 2) / despesaMensalCentavos) : null,
    progressoBp: alvoCentavos > 0 ? Math.min(10000, Math.round((atualCentavos / alvoCentavos) * 10000)) : null,
    codigo: atualCentavos >= alvoCentavos ? "completa" : atualCentavos >= arredondar((despesaMensalCentavos * faixa.minMeios) / 2) ? "na_faixa" : "abaixo_da_faixa",
  };
}

// Média mensal de despesa nos `meses` últimos meses COMPLETOS antes de `ymAtual` (o corrente está pela
// metade). `categoriaIds` opcional. Mês sem despesa não entra na média; null sem nenhum mês.
export function despesaMedia(lancamentos, ymAtual, { meses = 3, categoriaIds } = {}) {
  const valores = [];
  for (let k = 1; k <= meses; k++) {
    const v = despesasDoMes(lancamentos, somarMeses(ymAtual, -k), categoriaIds ? { categoriaIds } : {});
    if (v > 0) valores.push(v);
  }
  return valores.length ? arredondar(valores.reduce((s, v) => s + v, 0) / valores.length) : null;
}

export function receitaMedia(lancamentos, ymAtual, { meses = 3 } = {}) {
  const valores = [];
  for (let k = 1; k <= meses; k++) { const v = receitasDoMes(lancamentos, somarMeses(ymAtual, -k)); if (v > 0) valores.push(v); }
  return valores.length ? arredondar(valores.reduce((s, v) => s + v, 0) / valores.length) : null;
}

// ---------------------------------------------------------------------------------------------
// 4. Plano mensal: "para onde vai cada real"
// ---------------------------------------------------------------------------------------------

// Ponto de partida 50/30/20 (Warren & Tyagi, 2005), em centavos. Só referência para comparar.
export function cinquentaTrintaVinteDe(rendaCentavos) {
  exigirCentavos(rendaCentavos);
  const necessidades = arredondar(rendaCentavos * 0.5), desejos = arredondar(rendaCentavos * 0.3);
  return { necessidadesCentavos: necessidades, desejosCentavos: desejos, futuroCentavos: rendaCentavos - necessidades - desejos };
}

export const PISO_DESEJOS_BP = 1000;
export const TETO_DESEJOS_BP = 3000;

// Distribui a renda. A soma das linhas é SEMPRE a renda (o que não tem destino vai para investimento).
//
// Ordem e porquê (cada linha leva um `motivo` que a UI traduz):
//  1 necessidades      — o que mantém a casa de pé vem antes de qualquer meta
//  2 minimos_divida    — parcela mínima é contrato; atrasar custa mais que qualquer rendimento
//  3 desejos           — 3/5 do que sobra depois das necessidades (a proporção 30:20 do 50/30/20), no máx. 30 %
//                        da renda; se os mínimos apertam, o lazer só encolhe o que for preciso
//  futuro (o resto), em cascata:
//  4 colchao           — 1 mês de despesa essencial antes de atacar dívida: sem colchão, a 1ª surpresa volta ao rotativo
//  5 divida_cara       — dívida com juro acima do rendimento líquido da renda fixa, maior taxa primeiro
//  6 reserva           — completa a reserva até a meta de meses
//  7 meta (cada uma)   — o aporte mensal que a meta com prazo pede
//  8 investimento      — o resto, rumo à independência
// Sem renda que cubra necessidades + mínimos: código `renda_nao_cobre` e só as linhas obrigatórias.
export function planoMensal({ rendaCentavos, necessidadesCentavos = null, minimosDividaCentavos = 0, colchaoFaltaCentavos = 0, reservaFaltaCentavos = 0, dividasCaras = [], metas = [] }) {
  exigirCentavos(rendaCentavos); exigirCentavos(minimosDividaCentavos); exigirCentavos(colchaoFaltaCentavos); exigirCentavos(reservaFaltaCentavos);
  if (rendaCentavos <= 0) throw new RangeError("renda_invalida");
  const avisos = [];
  let necessidades = necessidadesCentavos;
  if (necessidades == null) { necessidades = arredondar(rendaCentavos * 0.5); avisos.push("sem_historico_usando_50"); }
  exigirCentavos(necessidades);
  const linhas = [];
  const linha = (id, grupo, centavos, motivo, extra = {}) => linhas.push({ id, grupo, centavos, bp: Math.round((centavos / rendaCentavos) * 10000), motivo, ...extra });

  const obrigatorio = necessidades + minimosDividaCentavos;
  if (obrigatorio > rendaCentavos) {
    linha("necessidades", "essencial", necessidades, "necessidades");
    linha("minimos_divida", "essencial", minimosDividaCentavos, "minimos_divida");
    return { codigo: "renda_nao_cobre", rendaCentavos, deficitCentavos: obrigatorio - rendaCentavos, linhas, avisos, totalCentavos: obrigatorio, referencia: cinquentaTrintaVinteDe(rendaCentavos) };
  }
  const resto = rendaCentavos - necessidades;
  let desejos = Math.min(arredondar((resto * 3) / 5), arredondar((rendaCentavos * TETO_DESEJOS_BP) / 10000));
  if (resto - desejos < minimosDividaCentavos) desejos = resto - minimosDividaCentavos;
  if ((desejos / rendaCentavos) * 10000 < PISO_DESEJOS_BP) avisos.push("desejos_abaixo_do_piso");
  let disponivel = resto - desejos - minimosDividaCentavos;
  linha("necessidades", "essencial", necessidades, "necessidades");
  linha("minimos_divida", "essencial", minimosDividaCentavos, "minimos_divida");
  linha("desejos", "desejo", desejos, "desejos");

  const tira = (quer) => { const v = Math.max(0, Math.min(quer, disponivel)); disponivel -= v; return v; };
  const colchao = tira(colchaoFaltaCentavos);
  linha("colchao", "futuro", colchao, "colchao");
  for (const d of dividasCaras) linha(`divida:${d.id}`, "futuro", tira(d.saldoCentavos), "divida_cara", { nome: d.nome, ref: d.id });
  const reserva = tira(Math.max(0, reservaFaltaCentavos - colchaoFaltaCentavos));
  linha("reserva", "futuro", reserva, "reserva");
  for (const m of metas) linha(`meta:${m.id}`, "futuro", tira(m.aporteCentavos), "meta", { nome: m.nome, ref: m.id });
  linha("investimento", "futuro", disponivel, "investimento");
  return { codigo: "ok", rendaCentavos, deficitCentavos: 0, linhas, avisos, totalCentavos: linhas.reduce((s, l) => s + l.centavos, 0), referencia: cinquentaTrintaVinteDe(rendaCentavos) };
}

// Valor atual de uma meta: saldo da conta vinculada, senão o `atual` digitado. (Mesma regra da tela Metas;
// aqui porque tela não importa tela.)
export const atualDaMeta = (d, meta, hoje) => (meta.contaId ? saldoDaConta(d, meta.contaId, hoje) ?? 0 : Math.round(meta.atual ?? 0));

// Insumos do plano a partir dos dados do app: renda e necessidades médias, mínimos, dívidas caras, metas com prazo.
export function insumosDoPlano(d, { hoje, indices, reservaAtualCentavos = 0, reservaAlvoCentavos = 0, despesaEssencialCentavos = null }) {
  const ym = mesDe(hoje);
  const idsNecessidade = d.categorias.filter((c) => c.tipo === "despesa" && c.grupo === "necessidade").map((c) => c.id);
  const necessidades = idsNecessidade.length ? despesaMedia(d.lancamentos, ym, { categoriaIds: idsNecessidade }) : null;
  const dividas = d.dividas.filter((x) => x.saldoCentavos > 0);
  const caras = dividas
    .filter((x) => quitarOuInvestir(x.taxaMensalBp, indices).recomendacao === "quitar")
    .sort((a, b) => b.taxaMensalBp - a.taxaMensalBp || a.saldoCentavos - b.saldoCentavos)
    .map((x) => ({ id: x.id, nome: x.nome, saldoCentavos: x.saldoCentavos, taxaMensalBp: x.taxaMensalBp }));
  const metas = d.metas.filter((m) => (m.tipo === "objetivo" || m.tipo === "sinking") && m.prazo).map((m) => ({ m, p: progressoMeta(m, { atualCentavos: atualDaMeta(d, m, hoje), hoje }) }))
    .filter(({ p }) => p.aporteMensalCentavos > 0).map(({ m, p }) => ({ id: m.id, nome: m.nome, aporteCentavos: p.aporteMensalCentavos }));
  const colchaoAlvo = despesaEssencialCentavos ?? 0;
  return {
    receitaMediaCentavos: receitaMedia(d.lancamentos, ym),
    necessidadesCentavos: necessidades,
    minimosDividaCentavos: dividas.reduce((s, x) => s + Math.min(x.parcelaMinimaCentavos, x.saldoCentavos), 0),
    colchaoFaltaCentavos: Math.max(0, Math.min(colchaoAlvo, reservaAlvoCentavos) - reservaAtualCentavos),
    reservaFaltaCentavos: Math.max(0, reservaAlvoCentavos - reservaAtualCentavos),
    dividasCaras: caras,
    metas,
  };
}

// ---------------------------------------------------------------------------------------------
// 5. Quitar dívida: avalanche × bola de neve × híbrido
// ---------------------------------------------------------------------------------------------

// Híbrido "vitória rápida": as dívidas que a folga mensal (orçamento − mínimos) quita em até 3 meses vão
// primeiro, menor saldo antes (fecha conta, libera a parcela mínima); as demais seguem por maior juro.
// Base: fechar contas prediz quitação total (Gal & McShane 2012), e o juro continua mandando onde a vitória
// não é rápida. O limiar é fixo, calculado no início.
export function comparadorHibrido(folgaCentavos) {
  const limite = Math.max(0, folgaCentavos) * 3;
  const rapida = (x) => x.saldo <= limite;
  return (a, b) => {
    const ra = rapida(a), rb = rapida(b);
    if (ra !== rb) return ra ? -1 : 1;
    if (ra) return a.saldo - b.saldo || b.taxaMensalBp - a.taxaMensalBp;
    return b.taxaMensalBp - a.taxaMensalBp || a.saldo - b.saldo;
  };
}

// Mês (1-based) em que cada dívida zera, lido do cronograma.
const mesQueZera = (cronograma, ids) => Object.fromEntries(ids.map((id) => [id, (cronograma.find((c) => c.saldos[id] <= 0)?.mes) ?? null]));

export function compararQuitacao(dividas, orcamentoCentavos, { hoje } = {}) {
  exigirCentavos(orcamentoCentavos);
  const ativas = dividas.filter((d) => d.saldoCentavos > 0);
  const minimos = ativas.reduce((s, d) => s + Math.min(d.parcelaMinimaCentavos ?? 0, d.saldoCentavos), 0);
  const ids = ativas.map((d) => d.id);
  const metodos = { avalanche: "avalanche", bolaDeNeve: "bolaDeNeve", hibrido: comparadorHibrido(orcamentoCentavos - minimos) };
  const ym = hoje ? mesDe(hoje) : null;
  const res = {};
  for (const [nome, metodo] of Object.entries(metodos)) {
    const r = simularQuitacao(dividas, orcamentoCentavos, metodo);
    res[nome] = { ...r, ordem: r.codigo === "ok" ? mesQueZera(r.cronograma, ids) : null, quitaEm: r.codigo === "ok" && ym ? somarMeses(ym, r.meses) : null };
  }
  const todos = Object.values(res);
  if (todos.some((r) => r.codigo !== "ok")) return { ...res, codigo: todos.find((r) => r.codigo !== "ok").codigo, minimosCentavos: minimos };
  const maisJuros = Math.max(...todos.map((r) => r.jurosCentavos));
  for (const r of todos) r.economiaVsMaiorCentavos = maisJuros - r.jurosCentavos;
  return { ...res, codigo: "ok", minimosCentavos: minimos };
}

// ---------------------------------------------------------------------------------------------
// 6. Renda fixa BR: comparador líquido de IR regressivo, IOF e custódia
// ---------------------------------------------------------------------------------------------

// Defaults são EXEMPLOS editáveis, não ofertas: a pessoa digita a taxa que o banco ou o Tesouro mostra.
export const PRODUTOS_RENDA_FIXA = Object.freeze([
  Object.freeze({ id: "cdb", produto: "cdb", indexador: "cdi", percentualBp: 10000, taxaBp: 0, isentoIR: false }),
  Object.freeze({ id: "lci_lca", produto: "lci_lca", indexador: "cdi", percentualBp: 9000, taxaBp: 0, isentoIR: true }),
  Object.freeze({ id: "tesouro_selic", produto: "tesouro_selic", indexador: "selic", percentualBp: null, taxaBp: 0, isentoIR: false }),
  Object.freeze({ id: "tesouro_ipca", produto: "tesouro_ipca", indexador: "ipca", percentualBp: null, taxaBp: 700, isentoIR: false }),
  Object.freeze({ id: "tesouro_pre", produto: "tesouro_pre", indexador: "prefixado", percentualBp: null, taxaBp: 1300, isentoIR: false }),
  Object.freeze({ id: "poupanca", produto: "poupanca", indexador: "selic", percentualBp: null, taxaBp: 0, isentoIR: true }),
]);

// Rendimento líquido anualizado (base 365) em bp: ((P + líquido)/P)^(365/dias) − 1.
export const liquidoAnualBp = (principalCentavos, liquidoCentavos, dias) => bpDeFracao(((principalCentavos + liquidoCentavos) / principalCentavos) ** (365 / dias) - 1);

// Quantos % do CDI um CDB comum (tributado) precisaria pagar para igualar um líquido: menor percentual
// inteiro em bp cujo líquido alcança `liquidoCentavos`, por bisseção sobre o próprio motor. null se
// nem 300 % do CDI alcança (taxa fora de qualquer realidade).
function cdbEquivalenteBp(principalCentavos, dias, liquidoCentavos, indices, hoje) {
  const liquidoCom = (pct) => rendimentoAteVencimento({ produto: "cdb", indexador: "cdi", percentualBp: pct, taxaBp: 0, isentoIR: false, aporteCentavos: principalCentavos, aplicacao: hoje, vencimento: somarDias(hoje, dias) }, indices, { hoje }).liquidoCentavos;
  let lo = 0, hi = 30000;
  if (liquidoCom(hi) < liquidoCentavos) return null;
  while (lo < hi) { const meio = Math.floor((lo + hi) / 2); if (liquidoCom(meio) >= liquidoCentavos) hi = meio; else lo = meio + 1; }
  return lo;
}

export function compararRendaFixa({ principalCentavos, dias, produtos = PRODUTOS_RENDA_FIXA, indices, hoje }) {
  exigirCentavos(principalCentavos);
  if (principalCentavos < 1) throw new RangeError("centavos_invalidos");
  if (!Number.isInteger(dias) || dias < 1) throw new RangeError("dias_invalidos");
  return produtos.map((p) => {
    const inv = { produto: p.produto === "lci_lca" ? "lci" : p.produto, indexador: p.indexador, percentualBp: p.percentualBp ?? undefined, taxaBp: p.taxaBp ?? 0, isentoIR: Boolean(p.isentoIR), aporteCentavos: principalCentavos, aplicacao: hoje, vencimento: somarDias(hoje, dias) };
    const r = rendimentoAteVencimento(inv, indices, { hoje });
    return {
      id: p.id, brutoCentavos: r.brutoCentavos, iofCentavos: r.iofCentavos, irCentavos: r.irCentavos, custodiaCentavos: r.custodiaCentavos, liquidoCentavos: r.liquidoCentavos,
      liquidoAnualBp: liquidoAnualBp(principalCentavos, r.liquidoCentavos, dias),
      cdbEquivalenteBp: p.id === "cdb" || p.id === "poupanca" ? null : cdbEquivalenteBp(principalCentavos, dias, r.liquidoCentavos, indices, hoje),
      avisos: r.avisos,
    };
  });
}
