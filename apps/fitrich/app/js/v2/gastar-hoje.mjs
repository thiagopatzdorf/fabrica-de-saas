// "Dá para gastar hoje" (safe-to-spend): o que sobra do mês dividido pelos dias que faltam, hoje
// incluído. floor, não round: arredondar para cima diria à pessoa que ela pode gastar um centavo que
// não tem. Devolve códigos; o texto é da UI.
import { diasEntre, mesDe, ultimoDiaDoMes } from "../datas.mjs";

export function podeGastarHoje({ receitaPrevistaMes = 0, fixasRestantes = 0, parcelasCartaoMes = 0, aportesMetas = 0, gastoVariavelFeito = 0, hoje }) {
  for (const v of [receitaPrevistaMes, fixasRestantes, parcelasCartaoMes, aportesMetas, gastoVariavelFeito]) {
    if (!Number.isInteger(v) || v < 0) throw new RangeError("valores em centavos inteiros, não negativos");
  }
  const diasRestantes = diasEntre(hoje, ultimoDiaDoMes(mesDe(hoje))) + 1; // último dia do mês → 1
  const disponivelMes = receitaPrevistaMes - fixasRestantes - parcelasCartaoMes - aportesMetas - gastoVariavelFeito;
  const porDia = Math.floor(disponivelMes / diasRestantes);
  const semReceita = receitaPrevistaMes === 0;
  return {
    porDiaCentavos: porDia,
    disponivelMesCentavos: disponivelMes,
    diasRestantes,
    acimaDoLimite: disponivelMes < 0,
    semReceita,
    codigo: semReceita ? "sem_receita" : disponivelMes < 0 ? "acima_do_limite" : "ok",
  };
}
