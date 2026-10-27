// Dados de exemplo: um mês fictício para a pessoa ver o app funcionando antes de ter dado próprio.
// Regras duras: (1) nunca vai para o armazém, vive só na memória da sessão; (2) todo registro fictício
// tem id com PREFIXO fixo, então `ehExemplo` reconhece e `sairDoExemplo` apaga tudo que é exemplo sem
// confundir com dado real; (3) some ao primeiro lançamento real (o shell chama `sairDoExemplo` dentro
// do `mudar`), ficando só o que a pessoa acabou de criar e o que ele referencia.
// Datas relativas a `hoje` para o exemplo nunca "envelhecer" e os números ficarem coerentes com o mês.
import { mesDe, somarDias, somarMeses, ultimoDiaDoMes } from "../../datas.mjs";
import { adicionar, definir, validar, vazio } from "../esquema.mjs";
import { CONTA_PADRAO_ID, garantirConta } from "./conta-padrao.mjs";
import { exemploTreino } from "../treino/exemplo.mjs";

export const PREFIXO = "exemplo-";
export const ehIdExemplo = (id) => typeof id === "string" && id.startsWith(PREFIXO);
export const ehExemplo = (d) => !!d && d.meta?.exemplo === true;

// Nome das coisas fictícias por idioma (é texto de DADO, não de interface, por isso não passa pelo t()).
const NOMES = {
  "pt-BR": { conta: "Carteira", cartao: "Cartão principal", salario: "Salário", aluguel: "Aluguel", academia: "Academia", internet: "Internet", reserva: "Reserva de emergência", viagem: "Viagem de fim de ano",
    compras: ["Feira", "Almoço", "Ônibus", "Farmácia", "Cinema", "Padaria", "Combustível", "Supermercado", "Café", "Lanche"] },
  en: { conta: "Wallet", cartao: "Main card", salario: "Salary", aluguel: "Rent", academia: "Gym", internet: "Internet", reserva: "Emergency fund", viagem: "Year-end trip",
    compras: ["Market", "Lunch", "Bus", "Pharmacy", "Movies", "Bakery", "Fuel", "Groceries", "Coffee", "Snack"] },
};

