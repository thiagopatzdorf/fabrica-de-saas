// Recorrências (aluguel, salário, assinatura) num modelo simplificado tipo RRULE:
//   { freq: "semanal"|"mensal"|"anual"|"diasUteis", intervalo, diaDoMes, ajuste, inicio, fim?, ativa }
// Toda ocorrência é calculada A PARTIR DA DATA ORIGINAL (`inicio`), nunca encadeando a anterior:
// mensal dia 31 começando em 31/01 dá 28/02, 31/03, 30/04 — encadear daria 28/02, 28/03, 28/04,
// e o aluguel passaria a vencer no dia errado para sempre depois de um fevereiro.
// `ajuste`: "ultimoDia" (dia que não existe no mês vira o último dia; é o padrão), "proximoDiaUtil",
// "diaUtilAnterior" (depois de encaixar no mês, move para o dia útil). `fim` é inclusivo.
import { mesDe, somarDias, somarMeses, ultimoDiaDoMes } from "../datas.mjs";
import { diaUtilAnterior, enesimoDiaUtilDoMes, proximoDiaUtil } from "./feriados.mjs";
import { faturaDaCompra } from "./cartao.mjs";

const LIMITE = 5000; // ocorrências por chamada: 96 anos de semanal; protege contra intervalo 0 ou laço sem fim

function diaNoMes(ym, dia) {
  const ultimo = ultimoDiaDoMes(ym);
  return dia >= Number(ultimo.slice(8, 10)) ? ultimo : `${ym}-${String(dia).padStart(2, "0")}`;
}

function ajustar(iso, ajuste) {
  if (ajuste === "proximoDiaUtil") return proximoDiaUtil(iso);
  if (ajuste === "diaUtilAnterior") return diaUtilAnterior(iso);
  return iso;
}

// k-ésima ocorrência (k = 0 é a primeira), ou null quando o mês não tem o enésimo dia útil pedido.
export function ocorrencia(rec, k) {
  const intervalo = Math.max(1, rec.intervalo ?? 1);
  const inicio = rec.inicio, ymInicio = mesDe(inicio);
  switch (rec.freq) {
    case "semanal": return ajustar(somarDias(inicio, 7 * intervalo * k), rec.ajuste);
    case "mensal": return ajustar(diaNoMes(somarMeses(ymInicio, intervalo * k), rec.diaDoMes ?? Number(inicio.slice(8, 10))), rec.ajuste);
    case "anual": return ajustar(diaNoMes(somarMeses(ymInicio, 12 * intervalo * k), Number(inicio.slice(8, 10))), rec.ajuste);
    case "diasUteis": return enesimoDiaUtilDoMes(somarMeses(ymInicio, intervalo * k), rec.diaDoMes ?? 1);
    default: throw new RangeError(`freq desconhecida: ${rec.freq}`);
  }
}

// Datas das ocorrências em [de, ate], ambos inclusivos, respeitando inicio/fim e `ativa`.
export function proximasOcorrencias(rec, de, ate) {
  if (rec.ativa === false || !rec.inicio || ate < de) return [];
  const fim = rec.fim && rec.fim < ate ? rec.fim : ate;
  const intervalo = Math.max(1, rec.intervalo ?? 1);
  const datas = [];
  for (let k = 0; k < LIMITE; k++) {
    const d = ocorrencia(rec, k);
    if (d === null) { // mês sem o enésimo dia útil: pula, mas para quando o mês já passou do fim
      if (somarMeses(mesDe(rec.inicio), k * intervalo) > mesDe(fim)) break;
      continue;
    }
    if (d > fim) break;
    if (d >= de) datas.push(d); // o ajuste pode mover a 1ª ocorrência para antes de `inicio` (sábado 10 → sexta 9): vale

  }
  return datas;
}

export const proximaOcorrencia = (rec, aPartirDe) => proximasOcorrencias(rec, aPartirDe, somarDias(aPartirDe, 366 * 4))[0] ?? null;

// Gera os lançamentos `status: "previsto"` das ocorrências até `ate`, pulando as datas que já têm
// lançamento desta recorrência em `existentes` (previsto ou já confirmado): materializar duas vezes
// não duplica. A data planejada fica em `dataPrevista`, porque ao confirmar a pessoa pode mudar a
// `data` (pagou dia 6 o que vencia dia 5) e a ocorrência do dia 5 precisa continuar ocupada.
// `cartao` só é preciso quando a recorrência é no cartão (define a fatura).
export function materializar(rec, ate, novoId, { de = rec.inicio, existentes = [], cartao = null, agora = null } = {}) {
  const ocupadas = new Set(existentes.filter((l) => l.recorrenciaId === rec.id).map((l) => l.dataPrevista ?? l.data));
  return proximasOcorrencias(rec, de, ate).filter((d) => !ocupadas.has(d)).map((data) => {
    const l = {
      id: novoId(), data, dataPrevista: data, tipo: rec.tipo, centavos: rec.centavos, categoriaId: rec.categoriaId, descricao: rec.nome ?? "", tags: rec.tags ?? [],
      meio: rec.meio ?? "outro", moeda: rec.moeda ?? "BRL", status: "previsto", recorrenciaId: rec.id, origem: "manual",
    };
    if (rec.cartaoId) { l.cartaoId = rec.cartaoId; if (cartao) l.fatura = faturaDaCompra(cartao, data); } else l.contaId = rec.contaId;
    if (agora) l.atualizadoEm = agora;
    return l;
  });
}

// Confirma uma ocorrência prevista: o MESMO lançamento vira efetivado (com valor/data reais se vieram
// diferentes do previsto). Nada é criado, então não há como duplicar. Devolve a lista nova.
export function confirmarOcorrencia(lancamentos, id, { data, centavos, agora } = {}) {
  let achou = false;
  const lista = lancamentos.map((l) => {
    if (l.id !== id) return l;
    achou = true;
    const n = { ...l, status: "efetivado" };
    if (data) n.data = data;
    if (Number.isInteger(centavos)) n.centavos = centavos;
    if (agora) n.atualizadoEm = agora;
    return n;
  });
  if (!achou) throw new RangeError(`lançamento não encontrado: ${id}`);
  return lista;
}
