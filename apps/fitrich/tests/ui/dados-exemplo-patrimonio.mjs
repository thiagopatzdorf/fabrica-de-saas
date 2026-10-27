// Dados de exemplo v2 para montar as telas Patrimônio, Metas, Dívidas, Shape e Check-in no harness de
// navegador e nos testes Node. Determinísticos (ids e instantes fixos) e válidos pelo `validar` do esquema.
// Caminho relativo à pasta tests/: o harness serve a pasta app/ na raiz e esta pasta em /tests/.
import { adicionar, vazio } from "../../app/js/v2/esquema.mjs";
import { somarDias, somarMeses } from "../../app/js/datas.mjs";

export const HOJE = "2026-10-05"; // segunda-feira: dispara a mensagem de recomeço do check-in
export const AGORA = "2026-10-05T09:00:00.000Z";

export function dadosExemplo({ hoje = HOJE, agora = () => AGORA } = {}) {
  let n = 0;
  const novoId = () => `ex-${String(++n).padStart(4, "0")}`;
  const op = { novoId, agora };
  let d = vazio({ agora });
  const add = (col, item) => { d = adicionar(d, col, item, op); return d[col].find((x) => x.id === item.id) ?? d[col][d[col].length - 1]; };
  const ym = hoje.slice(0, 7);

  // Contas
  add("contas", { id: "c-corrente", nome: "Conta do dia a dia", tipo: "corrente", moeda: "BRL", saldoInicialCentavos: 250000, dataSaldoInicial: somarMeses(ym, -9) + "-01", arquivada: false });
  add("contas", { id: "c-reserva", nome: "Reserva", tipo: "poupanca", moeda: "BRL", saldoInicialCentavos: 900000, dataSaldoInicial: somarMeses(ym, -9) + "-01", arquivada: false });
  add("contas", { id: "c-corretora", nome: "Corretora", tipo: "investimento", moeda: "BRL", saldoInicialCentavos: 0, dataSaldoInicial: somarMeses(ym, -9) + "-01", arquivada: false });
  add("cartoes", { id: "k-1", nome: "Cartão roxo", diaFechamento: 3, diaVencimento: 10, fechaInclusivo: false, limiteCentavos: 600000, contaPagamentoId: "c-corrente" });

  // Investimentos
  add("investimentos", { id: "i-cdb", nome: "CDB 100% CDI", contaId: "c-corretora", produto: "cdb", indexador: "cdi", percentualBp: 10000, taxaBp: null, isentoIR: false, aplicacao: somarMeses(ym, -6) + "-10", vencimento: somarMeses(ym, 6) + "-10", aporteCentavos: 1000000, saldoInformadoCentavos: 1062000, dataSaldo: somarDias(hoje, -20) });
  add("investimentos", { id: "i-ipca", nome: "Tesouro IPCA+ 2035", contaId: "c-corretora", produto: "tesouro_ipca", indexador: "ipca", percentualBp: null, taxaBp: 650, isentoIR: false, aplicacao: somarMeses(ym, -3) + "-15", vencimento: "2035-05-15", aporteCentavos: 500000, saldoInformadoCentavos: null, dataSaldo: null });

  // Recorrência da academia (alimenta academia ociosa e custo por treino)
  add("recorrencias", { id: "r-acad", nome: "Academia", tipo: "despesa", centavos: 12900, categoriaId: "cat-saude-fitness", contaId: "c-corrente", freq: "mensal", intervalo: 1, diaDoMes: 10, inicio: somarMeses(ym, -9) + "-10", ativa: true });

  // Lançamentos: 9 meses de salário, moradia, mercado, transporte, academia, delivery, lazer (+ cartão)
  const L = (data, tipo, centavos, categoriaId, extra = {}) => add("lancamentos", { data, tipo, centavos, categoriaId, moeda: "BRL", contaId: "c-corrente", meio: "pix", status: "efetivado", origem: "manual", ...extra });
  for (let k = 9; k >= 0; k--) {
    const m = somarMeses(ym, -k), cheio = k > 0;
    L(`${m}-05`, "receita", 650000, "cat-salario", { descricao: "Salário" });
    L(`${m}-06`, "despesa", 180000, "cat-moradia", { descricao: "Aluguel" });
    if (cheio || hoje >= `${m}-10`) L(`${m}-10`, "despesa", 12900, "cat-saude-fitness", { descricao: "Academia", recorrenciaId: "r-acad" });
    if (cheio) {
      L(`${m}-12`, "despesa", 90000 + (k % 3) * 8000, "cat-mercado", { descricao: "Mercado" });
      L(`${m}-15`, "despesa", 32000, "cat-transporte", { descricao: "Transporte" });
      L(`${m}-18`, "despesa", 24000 + (k % 4) * 9000, "cat-delivery", { descricao: "Delivery", contaId: null, cartaoId: "k-1", meio: "credito" });
      L(`${m}-22`, "despesa", 40000 + (k % 2) * 15000, "cat-lazer", { descricao: "Lazer", contaId: null, cartaoId: "k-1", meio: "credito" });
      // Pagamento da fatura do mês (transferência conta → cartão) para a fatura não acumular
      add("lancamentos", { data: `${m}-10`, tipo: "transferencia", centavos: 60000, categoriaId: null, moeda: "BRL", contaId: "c-corrente", cartaoId: "k-1", fatura: m, meio: "outro", status: "efetivado", origem: "manual", descricao: "Pagamento fatura" });
      // Transferência para a reserva
      add("lancamentos", { data: `${m}-07`, tipo: "transferencia", centavos: 60000, categoriaId: null, moeda: "BRL", contaId: "c-corrente", contaDestinoId: "c-reserva", meio: "pix", status: "efetivado", origem: "manual", descricao: "Para a reserva" });
    }
  }
  // Mês corrente: compras no cartão e 3 importados sem categoria (o check-in classifica)
  L(`${ym}-02`, "despesa", 18700, "cat-delivery", { descricao: "Delivery", contaId: null, cartaoId: "k-1", meio: "credito" });
  for (const [dia, cents, desc] of [["01", 4590, "PAG*FARMACIA 1234"], ["03", 12990, "UBER *TRIP"], ["04", 8900, "IFD*RESTAURANTE"]]) add("lancamentos", { data: `${ym}-${dia}`, tipo: "despesa", centavos: cents, categoriaId: null, moeda: "BRL", contaId: "c-corrente", meio: "debito", status: "efetivado", origem: "importacao", descricao: desc });

  // Dívidas
  add("dividas", { id: "d-emp", nome: "Empréstimo pessoal", saldoCentavos: 800000, taxaMensalBp: 350, parcelaMinimaCentavos: 62000, parcelasRestantes: 16, diaVencimento: 15 });
  add("dividas", { id: "d-parc", nome: "Parcelamento do cartão", saldoCentavos: 240000, taxaMensalBp: 1200, parcelaMinimaCentavos: 30000, parcelasRestantes: null, diaVencimento: 10 });
  // A menor dívida com o MENOR juro: é o caso em que avalanche e bola de neve divergem (senão a tela mostraria empate).
  add("dividas", { id: "d-loja", nome: "Carnê da loja", saldoCentavos: 90000, taxaMensalBp: 190, parcelaMinimaCentavos: 15000, parcelasRestantes: 6, diaVencimento: 20 });

  // Metas
  add("metas", { id: "m-reserva", nome: "Reserva de 6 meses", tipo: "reserva", alvo: 1800000, contaId: "c-reserva", atual: null, prazo: null });
  add("metas", { id: "m-poup", nome: "Poupar 20%", tipo: "poupanca", alvo: 20 });
  add("metas", { id: "m-treino", nome: "Treinar 3x", tipo: "treino", alvo: 3 });
  add("metas", { id: "m-peso", nome: "Chegar a 78 kg", tipo: "peso", alvo: 78 });
  add("metas", { id: "m-viagem", nome: "Viagem", tipo: "objetivo", alvo: 900000, atual: 300000, prazo: somarMeses(ym, 9) + "-30", taxaBp: 1365, inflacaoBp: 422 });
  add("metas", { id: "m-indep", nome: "Viver de renda", tipo: "independencia", alvo: 500000 });

  // Pesos: 12 semanas, 3 pesagens por semana, de 84,0 descendo até ~81,2 com ruído determinístico
  for (let k = 83; k >= 0; k--) {
    if (k % 7 === 1 || k % 7 === 4 || k % 7 === 6) continue;
    const data = somarDias(hoje, -k);
    const kg = Math.round((81.2 + (k / 83) * 2.8 + (((k * 37) % 10) - 5) / 20) * 10) / 10;
    add("pesos", { data, kg });
  }
  // Treinos: 2 a 4 por semana nas últimas 10 semanas (uma semana com 1, para a grade não ficar toda igual)
  const padrao = [[0, 2, 4], [1, 3], [0, 2, 4, 5], [2], [0, 2, 4], [1, 3, 5], [0, 2], [1, 3, 4], [0, 2, 4], [0, 2]];
  for (let s = 9; s >= 0; s--) {
    const seg = somarDias(hoje, -7 * s - ((new Date(hoje + "T00:00:00Z").getUTCDay() + 6) % 7));
    for (const di of padrao[s]) { const data = somarDias(seg, di); if (data <= hoje) add("treinos", { data, tipo: di % 2 ? "Corrida" : "Musculação", minutos: 50, esforco: 3 }); }
  }
  // Medidas
  add("medidas", { data: somarDias(hoje, -30), cinturaCm: 92, pescocoCm: 39 });
  add("medidas", { data: somarDias(hoje, -2), cinturaCm: 90, pescocoCm: 39 });
  d = { ...d, perfil: { ...d.perfil, sexo: "m", alturaCm: 178 } };

  // Snapshots dos 11 meses anteriores (patrimônio subindo)
  const snaps = [];
  for (let k = 11; k >= 1; k--) { const base = 1300000 + (11 - k) * 110000 + ((k * 53) % 7) * 10000; snaps.push({ ym: somarMeses(ym, -k), patrimonioCentavos: base, ativos: base + 1040000, passivos: 1040000 }); }
  d = { ...d, snapshots: snaps, meta: { ...d.meta, ultimoBackupEm: somarDias(hoje, -40) + "T10:00:00.000Z" } };
  return d;
}
