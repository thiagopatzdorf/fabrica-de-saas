// Regras do financeiro por projeto. Ficam fora das rotas para serem testáveis
// sem banco e para o orçamento ter uma única definição.
const DEFAULT_BUDGET = 30000;
const DEFAULT_RATE = 'R$ 130';

// O formulário envia o orçamento em milhares de reais (campo "hours", nome
// herdado). Valor vazio, negativo ou não numérico cai no padrão, em vez de
// gravar NaN ou 0 (um orçamento 0 faria o uso % virar Infinity na tela).
function budgetFromThousands(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_BUDGET;
  return Math.round(n * 1000);
}

// Percentual do orçamento gasto, sem dividir por zero.
function usagePercent(spent, budget) {
  const s = Number(spent), b = Number(budget);
  if (!Number.isFinite(s) || !Number.isFinite(b) || b <= 0) return 0;
  return Math.round((s / b) * 100);
}

// Campos monetários só aceitam número finito e não negativo.
function validateMoneyPatch(patch) {
  for (const key of ['budget', 'spent']) {
    if (patch[key] === undefined) continue;
    const n = Number(patch[key]);
    if (typeof patch[key] === 'boolean' || patch[key] === null || patch[key] === '' || !Number.isFinite(n) || n < 0) {
      return 'O campo "' + key + '" precisa ser um número maior ou igual a zero.';
    }
    patch[key] = n;
  }
  return null;
}

module.exports = { DEFAULT_BUDGET, DEFAULT_RATE, budgetFromThousands, usagePercent, validateMoneyPatch };
