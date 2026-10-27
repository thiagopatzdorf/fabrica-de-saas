// Parcelamento no cartão. A soma das parcelas SEMPRE fecha com o total (invariante do plano), e o
// resto da divisão vai para as primeiras parcelas (10000/3 → 3334, 3333, 3333), que é como as
// faturas brasileiras vêm impressas; o usuário confere a primeira parcela com a fatura real.
import { somarMeses } from "../datas.mjs";
import { faturaDaCompra, faturaDoLancamento, vencimentoDaFatura } from "./cartao.mjs";

export function dividirEmParcelas(totalCentavos, n) {
  if (!Number.isInteger(n) || n < 1) throw new RangeError("número de parcelas precisa ser inteiro ≥ 1");
  if (!Number.isInteger(totalCentavos) || totalCentavos < 0) throw new RangeError("total em centavos inteiros, não negativo");
  const base = Math.floor(totalCentavos / n), resto = totalCentavos % n;
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
}

// `compra` é o lançamento como a pessoa digitou (data, centavos, categoriaId, descricao, …). Saem N
// lançamentos filhos, um por fatura consecutiva a partir da fatura da data da compra, todos com a
// data da compra (foi quando ela aconteceu) e `fatura` dizendo quando cada parcela é cobrada.
// Parcela é compromisso assumido, não previsão: nasce `efetivado`.
export function gerarParcelas({ compra, cartao, n, novoId }) {
  const valores = dividirEmParcelas(compra.centavos, n);
  const grupoId = compra.parcela?.grupoId ?? compra.id ?? novoId();
  const primeira = faturaDaCompra(cartao, compra.data);
  return valores.map((centavos, i) => ({
    ...compra,
    id: novoId(),
    centavos,
    tipo: "despesa",
    cartaoId: cartao.id,
    meio: "credito",
    fatura: somarMeses(primeira, i),
    status: "efetivado",
    parcela: { grupoId, n: i + 1, de: n, totalCentavos: compra.parcela?.totalCentavos ?? compra.centavos },
  }));
}

// Marca como canceladas (sem apagar) as parcelas do grupo cuja fatura vem DEPOIS de `depoisDeYm`.
// `motivoId` aponta o lançamento que causou (um estorno, por exemplo).
export function cancelarParcelasRestantes(lancamentos, { grupoId, depoisDeYm, motivoId = null }) {
  return lancamentos.map((l) =>
    l.parcela?.grupoId === grupoId && l.status !== "cancelado" && l.fatura > depoisDeYm ? { ...l, status: "cancelado", canceladoPor: motivoId } : l,
  );
}

// O que ainda vem no cartão, agrupado por fatura (da aberta em diante), com o vencimento de cada uma:
// é o dado que o fluxo de caixa e a tela "Cartões" mostram.
export function parcelasFuturasPorFatura(cartao, lancamentos, hoje) {
  const aberta = faturaDaCompra(cartao, hoje);
  const porFatura = new Map();
  for (const l of lancamentos) {
    if (l.cartaoId !== cartao.id || l.tipo !== "despesa" || l.status === "cancelado" || !l.parcela) continue;
    const ym = faturaDoLancamento(cartao, l);
    if (ym < aberta) continue;
    const f = porFatura.get(ym) ?? { ym, vencimento: vencimentoDaFatura(cartao, ym), centavos: 0, parcelas: 0 };
    f.centavos += l.centavos;
    f.parcelas += 1;
    porFatura.set(ym, f);
  }
  return [...porFatura.values()].sort((a, b) => (a.ym < b.ym ? -1 : 1));
}
