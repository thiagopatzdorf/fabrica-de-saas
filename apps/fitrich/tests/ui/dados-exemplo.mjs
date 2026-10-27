// Dados de exemplo das telas Finanças e Cartões: montados SÓ pelas funções do esquema e do motor (adicionar,
// gerarParcelas, estornarCompra, pagarFatura, materializar), então o que a tela recebe é um estado v2 válido.
// Cobrem o que a tela precisa mostrar: 7 meses de lançamentos, cartão com fatura paga, fatura vencida a pagar,
// fatura aberta, parcelas futuras, estorno, importados sem categoria, previstos, transferência e limites.
// `hoje` é injetado: 2026-10-05 é uma segunda-feira; a fatura 2026-09 (fechou 10/09, venceu 17/09) está vencida.
import { adicionar, definir, validar, vazio } from "../../app/js/v2/esquema.mjs";
import { estornarCompra, pagarFatura, resumoDaFatura } from "../../app/js/v2/cartao.mjs";
import { gerarParcelas } from "../../app/js/v2/parcelas.mjs";
import { materializar } from "../../app/js/v2/recorrencia.mjs";
import { somarDias, somarMeses, mesDe } from "../../app/js/datas.mjs";

export const HOJE = "2026-10-05";
export const AGORA = `${HOJE}T12:00:00.000Z`;

export function contadorDeIds(prefixo = "ex") { let n = 0; return () => `${prefixo}-${String(++n).padStart(4, "0")}`; }

