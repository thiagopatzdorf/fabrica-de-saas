// Sugere pares de transferência entre contas: conta A com −v no dia d e conta B com +v em d±1,
// com descrição que cheira a transferência (transf, pix, ted, doc, pagamento de fatura). É SUGESTÃO:
// nada vira transferência sem a pessoa confirmar no preview. Motivo: um pix de R$ 100 para um amigo
// e um pix de R$ 100 recebido de outro no mesmo dia são dois lançamentos, não uma transferência,
// e só quem olhou sabe.
import { diasEntreISO, normalizarTexto } from "./comum.mjs";
import { valorAssinado } from "./dedupe.mjs";

export const PADRAO_TRANSFERENCIA = /\b(transf\w*|pix|ted|doc|pagamento (de |da )?fatura|pagto\.? ?(de )?fatura|pagamento recebido|resgate|aplicacao|aplic\.?)\b/i;
export const CATEGORIA_TRANSFERENCIA = "transferencia";

export const pareceTransferencia = (descricao) => PADRAO_TRANSFERENCIA.test(normalizarTexto(descricao));

// candidatos: lançamentos (ou movimentos novos já com `contaId`/`cartaoId` e `valorCentavos`) de
// VÁRIAS contas. Cada lançamento entra em no máximo um par; o par mais próximo em dias vence.
// Saída: [{ saidaId, entradaId, saida, entrada, centavos, diasDiferenca, motivo }]
export function sugerirTransferencias(candidatos, { janelaDias = 1 } = {}) {
  const dono = (l) => l.contaId ?? l.cartaoId ?? null;
  const saidas = [], entradas = [];
  for (const l of candidatos) {
    if (l.tipo === "transferencia" || !dono(l)) continue;
    const v = valorAssinado(l);
    if (!v || !pareceTransferencia(l.descricao)) continue;
    (v < 0 ? saidas : entradas).push(l);
  }
  const usados = new Set(), sugestoes = [];
  for (const s of saidas) {
    let melhor = null;
    for (const e of entradas) {
      if (usados.has(e.id) || dono(e) === dono(s) || valorAssinado(e) !== -valorAssinado(s)) continue;
      const dias = Math.abs(diasEntreISO(s.data, e.data));
      if (dias > janelaDias) continue;
      if (!melhor || dias < melhor.dias) melhor = { e, dias };
    }
    if (!melhor) continue;
    usados.add(melhor.e.id); usados.add(s.id);
    sugestoes.push({ saidaId: s.id, entradaId: melhor.e.id, saida: s, entrada: melhor.e, centavos: Math.abs(valorAssinado(s)), diasDiferenca: melhor.dias, motivo: "valor_igual_contas_diferentes_descricao_transferencia" });
  }
  return sugestoes;
}

// Confirmação (só depois do clique): as duas pernas viram `tipo: "transferencia"`, apontam uma para a
// outra por `refId`, e a perna de saída ganha `contaDestinoId`. Assim nenhuma entra em receita/despesa
// (invariante do plano) e desfazer a importação continua removendo só ids criados.
export function confirmarTransferencia(lancamentos, sugestao, { agora = () => new Date().toISOString() } = {}) {
  const dono = (l) => l.contaId ?? l.cartaoId;
  return lancamentos.map((l) => {
    if (l.id === sugestao.saidaId) return { ...l, tipo: "transferencia", categoriaId: CATEGORIA_TRANSFERENCIA, contaDestinoId: dono(sugestao.entrada), refId: sugestao.entradaId, atualizadoEm: agora() };
    if (l.id === sugestao.entradaId) return { ...l, tipo: "transferencia", categoriaId: CATEGORIA_TRANSFERENCIA, refId: sugestao.saidaId, atualizadoEm: agora() };
    return l;
  });
}
