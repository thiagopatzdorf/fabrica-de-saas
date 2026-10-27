// Índice de recuperação: conta SIMPLES e visível. Soma ponderada de até 4 termos (0–1 cada), reescalada para 0–100
// com os pesos só dos termos que têm dado. Nada de caixa-preta: a tela mostra cada termo, o peso e os pontos.
//   sono 40  = 0,7 × min(horas/meta, 1) + 0,3 × (qualidade−1)/4      (sem qualidade: só as horas)
//   energia 25 = (energia−1)/4
//   dor 20     = 1 − (dor−1)/4                                         (1 = sem dor, 5 = muita)
//   carga 15   = 1 se razão aguda:crônica ≤ 1,3; cai linear até 0 em 1,8 (Gabbett 2016; limites discutidos, Impellizzeri 2020)
// Carga de uma sessão = minutos × (esforço 1–5 × 2), isto é, sessão-RPE de Foster (escala CR10 = esforço × 2).
// Não é HRV, não mede nada do corpo: é um espelho do que a pessoa relatou. Ferramenta de acompanhamento, não diagnóstico.
import { dia } from "../../datas.mjs";

export const PESOS = { sono: 40, energia: 25, dor: 20, carga: 15 };
export const LIMIAR = { boa: 70, moderada: 50 };
const ESFORCO_PADRAO = 3; // sessão sem esforço informado conta como moderada
const arred = (v, c) => Math.round(v * 10 ** c) / 10 ** c;

export const cargaDaSessao = (t) => t.minutos * (t.esforco ?? ESFORCO_PADRAO) * 2;

// Razão aguda:crônica = média diária dos últimos 7 dias ÷ média diária dos últimos 28. null com histórico curto
// (primeiro treino há menos de 14 dias: a razão inflaria à toa) ou sem carga crônica.
export function razaoDeCarga(treinos, hoje) {
  const h = dia(hoje), antes = treinos.filter((t) => dia(t.data) <= h);
  if (!antes.length || h - Math.min(...antes.map((t) => dia(t.data))) < 14) return null;
  const soma = (de) => antes.filter((t) => dia(t.data) >= h - de + 1).reduce((s, t) => s + cargaDaSessao(t), 0);
  const aguda = soma(7), cronica = soma(28);
  if (cronica === 0) return null;
  return { razao: arred((aguda / 7) / (cronica / 28), 3), aguda, cronica };
}

const sonoTermo = (b, meta) => {
  if (b?.sonoHoras == null || !(meta > 0)) return null;
  const s = Math.min(b.sonoHoras / meta, 1);
  return b.sonoQualidade != null ? 0.7 * s + 0.3 * ((b.sonoQualidade - 1) / 4) : s;
};
const cargaTermo = (r) => (r == null ? null : r.razao <= 1.3 ? 1 : r.razao >= 1.8 ? 0 : 1 - (r.razao - 1.3) / 0.5);

export function indiceRecuperacao({ bemestar, treinos, hoje, metaSonoHoras }) {
  const b = bemestar ?? null, c = razaoDeCarga(treinos, hoje);
  const valores = {
    sono: sonoTermo(b, metaSonoHoras),
    energia: b?.energia != null ? (b.energia - 1) / 4 : null,
    dor: b?.dor != null ? 1 - (b.dor - 1) / 4 : null,
    carga: cargaTermo(c),
  };
  const termos = Object.keys(PESOS).map((id) => ({ id, valor: valores[id], peso: PESOS[id], pontos: valores[id] == null ? null : arred(valores[id] * PESOS[id], 1) }));
  const usados = termos.filter((t) => t.valor != null), relatados = usados.filter((t) => t.id !== "carga");
  // Só carga não é recuperação: precisa de pelo menos um termo relatado pela pessoa.
  if (!relatados.length) return { pontos: null, termos, faixa: null, usados: usados.length, carga: c, avisoDor: false };
  const pontos = Math.round((usados.reduce((s, t) => s + t.valor * t.peso, 0) / usados.reduce((s, t) => s + t.peso, 0)) * 100);
  return { pontos, termos, usados: usados.length, carga: c, faixa: pontos >= LIMIAR.boa ? "boa" : pontos >= LIMIAR.moderada ? "moderada" : "leve", avisoDor: (b?.dor ?? 0) >= 4 };
}
