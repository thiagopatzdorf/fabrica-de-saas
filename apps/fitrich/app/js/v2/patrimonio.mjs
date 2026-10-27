// Patrimônio líquido = ativos (saldos de contas e investimentos) − passivos (dívidas e faturas em
// aberto). Saldo de conta é do núcleo (área 1) e fatura em aberto é do motor de cartão (área 2):
// chegam prontos, em centavos, por parâmetro. Aqui só se soma, compõe e compara mês a mês.
import { exigirCentavos } from "./taxas.mjs";

export const TIPOS_ATIVO = ["corrente", "poupanca", "dinheiro", "investimento"];

// Valor de uma conta tipo "investimento": se há investimentos cadastrados nela, vale a soma deles
// (saldo informado, senão o aporte) e o saldo da conta NÃO entra de novo — senão o mesmo dinheiro
// contaria duas vezes. Sem investimento vinculado, vale o saldo da conta.
function valorDaConta(conta, saldosPorConta, investimentos) {
  const vinculados = conta.tipo === "investimento" ? investimentos.filter((i) => i.contaId === conta.id) : [];
  if (vinculados.length) return vinculados.reduce((s, i) => s + exigirCentavos(i.saldoInformadoCentavos ?? i.aporteCentavos ?? 0), 0);
  return exigirCentavos(saldosPorConta[conta.id] ?? 0);
}

// `d` é o objeto do schema v2 (contas, investimentos, dividas); `saldosPorConta` {id: centavos} e
// `faturasEmAberto` [{ cartaoId, ym, centavos }] vêm calculados de fora. Contas arquivadas ficam fora.
export function patrimonioLiquido(d, { saldosPorConta = {}, faturasEmAberto = [] } = {}) {
  const contas = (d.contas ?? []).filter((c) => !c.arquivada), investimentos = d.investimentos ?? [];
  const porTipo = {};
  let ativos = 0;
  for (const c of contas) { const v = valorDaConta(c, saldosPorConta, investimentos); ativos += v; porTipo[c.tipo] = (porTipo[c.tipo] ?? 0) + v; }
  // Investimento sem conta (ou com conta que não existe) ainda é patrimônio: entra como "investimento".
  const soltos = investimentos.filter((i) => !contas.some((c) => c.id === i.contaId)).reduce((s, i) => s + exigirCentavos(i.saldoInformadoCentavos ?? i.aporteCentavos ?? 0), 0);
  if (soltos) { ativos += soltos; porTipo.investimento = (porTipo.investimento ?? 0) + soltos; }
  const dividas = (d.dividas ?? []).reduce((s, x) => s + exigirCentavos(x.saldoCentavos), 0);
  const faturas = faturasEmAberto.reduce((s, f) => s + exigirCentavos(f.centavos), 0);
  const passivos = dividas + faturas;
  const composicao = {
    ativos: Object.entries(porTipo).filter(([, v]) => v !== 0).map(([tipo, centavos]) => ({ tipo, centavos, bp: ativos > 0 ? Math.round((centavos / ativos) * 10000) : null })).sort((a, b) => b.centavos - a.centavos),
    passivos: [{ tipo: "dividas", centavos: dividas }, { tipo: "faturas", centavos: faturas }].filter((p) => p.centavos !== 0),
  };
  return { ativos, passivos, liquido: ativos - passivos, composicao };
}

// Snapshot do mês no formato do schema (`snapshots: [{ ym, patrimonioCentavos, ativos, passivos }]`).
export function snapshotMensal(d, ym, dadosExternos) {
  if (!/^\d{4}-\d{2}$/.test(ym)) throw new RangeError("ym_invalido");
  const p = patrimonioLiquido(d, dadosExternos);
  return { ym, patrimonioCentavos: p.liquido, ativos: p.ativos, passivos: p.passivos };
}

// Guarda o snapshot do mês substituindo o anterior do mesmo `ym` (um por mês), em ordem. Puro: devolve
// a lista nova, não mexe na recebida.
export function registrarSnapshot(snapshots, novo) {
  return [...snapshots.filter((s) => s.ym !== novo.ym), novo].sort((a, b) => (a.ym < b.ym ? -1 : a.ym > b.ym ? 1 : 0));
}

// Variação mês a mês em centavos e em bp sobre o mês anterior (null no primeiro e quando o anterior
// é zero ou negativo — porcentagem sobre patrimônio negativo não significa nada).
export function variacaoMensal(snapshots) {
  const lista = [...snapshots].sort((a, b) => (a.ym < b.ym ? -1 : 1));
  return lista.map((s, k) => {
    const ant = lista[k - 1];
    const variacaoCentavos = ant ? s.patrimonioCentavos - ant.patrimonioCentavos : null;
    return { ym: s.ym, patrimonioCentavos: s.patrimonioCentavos, variacaoCentavos, variacaoBp: ant && ant.patrimonioCentavos > 0 ? Math.round((variacaoCentavos / ant.patrimonioCentavos) * 10000) : null };
  });
}
