// Metas: aporte mensal com prazo (nominal e em valor REAL), reserva de emergência por despesa
// essencial, independência financeira como faixa (não promessa) e progresso de várias metas.
import { mesDe, somarMeses } from "../datas.mjs";
import { aaParaAm, arredondar, bpDeFracao, exigirCentavos, exigirPrazo, exigirTaxaNaoNegativa, fracaoDeBp, taxaReal } from "./taxas.mjs";
import { despesasDoMes } from "./lancamentos-soma.mjs";

// PMT = (FV − PV·(1+i)^n) · i / ((1+i)^n − 1); com i = 0 vira (FV − PV)/n. 12.000 em 12 m a 0,8 %
// → 956,76; a 0 % → 1.000,00. Se o que já tem, rendendo, passa do alvo, o aporte é 0.
export function aporteMensal({ alvoCentavos, atualCentavos = 0, meses, taxaMensalBp = 0 }) {
  exigirCentavos(alvoCentavos); exigirCentavos(atualCentavos); exigirPrazo(meses); exigirTaxaNaoNegativa(taxaMensalBp);
  return aporteMensalFracao({ alvoCentavos, atualCentavos, meses, i: fracaoDeBp(taxaMensalBp) });
}

function aporteMensalFracao({ alvoCentavos, atualCentavos, meses, i }) {
  const fator = (1 + i) ** meses;
  const falta = alvoCentavos - atualCentavos * fator;
  if (falta <= 0) return 0;
  return arredondar(i === 0 ? falta / meses : (falta * i) / (fator - 1));
}

// Taxa real mensal pela equação de Fisher sobre as taxas MENSAIS geométricas: 13,65 % nominal e
// IPCA 4,22 % → 1,0720 % e 0,3450 % a.m. → i_real 0,7244 % a.m. Devolve fração e bp.
export function taxaRealMensal(nominalAaBp, inflacaoAaBp) {
  exigirTaxaNaoNegativa(nominalAaBp); exigirTaxaNaoNegativa(inflacaoAaBp);
  const i = taxaReal(aaParaAm(nominalAaBp), aaParaAm(inflacaoAaBp));
  return { fracao: i, bp: bpDeFracao(i) };
}

// Aporte para um alvo em REAIS DE HOJE: a meta "50 mil daqui a 2 anos" é 50 mil com o poder de
// compra atual, então desconta-se a inflação da taxa. 50.000 em 24 m (13,65 % / 4,22 %) → 1.914,99.
// Juro real negativo (inflação acima do rendimento) é possível e é tratado como 0 com aviso.
export function aporteMensalReal({ alvoCentavosHoje, atualCentavos = 0, meses, nominalAaBp, inflacaoAaBp }) {
  exigirCentavos(alvoCentavosHoje); exigirCentavos(atualCentavos); exigirPrazo(meses);
  const real = taxaRealMensal(nominalAaBp, inflacaoAaBp);
  const avisos = ["valor_real_poder_de_compra_de_hoje"];
  let i = real.fracao;
  if (i < 0) { i = 0; avisos.push("juro_real_negativo_tratado_como_zero"); }
  return { aporteCentavos: aporteMensalFracao({ alvoCentavos: alvoCentavosHoje, atualCentavos, meses, i }), taxaRealMensalBp: real.bp, avisos };
}

// Média das despesas das categorias `essencial` nos `meses` últimos meses COMPLETOS antes de
// `ymAtual` (o mês corrente está pela metade e distorceria). null sem nenhum mês com despesa.
export function despesaEssencialMedia(lancamentos, categorias, ymAtual, { meses = 3 } = {}) {
  const ids = categorias.filter((c) => c.essencial && c.tipo === "despesa").map((c) => c.id);
  if (!ids.length) return null;
  const valores = [];
  for (let k = 1; k <= meses; k++) {
    const v = despesasDoMes(lancamentos, somarMeses(ymAtual, -k), { categoriaIds: ids });
    if (v > 0) valores.push(v);
  }
  return valores.length ? arredondar(valores.reduce((s, v) => s + v, 0) / valores.length) : null;
}