export function dadosExemplo({ hoje = HOJE, agora = () => AGORA, novoId = contadorDeIds() } = {}) {
  const o = { novoId, agora };
  let d = vazio({ agora });
  d = adicionar(d, "contas", { id: "conta-cc", nome: "Conta corrente", tipo: "corrente", moeda: "BRL", saldoInicialCentavos: 350000, dataSaldoInicial: "2026-03-01", arquivada: false }, o);
  d = adicionar(d, "contas", { id: "conta-poup", nome: "Poupança", tipo: "poupanca", moeda: "BRL", saldoInicialCentavos: 1200000, dataSaldoInicial: "2026-03-01", arquivada: false }, o);
  d = adicionar(d, "cartoes", { id: "cartao-roxo", nome: "Cartão Roxo", diaFechamento: 10, diaVencimento: 17, fechaInclusivo: false, limiteCentavos: 500000, contaPagamentoId: "conta-cc" }, o);
  const cartao = d.cartoes[0];

  const lanc = (x) => { d = adicionar(d, "lancamentos", { tags: [], meio: "outro", moeda: "BRL", status: "efetivado", origem: "manual", descricao: "", ...x }, o); };
  const ymHoje = mesDe(hoje);
  // Seis meses fechados + o atual (parcial). Valores variam por mês para a tendência não ser uma reta.
  for (let k = 6; k >= 0; k--) {
    const ym = somarMeses(ymHoje, -k), dia = (n) => `${ym}-${String(n).padStart(2, "0")}`, atual = k === 0;
    lanc({ data: dia(5), tipo: "receita", centavos: 650000, categoriaId: "cat-salario", contaId: "conta-cc", descricao: "Salário", meio: "pix" });
    if (k % 3 === 0) lanc({ data: dia(20), tipo: "receita", centavos: 80000 + k * 5000, categoriaId: "cat-extra", contaId: "conta-cc", descricao: "Freela", meio: "pix" });
    if (!atual) lanc({ data: dia(10), tipo: "despesa", centavos: 180000, categoriaId: "cat-moradia", contaId: "conta-cc", descricao: "Aluguel", meio: "boleto" });
    lanc({ data: dia(3), tipo: "despesa", centavos: 42000 + k * 1500, categoriaId: "cat-mercado", contaId: "conta-cc", descricao: "Supermercado", meio: "debito" });
    if (!atual) lanc({ data: dia(18), tipo: "despesa", centavos: 38500 - k * 900, categoriaId: "cat-mercado", cartaoId: "cartao-roxo", descricao: "Mercado do bairro", meio: "credito" });
    lanc({ data: dia(2), tipo: "despesa", centavos: 12990, categoriaId: "cat-saude-fitness", cartaoId: "cartao-roxo", descricao: "Academia", meio: "credito" });
    lanc({ data: dia(1), tipo: "despesa", centavos: 4990, categoriaId: "cat-assinaturas", cartaoId: "cartao-roxo", descricao: "Streaming", meio: "credito" });
    if (!atual) lanc({ data: dia(14), tipo: "despesa", centavos: 21000 + (k % 2) * 6000, categoriaId: "cat-transporte", contaId: "conta-cc", descricao: "Combustível", meio: "debito" });
    if (!atual) lanc({ data: dia(22), tipo: "despesa", centavos: 19900 + k * 2100, categoriaId: "cat-delivery", cartaoId: "cartao-roxo", descricao: "Delivery", meio: "credito" });
    if (!atual) lanc({ data: dia(25), tipo: "despesa", centavos: 15000 + (6 - k) * 4000, categoriaId: "cat-lazer", cartaoId: "cartao-roxo", descricao: "Cinema e bar", meio: "credito", tags: k === 1 ? ["viagem"] : [] });
  }
  // Mês atual: lazer passa do limite, delivery fica perto, mercado dentro.
  lanc({ data: `${ymHoje}-02`, tipo: "despesa", centavos: 36000, categoriaId: "cat-lazer", cartaoId: "cartao-roxo", descricao: "Show", meio: "credito", tags: ["viagem"] });
  lanc({ data: `${ymHoje}-04`, tipo: "despesa", centavos: 21500, categoriaId: "cat-delivery", cartaoId: "cartao-roxo", descricao: "Jantar", meio: "credito" });
  // Transferência para a poupança: visível, fora do gasto.
  lanc({ data: `${ymHoje}-01`, tipo: "transferencia", centavos: 50000, categoriaId: null, contaId: "conta-cc", contaDestinoId: "conta-poup", descricao: "Guardar", meio: "pix" });
  // Importados sem categoria (nenhuma regra casou): pendentes de classificação.
  lanc({ data: `${ymHoje}-03`, tipo: "despesa", centavos: 8750, categoriaId: null, contaId: "conta-cc", descricao: "PAG*LOJAXYZ 1234", meio: "debito", origem: "importacao" });
  lanc({ data: `${ymHoje}-04`, tipo: "despesa", centavos: 3200, categoriaId: null, contaId: "conta-cc", descricao: "TED RECEBIDA 00019", meio: "outro", origem: "importacao" });

  // Compra parcelada em 6x no dia 20 do mês de dois meses atrás (fatura do mês seguinte à compra, pois 20 > 10).
  const ymCompra = somarMeses(ymHoje, -2);
  const parcelas = gerarParcelas({ compra: { data: `${ymCompra}-20`, centavos: 60000, categoriaId: "cat-vestuario", descricao: "Tênis de corrida", tags: [], moeda: "BRL", origem: "manual" }, cartao, n: 6, novoId });
  for (const p of parcelas) lanc(p);

  // Faturas de abril a agosto pagas no vencimento (transferência conta → cartão); a de setembro fica vencida.
  for (let k = 6; k >= 2; k--) {
    const ymPaga = somarMeses(ymHoje, -k), total = resumoDaFatura(cartao, d.lancamentos, ymPaga, hoje).totalCentavos;
    if (total <= 0) continue;
    const pagamento = pagarFatura({ cartao, lancamentos: d.lancamentos, ym: ymPaga, centavos: total, data: `${ymPaga}-17`, novoId });
    lanc(pagamento.lancamento);
    d = adicionar(d, "faturas", pagamento.fatura, o);
  }

  // Estorno de uma compra à vista do mês passado, devolvido este mês (cai na fatura aberta).
  lanc({ id: "compra-fone", data: `${somarMeses(ymHoje, -1)}-02`, tipo: "despesa", centavos: 29900, categoriaId: "cat-lazer", cartaoId: "cartao-roxo", descricao: "Fone", meio: "credito" });
  const compra = d.lancamentos.find((l) => l.id === "compra-fone");
  const est = estornarCompra({ cartao, compra, lancamentos: d.lancamentos, data: `${ymHoje}-01`, novoId, agora });
  d = { ...d, lancamentos: est.lancamentos };

  // Recorrências: aluguel (dia 10) e salário (dia 5) materializados como previstos até 60 dias à frente.
  d = adicionar(d, "recorrencias", { id: "rec-aluguel", nome: "Aluguel", tipo: "despesa", centavos: 180000, categoriaId: "cat-moradia", contaId: "conta-cc", freq: "mensal", intervalo: 1, diaDoMes: 10, ajuste: "ultimoDia", inicio: `${ymHoje}-10`, fim: null, ativa: true }, o);
  d = adicionar(d, "recorrencias", { id: "rec-salario", nome: "Salário", tipo: "receita", centavos: 650000, categoriaId: "cat-salario", contaId: "conta-cc", freq: "mensal", intervalo: 1, diaDoMes: 5, ajuste: "ultimoDia", inicio: `${somarMeses(ymHoje, 1)}-05`, fim: null, ativa: true }, o);
  for (const rec of d.recorrencias) for (const p of materializar(rec, somarDias(hoje, 60), novoId, { existentes: d.lancamentos, agora: agora() })) lanc(p);

  d = definir(d, "orcamento", { limites: { "cat-mercado": 90000, "cat-lazer": 30000, "cat-delivery": 25000, "cat-transporte": 40000, "cat-moradia": 200000 } }, o);
  const v = validar(d);
  if (!v.ok) throw new Error(`dados de exemplo inválidos: ${JSON.stringify(v.erros)}`);
  return d;
}
