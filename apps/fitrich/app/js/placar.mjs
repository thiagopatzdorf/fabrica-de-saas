// Placar Fitrich (0 a 100): uma nota só para "corpo e conta em dia", com a fórmula à vista.
//   40%  treino:    treinos dos últimos 28 dias ÷ (meta por semana × 4), no máximo 1
//   40%  poupança:  taxa de poupança do mês ÷ meta de poupança, no máximo 1 (0 se gastou mais que ganhou)
//   20%  registros: dias com algum registro nos últimos 7 dias ÷ 4, no máximo 1
// Sem receita lançada no mês a parte da poupança não entra (os pesos se redistribuem), porque
// nota baixa por falta de dado seria punir quem ainda não começou o lado financeiro.
import { somarDias, mesDe } from "./datas.mjs";
import { resumoMes } from "./financas.mjs";

export function placar({ treinos, lancamentos, pesos, metas, hoje }) {
  const treino = Math.min(1, treinos.filter((t) => t.data > somarDias(hoje, -28) && t.data <= hoje).length / (metas.treinosSemana * 4));
  const r = resumoMes(lancamentos, mesDe(hoje));
  const poupanca = r.taxaPoupanca == null ? null : Math.min(1, Math.max(0, r.taxaPoupanca / metas.poupancaPct));
  const dias = new Set([...pesos, ...treinos, ...lancamentos].filter((x) => x.data > somarDias(hoje, -7) && x.data <= hoje).map((x) => x.data));
  const registros = Math.min(1, dias.size / 4);
  const partes = poupanca == null
    ? [{ nome: "Treino", valor: treino, peso: 2 / 3 }, { nome: "Registros", valor: registros, peso: 1 / 3 }]
    : [{ nome: "Treino", valor: treino, peso: 0.4 }, { nome: "Poupança", valor: poupanca, peso: 0.4 }, { nome: "Registros", valor: registros, peso: 0.2 }];
  const total = Math.round(100 * partes.reduce((s, p) => s + p.valor * p.peso, 0));
  return { total, partes, semReceita: poupanca == null };
}
