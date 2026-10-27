// Somas sobre lançamentos no schema v2, compartilhadas por metas, patrimônio e shape×finanças.
// Regras do plano: transferência NUNCA entra em receita/despesa; estorno abate a despesa da sua
// categoria; `previsto` só entra quando pedido (o padrão é o que já aconteceu).
import { mesDe } from "../datas.mjs";

const conta = (l, incluirPrevistos) => incluirPrevistos || l.status !== "previsto";

// Despesas efetivadas do mês `ym`, em centavos, opcionalmente só de um conjunto de categorias.
export function despesasDoMes(lancamentos, ym, { categoriaIds, incluirPrevistos = false } = {}) {
  const filtro = categoriaIds ? new Set(categoriaIds) : null;
  let total = 0;
  for (const l of lancamentos) {
    if (mesDe(l.data) !== ym || !conta(l, incluirPrevistos)) continue;
    if (filtro && !filtro.has(l.categoriaId)) continue;
    if (l.tipo === "despesa") total += l.centavos;
    else if (l.tipo === "estorno") total -= l.centavos;
  }
  return total;
}

export function receitasDoMes(lancamentos, ym, { incluirPrevistos = false } = {}) {
  let total = 0;
  for (const l of lancamentos) if (l.tipo === "receita" && mesDe(l.data) === ym && conta(l, incluirPrevistos)) total += l.centavos;
  return total;
}

// Taxa de poupança do mês em bp: (receitas − despesas) / receitas. null sem receita (não é zero:
// nota baixa por falta de dado seria punir quem ainda não lançou o salário).
export function taxaPoupancaBp(lancamentos, ym, opcoes) {
  const r = receitasDoMes(lancamentos, ym, opcoes);
  if (r <= 0) return null;
  return Math.round(((r - despesasDoMes(lancamentos, ym, opcoes)) / r) * 10000);
}
