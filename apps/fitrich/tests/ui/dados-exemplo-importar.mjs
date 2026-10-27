// Dados de exemplo das telas Importar/Dados/Regras: duas contas, um cartão, lançamentos manuais e um importado.
// Montados com `adicionar` do esquema (passam pelo validador), ids fixos para o teste conferir.
// Casos armados de propósito:
//  - Inter tem "Pix recebido José da Silva" +45,90 em 02/07: os extratos do Nubank (OFX e CSV) trazem a saída
//    −45,90 "Pix enviado José" no mesmo dia → sugestão de transferência conta↔conta.
//  - Nubank tem "Pagamento fatura cartão" −500,00 em 10/07: o CSV traz "Pagamento de fatura" −500,00 na mesma
//    data → possível duplicata (descrição diferente, mesma data e valor).
//  - Uma descrição começando com "=" prova a proteção contra fórmula no CSV exportado.
//  - Um lançamento `origem: "importacao"` para a tela Regras ter o que explicar.
import { adicionar, vazio } from "../../app/js/v2/esquema.mjs";

export const AGORA = "2026-10-05T12:00:00.000Z";
export const HOJE = "2026-10-05";

export function dadosExemplo({ agora = () => AGORA } = {}) {
  const op = { agora, novoId: () => { throw new Error("id fixo esperado"); } };
  let d = vazio({ agora });
  d = adicionar(d, "contas", { id: "conta-nu", nome: "Nubank", tipo: "corrente", moeda: "BRL", saldoInicialCentavos: 100000, dataSaldoInicial: "2026-06-01", arquivada: false }, op);
  d = adicionar(d, "contas", { id: "conta-inter", nome: "Inter", tipo: "corrente", moeda: "BRL", saldoInicialCentavos: 50000, dataSaldoInicial: "2026-06-01", arquivada: false }, op);
  d = adicionar(d, "cartoes", { id: "cartao-nu", nome: "Nubank cartão", diaFechamento: 3, diaVencimento: 10, fechaInclusivo: true, limiteCentavos: 500000, contaPagamentoId: "conta-nu" }, op);
  d = adicionar(d, "importacoes", { id: "imp-antiga", arquivo: "junho.ofx", hashArquivo: "abc", em: "2026-06-30T10:00:00.000Z", contaId: "conta-nu", cartaoId: null, idsCriados: ["l-imp-1"] }, op);
  const lanc = (x) => { d = adicionar(d, "lancamentos", { moeda: "BRL", status: "efetivado", meio: "outro", ...x }, op); };
  lanc({ id: "l-1", data: "2026-07-01", tipo: "receita", centavos: 650000, categoriaId: "cat-salario", descricao: "Salário", contaId: "conta-nu", meio: "pix" });
  lanc({ id: "l-2", data: "2026-07-02", tipo: "receita", centavos: 4590, categoriaId: "cat-extra", descricao: "Pix recebido José da Silva", contaId: "conta-inter", meio: "pix" });
  lanc({ id: "l-3", data: "2026-07-10", tipo: "despesa", centavos: 50000, categoriaId: "cat-outros", descricao: "Pagamento fatura cartão", contaId: "conta-nu", meio: "outro" });
  lanc({ id: "l-4", data: "2026-07-12", tipo: "despesa", centavos: 3200, categoriaId: "cat-delivery", descricao: "=HYPERLINK(\"http://x\";\"almoço\")", contaId: "conta-nu", meio: "debito" });
  lanc({ id: "l-imp-1", data: "2026-06-20", tipo: "despesa", centavos: 8990, categoriaId: "cat-mercado", descricao: "PG *PADARIA DO JOAO LTDA 1234", contaId: "conta-nu", meio: "debito", origem: "importacao", importacaoId: "imp-antiga", categoriaSugerida: { categoriaId: "cat-mercado", categoriaNome: "Mercado", regraId: "regra-padaria", origem: "usuario" } });
  lanc({ id: "l-imp-2", data: "2026-06-22", tipo: "despesa", centavos: 4500, categoriaId: null, descricao: "LOJA DESCONHECIDA 77", contaId: "conta-nu", meio: "debito", origem: "importacao", importacaoId: "imp-antiga" });
  d = adicionar(d, "regras", { id: "regra-padaria", padrao: "padaria", tipo: "contem", categoriaId: "cat-mercado", categoriaNome: "Mercado", prioridade: 0, origem: "usuario", acertos: 3 }, op);
  d = adicionar(d, "pesos", { id: "p-1", data: "2026-09-01", kg: 80.5 }, op);
  d = adicionar(d, "treinos", { id: "t-1", data: "2026-09-02", tipo: "Corrida", minutos: 30, esforco: 3 }, op);
  return d;
}
