// Lançamento em moeda estrangeira: guarda `centavosMoeda` (na moeda), `taxaBp` congelada no dia e
// `taxaEstimada` (true quando veio do snapshot PTAX e não da fatura). `centavos` em BRL é derivado.
// "bp" da taxa = R$ × 10⁴ (5,2238 → 52238), a mesma precisão da PTAX.
// IOF de câmbio NÃO é calculado: a alíquota não foi verificada em fonte oficial na pesquisa, e
// regra tributária sem fonte vira aviso (`iof_cambio_nao_calculado`), não cálculo.
import { arredondar, exigirCentavos, exigirTaxaNaoNegativa } from "./taxas.mjs";

export const MOEDAS = ["USD", "EUR"];

// USD 100,00 (10000 centavos) × 5,2238 → 52238 centavos de real.
export function paraBRL(centavosMoeda, taxaBp) {
  exigirCentavos(centavosMoeda); exigirTaxaNaoNegativa(taxaBp);
  return arredondar((centavosMoeda * taxaBp) / 10000);
}

// Taxa do snapshot para a moeda (PTAX de VENDA: é a que o cartão usa como referência). null se a
// moeda não está no snapshot ou se a cotação não foi conferida.
export function taxaDoSnapshot(indices, moeda) {
  const p = indices?.ptax?.[moeda];
  return p?.vendaBp ?? null;
}

// Monta os campos cambiais do lançamento. Com `taxaBp` informada (fatura), ela é congelada e
// `taxaEstimada` é false; sem ela, usa o snapshot e marca `taxaEstimada: true` para a UI avisar
// "valor estimado pela PTAX de <data>, confira na fatura".
export function lancamentoEmMoeda({ moeda, centavosMoeda, taxaBp = null, indices }) {
  if (!MOEDAS.includes(moeda)) throw new RangeError("moeda_invalida");
  exigirCentavos(centavosMoeda);
  let estimada = false, taxa = taxaBp;
  if (taxa == null) {
    taxa = taxaDoSnapshot(indices, moeda);
    if (taxa == null) throw new RangeError("sem_cotacao");
    estimada = true;
  }
  const avisos = ["iof_cambio_nao_calculado"];
  if (estimada) avisos.push("taxa_estimada_pela_ptax");
  return { moeda, centavosMoeda, taxaBp: taxa, taxaEstimada: estimada, centavos: paraBRL(centavosMoeda, taxa), avisos };
}

// A fatura chegou com a taxa real: recalcula o BRL e tira a marca de estimado. Puro, devolve cópia.
export function reavaliarComTaxaReal(lancamento, taxaBp) {
  exigirTaxaNaoNegativa(taxaBp);
  return { ...lancamento, taxaBp, taxaEstimada: false, centavos: paraBRL(lancamento.centavosMoeda, taxaBp) };
}
