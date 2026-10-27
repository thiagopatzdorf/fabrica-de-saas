// Hidratação: meta por peso e progresso do dia. Pura.
// 30 ml/kg/dia de BEBIDAS (a faixa 30–35 ml/kg é a regra de bolso mais citada; ~20% da água vem da comida, EFSA 2010),
// arredondada a 50 ml e presa em 1500–4000 ml. Sem peso: 2000 ml (EFSA, bebidas: 1,6 L mulheres / 2,0 L homens).
export const ML_POR_KG = 30;
export const PADRAO_ML = 2000;
export const BOTOES_ML = [200, 300, 500];
export function metaAguaMl(kg) {
  if (!(kg > 0)) return { ml: PADRAO_ML, padrao: true };
  return { ml: Math.min(4000, Math.max(1500, Math.round((kg * ML_POR_KG) / 50) * 50)), padrao: false };
}
export const progressoAgua = (ml, meta) => (meta > 0 ? Math.max(0, Math.min(1, (ml ?? 0) / meta)) : 0);
// Passou muito da meta? Meio-termo: o aviso aparece acima de 1,5× a meta e é só um lembrete.
export const passouDoMeioTermo = (ml, meta) => (ml ?? 0) > meta * 1.5;
