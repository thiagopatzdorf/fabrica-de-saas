// Shape × finanças: o cruzamento que só existe porque corpo e dinheiro estão no mesmo app.
// Tudo aqui devolve NÚMEROS e CÓDIGOS; a UI decide o que mostrar e como. Em especial, nada neste
// arquivo comenta corpo ou comida (o caso Monzo mostrou que isso é invasivo): `deliveryVsPeso` é
// correlação descritiva, sem causalidade. E NUNCA sequência/streak: "X das últimas 8 semanas".
import { diasEntre, mesDe, somarMeses } from "../datas.mjs";
import { treinosPorSemana } from "../shape.mjs";
import { arredondar, exigirCentavos } from "./taxas.mjs";
import { despesasDoMes, receitasDoMes, taxaPoupancaBp } from "./lancamentos-soma.mjs";

// Academia ociosa: custo por treino do mês da mensalidade e alertas (códigos) quando o custo passa
// do limite escolhido ou quando há `diasSemTreinoAlerta` dias sem treino com plano ativo.
export function academiaOciosa({ mensalidadeCentavos, treinos, hoje, limiteCustoPorTreinoCentavos = null, planoAtivo = true, diasSemTreinoAlerta = 14 }) {
  exigirCentavos(mensalidadeCentavos);
  const ym = mesDe(hoje);
  const noMes = treinos.filter((t) => mesDe(t.data) === ym && t.data <= hoje).length;
  const ultimo = treinos.filter((t) => t.data <= hoje).map((t) => t.data).sort().pop() ?? null;
  const diasSemTreino = ultimo ? diasEntre(ultimo, hoje) : null;
  const custoPorTreinoCentavos = noMes > 0 ? arredondar(mensalidadeCentavos / noMes) : null;
  const alertas = [];
  if (planoAtivo && mensalidadeCentavos > 0) {
    if (noMes === 0 && Number(hoje.slice(8, 10)) >= 15) alertas.push("nenhum_treino_no_mes");
    if (limiteCustoPorTreinoCentavos != null && custoPorTreinoCentavos != null && custoPorTreinoCentavos > limiteCustoPorTreinoCentavos) alertas.push("custo_por_treino_acima_do_limite");
    if (diasSemTreino == null || diasSemTreino >= diasSemTreinoAlerta) alertas.push("sem_treino_ha_dias");
  }
  return { ym, treinosNoMes: noMes, custoPorTreinoCentavos, diasSemTreino, alertas };
}

// Gasto com saúde (categorias escolhidas pela pessoa) como fração da receita do mês. null sem receita.
export function saudeComoPercentualDaReceita({ lancamentos, ym, categoriaIdsSaude }) {
  const gasto = despesasDoMes(lancamentos, ym, { categoriaIds: categoriaIdsSaude }), receita = receitasDoMes(lancamentos, ym);
  return { ym, gastoCentavos: gasto, receitaCentavos: receita, bp: receita > 0 ? Math.round((gasto / receita) * 10000) : null };
}

// Custo por treino do mês: despesas lançadas nas categorias fitness + recorrências mensais ativas
// dessas categorias que AINDA não geraram lançamento no mês (senão contaria duas vezes).
export function custoPorTreino({ lancamentos, recorrencias = [], treinos, ym, categoriaIdsFitness }) {
  const ids = new Set(categoriaIdsFitness);
  let gasto = despesasDoMes(lancamentos, ym, { categoriaIds: categoriaIdsFitness, incluirPrevistos: true });
  const jaLancadas = new Set(lancamentos.filter((l) => l.recorrenciaId && mesDe(l.data) === ym).map((l) => l.recorrenciaId));
  for (const r of recorrencias) {
    if (r.ativa && r.tipo === "despesa" && r.freq === "mensal" && ids.has(r.categoriaId) && !jaLancadas.has(r.id) && (!r.fim || r.fim >= ym + "-01") && (!r.inicio || mesDe(r.inicio) <= ym)) gasto += exigirCentavos(r.centavos);
  }
  const n = treinos.filter((t) => mesDe(t.data) === ym).length;
  return { ym, gastoCentavos: gasto, treinos: n, custoPorTreinoCentavos: gasto > 0 && n > 0 ? arredondar(gasto / n) : null };
}

// Correlação de Pearson entre duas séries de mesmo tamanho; null com menos de 3 pontos ou variância zero.
export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3 || n !== ys.length) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let k = 0; k < n; k++) { sxy += (xs[k] - mx) * (ys[k] - my); sxx += (xs[k] - mx) ** 2; syy += (ys[k] - my) ** 2; }
  if (sxx === 0 || syy === 0) return null;
  return Math.round((sxy / Math.sqrt(sxx * syy)) * 1000) / 1000;
}

// Gasto mensal em delivery × peso médio do mês nos últimos `meses` meses até `ymFinal`. Devolve as
// duas séries e a correlação descritiva. Sem causalidade, sem texto: a UI decide se e como mostra.
export function deliveryVsPeso({ lancamentos, pesos, categoriaIdsDelivery, ymFinal, meses = 6 }) {
  const serie = [];
  for (let k = meses - 1; k >= 0; k--) {
    const ym = somarMeses(ymFinal, -k);
    const ps = pesos.filter((p) => mesDe(p.data) === ym);
    serie.push({ ym, deliveryCentavos: despesasDoMes(lancamentos, ym, { categoriaIds: categoriaIdsDelivery }), pesoMedioKg: ps.length ? Math.round((ps.reduce((s, p) => s + p.kg, 0) / ps.length) * 100) / 100 : null, pesagens: ps.length });
  }
  const completos = serie.filter((m) => m.pesoMedioKg != null);
  return { serie, mesesComDado: completos.length, correlacao: pearson(completos.map((m) => m.deliveryCentavos), completos.map((m) => m.pesoMedioKg)), codigo: "descritivo_sem_causalidade" };
}

// "X das últimas N semanas na meta de treino" (a corrente é a última). Nunca sequência.
export function semanasNaMeta({ treinos, hoje, metaTreinosSemana, n = 8 }) {
  const semanas = treinosPorSemana(treinos, hoje, n).map((s) => ({ ...s, naMeta: s.total >= metaTreinosSemana }));
  return { naMeta: semanas.filter((s) => s.naMeta).length, de: n, semanas, codigo: "x_de_n_semanas" };
}

// Meta dupla: poupar X % da receita no mês E treinar Y vezes por semana. Devolve as duas metades e
// o conjunto; a poupança é null sem receita lançada (não é "falhou").
export function metaDupla({ lancamentos, treinos, hoje, metaPoupancaBp = 2000, metaTreinosSemana = 3, semanas = 8 }) {
  const ym = mesDe(hoje);
  const bp = taxaPoupancaBp(lancamentos, ym);
  const poupanca = { ym, bp, metaBp: metaPoupancaBp, naMeta: bp == null ? null : bp >= metaPoupancaBp };
  const treino = semanasNaMeta({ treinos, hoje, metaTreinosSemana, n: semanas });
  const semanaAtual = treino.semanas[treino.semanas.length - 1];
  return { poupanca, treino: { ...treino, metaSemana: metaTreinosSemana, semanaAtualNaMeta: semanaAtual.naMeta }, ambasNaMeta: poupanca.naMeta === true && semanaAtual.naMeta };
}
