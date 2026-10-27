// Ponto de extensão da tela Hoje: lugar do cartão de insights (e de qualquer cartão novo que mereça ficar
// logo abaixo do alerta). Quem plugar um cartão NÃO edita a tela: adiciona UMA linha aqui.
//
//   { id: "insights", ordem: 10, carregar: () => import("./telas/hoje-insights.mjs") }
//
// O módulo carregado exporta `cartao = { montar(ctx) → { elemento, atualizar?(), destruir?() } | null }`.
// A Hoje carrega sob demanda (a carga inicial não cresce), monta na ordem, chama `atualizar` quando os
// dados mudam e `destruir` ao sair. Módulo que falha não derruba a tela: o erro vai ao console e o slot
// fica vazio. O slot reserva sua altura só quando há cartão registrado (sem salto de layout).
export const SLOTS_HOJE = [
  { id: "insights", ordem: 10, carregar: () => import("./telas/hoje-insights.mjs") },
];
