// Orçamento: limites por categoria, envelopes com rollover, 50/30/20 por grupo e sinking funds.
// Vocabulário sem culpa (decisão 4 do plano): o estado acima de 100% é "passou", nunca a palavra de culpa
// da v1 (um teste lê este arquivo e reprova se ela voltar).
// Transferência nunca é gasto nem receita; estorno devolve o gasto à categoria da compra.
// O mês de um gasto é o da DATA do lançamento (quando a pessoa gastou), mesmo no cartão: a fatura
// é problema do fluxo de caixa, o orçamento mede comportamento.
import { mesDe, somarMeses } from "../datas.mjs";

const arredondar = (x) => Math.sign(x) * Math.round(Math.abs(x)); // half-up sobre o módulo
const vivo = (l) => l.status !== "cancelado";

// Gasto líquido por categoria no mês: despesas − estornos. Transferências e receitas ficam de fora.
export function gastoPorCategoria(lancamentos, ym) {
  const gasto = {};
  for (const l of lancamentos) {
    if (!vivo(l) || mesDe(l.data) !== ym) continue;
    if (l.tipo === "despesa") gasto[l.categoriaId] = (gasto[l.categoriaId] ?? 0) + l.centavos;
    else if (l.tipo === "estorno") gasto[l.categoriaId] = (gasto[l.categoriaId] ?? 0) - l.centavos;
  }
  return gasto;
}

export const estadoDoPercentual = (pct) => (pct > 100 ? "passou" : pct >= 80 ? "atencao" : "ok");

// `limites`: { [categoriaId]: centavos }. Limite zero ou ausente não vira divisão por zero: pct null.
export function estadoLimites({ lancamentos, ym, limites }) {
  const gasto = gastoPorCategoria(lancamentos, ym);
  return Object.entries(limites).map(([categoriaId, limite]) => {
    const g = gasto[categoriaId] ?? 0;
    const pct = limite > 0 ? arredondar((g / limite) * 100) : null;
    return { categoriaId, gastoCentavos: g, limiteCentavos: limite, pct, restanteCentavos: limite - g, estado: pct === null ? "sem_limite" : estadoDoPercentual(pct) };
  }).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
}

// Envelopes: saldo do mês = limite + saldo que sobrou do mês anterior (rollover) − gasto do mês.
// Sobra acumula, falta também (negativo permitido: o mês seguinte começa devendo). Sem rollover é o
// limite puro. `inicioYm` é o primeiro mês de envelope; antes dele nada rola.
export function envelopes({ lancamentos, ym, limites, rollover = true, inicioYm }) {
  const primeiro = inicioYm ?? ym;
  const meses = [];
  for (let m = primeiro; m <= ym; m = somarMeses(m, 1)) meses.push(m);
  const anterior = {};
  let resultado = [];
  for (const m of meses) {
    const gasto = gastoPorCategoria(lancamentos, m);
    resultado = Object.entries(limites).map(([categoriaId, limite]) => {
      const rolou = rollover ? anterior[categoriaId] ?? 0 : 0;
      const g = gasto[categoriaId] ?? 0;
      const saldo = limite + rolou - g;
      anterior[categoriaId] = saldo;
      return { categoriaId, ym: m, limiteCentavos: limite, rolloverCentavos: rolou, gastoCentavos: g, saldoCentavos: saldo };
    });
  }
  return resultado;
}

// 50/30/20 por `grupo` da categoria (necessidade | desejo | poupanca). Poupança = o que não foi gasto
// em necessidade nem desejo (inclui aportes lançados como despesa em categoria do grupo poupanca).
// Percentuais em basis points inteiros sobre a receita do mês; sem receita, bp null.
export function cinquentaTrintaVinte({ lancamentos, ym, categorias, receitaCentavos }) {
  const grupoDe = Object.fromEntries(categorias.map((c) => [c.id, c.grupo]));
  const receita = receitaCentavos ?? lancamentos.filter((l) => vivo(l) && l.tipo === "receita" && mesDe(l.data) === ym).reduce((s, l) => s + l.centavos, 0);
  const gasto = gastoPorCategoria(lancamentos, ym);
  let necessidade = 0, desejo = 0;
  for (const [cat, c] of Object.entries(gasto)) {
    if (grupoDe[cat] === "necessidade") necessidade += c;
    else if (grupoDe[cat] === "desejo") desejo += c;
  }
  const poupanca = receita - necessidade - desejo;
  const bp = (c) => (receita > 0 ? arredondar((c / receita) * 10000) : null);
  const teto = (c, alvo) => ({ centavos: c, bp: bp(c), alvoBp: alvo, estado: bp(c) === null ? "sem_receita" : bp(c) > alvo ? "passou" : "ok" });
  const piso = (c, alvo) => ({ centavos: c, bp: bp(c), alvoBp: alvo, estado: bp(c) === null ? "sem_receita" : bp(c) >= alvo ? "ok" : "abaixo" });
  return { ym, receitaCentavos: receita, necessidade: teto(necessidade, 5000), desejo: teto(desejo, 3000), poupanca: piso(poupanca, 2000) };
}

// Sinking fund: quanto guardar por mês para ter `alvoCentavos` em `vencimento`. Meses até vencer =
// meses de calendário entre o mês de hoje e o do vencimento (mínimo 1: vence este mês, guarda tudo
// agora). Aporte arredondado para CIMA (guardar a menos é não chegar) e a sobra mostrada.
export function sinkingFund({ alvoCentavos, atualCentavos = 0, vencimento, hoje }) {
  if (!Number.isInteger(alvoCentavos) || alvoCentavos < 0 || !Number.isInteger(atualCentavos)) throw new RangeError("centavos inteiros");
  const [ah, mh] = mesDe(hoje).split("-").map(Number), [av, mv] = mesDe(vencimento).split("-").map(Number);
  const mesesAteVencer = Math.max(1, (av - ah) * 12 + (mv - mh));
  const falta = Math.max(0, alvoCentavos - atualCentavos);
  const aporte = Math.ceil(falta / mesesAteVencer);
  return { mesesAteVencer, faltaCentavos: falta, aporteCentavos: aporte, sobraCentavos: aporte * mesesAteVencer - falta, concluida: falta === 0, vencido: vencimento < hoje };
}