// Sugestão de cobertura, não norma: CLT tem seguro-desemprego e aviso prévio (3–6 meses);
// autônomo e MEI não têm (6–12). Quem decide é a pessoa.
export function sugestaoCobertura(vinculo) {
  const faixa = vinculo === "clt" ? { minMeses: 3, maxMeses: 6 } : vinculo === "autonomo" || vinculo === "mei" ? { minMeses: 6, maxMeses: 12 } : null;
  if (!faixa) throw new RangeError("vinculo_invalido");
  return { ...faixa, codigo: "sugestao_nao_norma" };
}

export function reservaEmergencia({ despesaEssencialMensalCentavos, mesesCobertura, atualCentavos = 0 }) {
  exigirCentavos(despesaEssencialMensalCentavos); exigirPrazo(mesesCobertura); exigirCentavos(atualCentavos);
  const alvoCentavos = despesaEssencialMensalCentavos * mesesCobertura;
  return { alvoCentavos, faltaCentavos: Math.max(0, alvoCentavos - atualCentavos), mesesCobertos: despesaEssencialMensalCentavos > 0 ? Math.floor(atualCentavos / despesaEssencialMensalCentavos) : null };
}

// Independência financeira pela regra de bolso dos EUA (Trinity Study: retirada de 4 % a.a.,
// 25× a despesa anual), apresentada como FAIXA 3,5–4 % em termos REAIS. 5.000/mês → R$ 1.500.000
// a 4 %. Não é promessa e não se ajusta pela Selic nominal: a regra já é "acima da inflação".
export function independenciaFinanceira({ despesaMensalCentavos, patrimonioCentavos = 0 }) {
  exigirCentavos(despesaMensalCentavos); exigirCentavos(patrimonioCentavos);
  const anual = despesaMensalCentavos * 12;
  const alvo4 = anual * 25, alvo35 = arredondar(anual / 0.035);
  return {
    regra: "regra_de_bolso_eua",
    faixa: { taxa400Bp: alvo4, taxa350Bp: alvo35 },
    alvoCentavos: alvo4,
    progressoBp: alvo4 > 0 ? Math.round((patrimonioCentavos / alvo4) * 10000) : null,
    avisos: ["estimativa_nao_promessa", "termos_reais_nao_ajustar_pela_selic", "base_historica_eua_nao_brasil"],
  };
}

// Meses até o prazo da meta contados em meses-calendário a partir do mês de `hoje`.
const mesesAte = (prazoISO, hoje) => {
  const [a1, m1] = mesDe(hoje).split("-").map(Number), [a2, m2] = mesDe(prazoISO).split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
};

// Progresso de uma meta (schema `metas`): quanto falta, % e, com prazo, o aporte mensal para chegar.
// `atualCentavos` vem de quem sabe o saldo (núcleo), aqui não se soma lançamento. `meta.taxaBp` é
// lida como taxa AO ANO (mesma convenção de `investimentos.taxaBp`); o schema não diz — proposta no PR.
export function progressoMeta(meta, { atualCentavos, hoje }) {
  const atual = exigirCentavos(atualCentavos ?? meta.atual ?? 0), alvo = exigirCentavos(meta.alvo);
  const saida = { id: meta.id, tipo: meta.tipo, alvoCentavos: alvo, atualCentavos: atual, faltaCentavos: Math.max(0, alvo - atual), progressoBp: alvo > 0 ? Math.min(10000, Math.round((atual / alvo) * 10000)) : null, codigo: atual >= alvo ? "atingida" : "em_andamento" };
  if (meta.prazo && saida.codigo !== "atingida") {
    const meses = mesesAte(meta.prazo, hoje);
    if (meses < 1) saida.codigo = "prazo_vencido";
    else {
      saida.mesesRestantes = meses;
      saida.aporteMensalCentavos = aporteMensalFracao({ alvoCentavos: alvo, atualCentavos: atual, meses, i: aaParaAm(exigirTaxaNaoNegativa(meta.taxaBp ?? 0)) });
    }
  }
  return saida;
}

export const progressoMetas = (metas, { atualPorMeta = {}, hoje }) => metas.map((m) => progressoMeta(m, { atualCentavos: atualPorMeta[m.id], hoje }));
