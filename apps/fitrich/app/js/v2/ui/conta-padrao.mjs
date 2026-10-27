// A conta que existe quando a pessoa ainda não criou nenhuma. Um lançamento precisa de conta ou cartão
// (esquema), mas o primeiro lançamento tem de sair em 3 toques, sem a pessoa cadastrar conta antes:
// o Lançar cria esta aqui sozinho. O id é FIXO para a migração de exemplo → real e dois aparelhos
// reconhecerem a mesma carteira; a migração v1→v2 usa o seu próprio ("v1-conta-1", já existente).
import { adicionar } from "../esquema.mjs";

export const CONTA_PADRAO_ID = "conta-carteira";

export function garantirConta(d, { nome, hoje, agora }) {
  if (d.contas.some((c) => !c.arquivada)) return d;
  return adicionar(d, "contas", { id: CONTA_PADRAO_ID, nome, tipo: "dinheiro", moeda: d.perfil.moedaPadrao ?? "BRL", saldoInicialCentavos: 0, dataSaldoInicial: hoje, arquivada: false }, { agora });
}

// Conta sugerida para um lançamento novo: a mais usada nos últimos lançamentos, senão a primeira ativa.
export function contaSugerida(d) {
  const ativas = d.contas.filter((c) => !c.arquivada);
  if (!ativas.length) return null;
  const uso = new Map();
  for (const l of d.lancamentos.slice(-50)) if (l.contaId) uso.set(l.contaId, (uso.get(l.contaId) ?? 0) + 1);
  return [...ativas].sort((a, b) => (uso.get(b.id) ?? 0) - (uso.get(a.id) ?? 0))[0];
}
