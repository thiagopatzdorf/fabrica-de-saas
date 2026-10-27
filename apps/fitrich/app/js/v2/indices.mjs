// Índices de mercado como SNAPSHOT ESTÁTICO, datado e com a série de origem. O app NUNCA busca na
// rede (decisão 1 do plano: `connect-src 'none'` é a prova de que nada sai do aparelho). Quem atualiza
// é a pessoa, digitando a taxa, ou um commit que troca os números abaixo e a data.
// Toda taxa de mercado aqui é "média BCB, não a sua": a UI rotula assim.
import { diasEntre, ehISO } from "../datas.mjs";
import { ehInteiro } from "./taxas.mjs";

export const DIAS_PARA_DESATUALIZADO = 45;

export const SNAPSHOT_INDICES = Object.freeze({
  atualizadoEm: "2026-10-02", // data da pesquisa que levantou os valores abaixo
  fonte: "BCB SGS + PTAX Olinda",
  // ✅ SGS 432 — meta Selic definida pelo Copom, % a.a. (13,75 %)
  selicBp: 1375,
  // ✅ SGS 4389 — CDI acumulado no ano, anualizado base 252, % a.a. (13,65 %)
  cdiBp: 1365,
  // ✅ SGS 433 — IPCA acumulado em 12 meses (4,22 %)
  ipca12Bp: 422,
  // ✅ SGS 226 — TR mensal: 0,1616 % a.m. O BCB publica com 4 decimais (16,16 bp); como taxa
  // guardada é bp INTEIRO (decisão 5), fica 16 bp = 0,16 % a.m. A perda (0,0016 p.p./mês) está
  // registrada no PR como proposta de campo com centésimos de bp, se a precisão vier a importar.
  trMensalBp: 16,
  // ✅ SGS 22022 — juros do rotativo do cartão, PF, % a.a. (444,89 %, ago/26). Média de mercado.
  rotativoPfBp: 44489,
  // ✅ SGS 22023 — juros do parcelado do cartão, PF, % a.a. (192,08 %, ago/26). Média de mercado.
  parceladoPfBp: 19208,
  // ✅ PTAX (Olinda, CotacaoDolarDia) de 02/10/2026: venda 5,2238. Taxa em "bp" = R$ × 10⁴.
  // A cotação de COMPRA do USD e as duas do EUR não foram conferidas na fonte (⚠️): compra fica
  // null em vez de um número inventado; o EUR 5,8810 é aproximado e marcado.
  ptax: Object.freeze({
    USD: Object.freeze({ compraBp: null, vendaBp: 52238, data: "2026-10-02" }),
    EUR: Object.freeze({ compraBp: null, vendaBp: 58810, data: "2026-10-02", aproximado: true }),
  }),
});

const CAMPOS_TAXA = ["selicBp", "cdiBp", "ipca12Bp", "trMensalBp", "rotativoPfBp", "parceladoPfBp"];

// Índices em vigor para o cálculo: o snapshot, com o que a pessoa digitou por cima. Só campos
// conhecidos passam, só inteiros não negativos; `origem` diz de onde veio cada número para a UI
// rotular "sua taxa" × "média BCB".
export function indicesVigentes(snapshot = SNAPSHOT_INDICES, overrideDoUsuario = {}) {
  const origem = {};
  const saida = {};
  for (const campo of CAMPOS_TAXA) {
    const digitado = overrideDoUsuario?.[campo];
    if (digitado != null) {
      if (!ehInteiro(digitado) || digitado < 0) throw new RangeError(`override_invalido:${campo}`);
      saida[campo] = digitado;
      origem[campo] = "usuario";
    } else {
      saida[campo] = snapshot[campo];
      origem[campo] = "snapshot";
    }
  }
  saida.ptax = snapshot.ptax;
  saida.atualizadoEm = snapshot.atualizadoEm;
  saida.fonte = snapshot.fonte;
  saida.origem = origem;
  return saida;
}

// Dias desde a data do snapshot. Acima de 45 dias o código vira `desatualizado`: Selic muda a cada
// 45 dias (Copom), então um snapshot mais velho que isso já pode estar errado por uma reunião.
export function idadeDoSnapshotEmDias(snapshot, hoje) {
  if (!ehISO(snapshot?.atualizadoEm) || !ehISO(hoje)) throw new RangeError("data_invalida");
  const dias = diasEntre(snapshot.atualizadoEm, hoje);
  return { dias, codigo: dias > DIAS_PARA_DESATUALIZADO ? "desatualizado" : "ok" };
}