export function dadosExemplo({ hoje, agora, idioma = "pt-BR" }) {
  const n = NOMES[idioma] ?? NOMES["pt-BR"];
  const op = { agora };
  const ym = mesDe(hoje), inicioMes = `${ym}-01`, dia = Number(hoje.slice(8, 10));
  const umId = (() => { let k = 0; return (r) => `${PREFIXO}${r}-${++k}`; })();
  let d = vazio({ agora });
  d = garantirConta(d, { nome: n.conta, hoje: somarMeses(ym, -6) + "-01", agora });
  d = { ...d, contas: d.contas.map((c) => (c.id === CONTA_PADRAO_ID ? { ...c, saldoInicialCentavos: 180000 } : c)) };
  d = adicionar(d, "cartoes", { id: `${PREFIXO}cartao`, nome: n.cartao, diaFechamento: 25, diaVencimento: 5, fechaInclusivo: false, limiteCentavos: 450000, contaPagamentoId: CONTA_PADRAO_ID }, op);
  d = adicionar(d, "recorrencias", { id: umId("rec"), nome: n.salario, tipo: "receita", centavos: 480000, categoriaId: "cat-salario", contaId: CONTA_PADRAO_ID, freq: "mensal", intervalo: 1, diaDoMes: 5, inicio: somarMeses(ym, -6) + "-05", ativa: true }, op);
  d = adicionar(d, "recorrencias", { id: umId("rec"), nome: n.aluguel, tipo: "despesa", centavos: 150000, categoriaId: "cat-moradia", contaId: CONTA_PADRAO_ID, freq: "mensal", intervalo: 1, diaDoMes: 10, inicio: somarMeses(ym, -6) + "-10", ativa: true }, op);
  d = adicionar(d, "recorrencias", { id: umId("rec"), nome: n.academia, tipo: "despesa", centavos: 11990, categoriaId: "cat-saude-fitness", cartaoId: `${PREFIXO}cartao`, freq: "mensal", intervalo: 1, diaDoMes: 15, inicio: somarMeses(ym, -6) + "-15", ativa: true }, op);
  d = adicionar(d, "recorrencias", { id: umId("rec"), nome: n.internet, tipo: "despesa", centavos: 9990, categoriaId: "cat-moradia", contaId: CONTA_PADRAO_ID, freq: "mensal", intervalo: 1, diaDoMes: 20, inicio: somarMeses(ym, -6) + "-20", ativa: true }, op);

  const lanc = (data, extra) => { d = adicionar(d, "lancamentos", { id: umId("lanc"), data, moeda: "BRL", meio: "outro", contaId: CONTA_PADRAO_ID, ...extra }, op); };
  const cats = ["cat-mercado", "cat-delivery", "cat-transporte", "cat-saude-fitness", "cat-lazer", "cat-mercado", "cat-transporte", "cat-mercado", "cat-delivery", "cat-lazer"];
  const valores = [18740, 3290, 880, 4590, 6400, 1250, 15000, 23960, 1190, 2450];
  // Três meses passados com salário, aluguel e gastos variados: tendência tem o que mostrar.
  for (let m = 3; m >= 1; m--) {
    const ymP = somarMeses(ym, -m);
    lanc(`${ymP}-05`, { tipo: "receita", centavos: 480000, categoriaId: "cat-salario", descricao: n.salario, recorrenciaId: `${PREFIXO}rec-1` });
    lanc(`${ymP}-10`, { tipo: "despesa", centavos: 150000, categoriaId: "cat-moradia", descricao: n.aluguel, recorrenciaId: `${PREFIXO}rec-2` });
    lanc(`${ymP}-20`, { tipo: "despesa", centavos: 9990, categoriaId: "cat-moradia", descricao: n.internet, recorrenciaId: `${PREFIXO}rec-4` });
    for (let i = 0; i < 10; i++) lanc(`${ymP}-${String(2 + i * 2).padStart(2, "0")}`, { tipo: "despesa", centavos: valores[i] + m * 37 * (i + 1), categoriaId: cats[i], descricao: n.compras[i] });
  }
  // Mês corrente: salário recebido (se já passou o dia 5), aluguel pago (se já passou o dia 10) e gastos até hoje.
  if (dia >= 5) lanc(`${ym}-05`, { tipo: "receita", centavos: 480000, categoriaId: "cat-salario", descricao: n.salario, recorrenciaId: `${PREFIXO}rec-1` });
  if (dia >= 10) lanc(`${ym}-10`, { tipo: "despesa", centavos: 150000, categoriaId: "cat-moradia", descricao: n.aluguel, recorrenciaId: `${PREFIXO}rec-2` });
  if (dia >= 20) lanc(`${ym}-20`, { tipo: "despesa", centavos: 9990, categoriaId: "cat-moradia", descricao: n.internet, recorrenciaId: `${PREFIXO}rec-4` });
  for (let i = 0; i < 10; i++) { const dd = 1 + i * 3; if (dd <= dia) lanc(`${ym}-${String(dd).padStart(2, "0")}`, { tipo: "despesa", centavos: valores[i], categoriaId: cats[i], descricao: n.compras[i] }); }
  // Compra parcelada no cartão (3x) feita no mês passado: parcelas caem nas próximas faturas.
  const grupo = `${PREFIXO}parc`;
  const dataCompra = somarMeses(ym, -1) + "-12";
  for (let k = 1; k <= 3; k++) {
    d = adicionar(d, "lancamentos", { id: umId("lanc"), data: dataCompra, tipo: "despesa", centavos: 29990, categoriaId: "cat-vestuario", descricao: idioma === "en" ? "Running shoes 3x" : "Tênis de corrida 3x", moeda: "BRL", meio: "credito", cartaoId: `${PREFIXO}cartao`, fatura: somarMeses(ym, k - 1), parcela: { grupoId: grupo, n: k, de: 3, totalCentavos: 89970 } }, op);
  }
  d = adicionar(d, "lancamentos", { id: umId("lanc"), data: somarDias(hoje, -1) < inicioMes ? inicioMes : somarDias(hoje, -1), tipo: "despesa", centavos: 7490, categoriaId: "cat-delivery", descricao: n.compras[1], moeda: "BRL", meio: "credito", cartaoId: `${PREFIXO}cartao` }, op);

  d = definir(d, "orcamento", { metodo: "limites", rollover: false, limites: { "cat-mercado": 60000, "cat-delivery": 25000, "cat-lazer": 20000, "cat-transporte": 30000 } }, op);
  d = adicionar(d, "metas", { id: umId("meta"), nome: n.reserva, tipo: "reserva", alvo: 1500000, atual: 620000 }, op);
  d = adicionar(d, "metas", { id: umId("meta"), nome: n.viagem, tipo: "objetivo", alvo: 600000, atual: 150000, prazo: ultimoDiaDoMes(somarMeses(ym, 5)) }, op);
  d = adicionar(d, "metas", { id: umId("meta"), nome: "Treinos", tipo: "treino", alvo: 3 }, op);
  d = adicionar(d, "metas", { id: umId("meta"), nome: "Peso", tipo: "peso", alvo: 76 }, op);
  // Peso e treinos das últimas 8 semanas: tendência leve de queda, 2–3 treinos por semana.
  for (let k = 55; k >= 0; k -= 2) d = adicionar(d, "pesos", { id: umId("peso"), data: somarDias(hoje, -k), kg: Math.round((80.4 - (55 - k) * 0.03 + ((k * 7) % 5) * 0.08) * 10) / 10 }, op);
  const tipos = ["Musculação", "Corrida", "Musculação", "Caminhada", "Musculação", "Bicicleta"];
  for (let k = 0; k < 56; k++) { if (k % 7 === 1 || k % 7 === 3 || (k % 7 === 5 && k % 14 === 5)) d = adicionar(d, "treinos", { id: umId("treino"), data: somarDias(hoje, -k), tipo: tipos[k % 6], minutos: 40 + (k % 3) * 10, esforco: 3 }, op); }
  d = adicionar(d, "medidas", { id: umId("medida"), data: somarDias(hoje, -14), cinturaCm: 91, pescocoCm: 39 }, op);
  d = { ...d, perfil: { ...d.perfil, sexo: "m", alturaCm: 178, idioma }, meta: { ...d.meta, exemplo: true } };
  d = exemploTreino(d, { hoje, agora, idioma }); // 9 semanas de força e cardio (js/v2/treino/exemplo.mjs)
  const v = validar(d);
  if (!v.ok) throw new Error("dados de exemplo inválidos: " + v.erros.map((e) => e.codigo).join(", "));
  return d;
}

// Tira tudo que é exemplo e devolve o que sobrou como dado real. Mantém os itens de exemplo que o dado
// real ainda referencia (a pessoa lançou no cartão de exemplo: o cartão fica, agora dela). Orçamento,
// perfil e tombstones do exemplo voltam ao zero: eram cenário, não escolha.
export function sairDoExemplo(d) {
  if (!ehExemplo(d)) return d;
  const limpo = { ...d, meta: { ...d.meta, removidos: d.meta.removidos.filter((r) => !ehIdExemplo(r.id)) } };
  delete limpo.meta.exemplo;
  const colecoes = ["lancamentos", "recorrencias", "faturas", "metas", "dividas", "investimentos", "regras", "importacoes", "pesos", "medidas", "treinos", "snapshots", "rotinas", "sessoes", "cardio", "exercicios"];
  for (const c of colecoes) limpo[c] = d[c].filter((x) => !ehIdExemplo(x.id ?? x.cartaoId));
  const usados = new Set();
  for (const l of limpo.lancamentos) for (const k of ["contaId", "cartaoId", "contaDestinoId", "categoriaId"]) if (l[k]) usados.add(l[k]);
  for (const r of limpo.recorrencias) for (const k of ["contaId", "cartaoId", "categoriaId"]) if (r[k]) usados.add(r[k]);
  limpo.cartoes = d.cartoes.filter((c) => !ehIdExemplo(c.id) || usados.has(c.id));
  for (const c of limpo.cartoes) usados.add(c.contaPagamentoId);
  limpo.contas = d.contas.filter((c) => !ehIdExemplo(c.id) || usados.has(c.id)).map((c) => (c.id === CONTA_PADRAO_ID ? { ...c, saldoInicialCentavos: 0 } : c));
  limpo.categorias = d.categorias.filter((c) => !ehIdExemplo(c.id) || usados.has(c.id));
  const base = vazio({ agora: () => d.meta.atualizadoEm });
  limpo.orcamento = base.orcamento;
  limpo.perfil = { ...base.perfil, idioma: d.perfil.idioma, moedaPadrao: d.perfil.moedaPadrao };
  return limpo;
}
