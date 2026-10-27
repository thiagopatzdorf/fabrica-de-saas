// Cardio simples: tempo, distância, ritmo e zona de frequência cardíaca. Cada registro vira também um treino
// no registro simples (`treinos`), como a sessão de força, para Shape e Metas contarem sem saber de cardio.
import { adicionar, remover } from "../esquema.mjs";
import { segundaDaSemana, somarDias } from "../../datas.mjs";
import { fcMaxFox, fcMaxTanaka, ritmoSegPorKm, velocidadeKmh, zonaDaFc, zonasKarvonen, zonasPercentualMax } from "./formulas.mjs";

export { MODALIDADES } from "./constantes.mjs";
// Meta de referência da OMS (2020): 150–300 min por semana de atividade aeróbica moderada (ou 75–150 vigorosa).
export const META_SEMANAL_MIN = Object.freeze({ min: 150, max: 300 });
const TIPO_TREINO = { corrida: "Corrida", caminhada: "Caminhada", bicicleta: "Bicicleta" };
export const tipoTreinoDe = (modalidade) => TIPO_TREINO[modalidade] ?? "Outro";
export const ID_TREINO_DO_CARDIO = (id) => `${id}-treino`;
const COM_DISTANCIA = new Set(["corrida", "caminhada", "bicicleta", "remo", "natacao"]);
export const temDistancia = (modalidade) => COM_DISTANCIA.has(modalidade);

// FC máxima da pessoa: a que ela digitou; senão Tanaka pela idade; senão nada (a tela pede a idade).
export function fcMaxDaPessoa(perfil) {
  if (perfil?.fcMaxBpm) return { valor: perfil.fcMaxBpm, origem: "informada" };
  const t = fcMaxTanaka(perfil?.idade);
  return t == null ? null : { valor: Math.round(t), origem: "tanaka", fox: Math.round(fcMaxFox(perfil.idade)) };
}
// Zonas: Karvonen (reserva) se há FC de repouso, senão % da máxima. null sem FC máxima.
export function zonasDaPessoa(perfil) {
  const max = fcMaxDaPessoa(perfil);
  if (!max) return null;
  const z = perfil.fcRepousoBpm ? zonasKarvonen(max.valor, perfil.fcRepousoBpm) : null;
  return { fcMax: max, metodo: z ? "karvonen" : "percentual", zonas: z ?? zonasPercentualMax(max.valor) };
}

export function resumoDoRegistro(c, perfil) {
  const z = zonasDaPessoa(perfil);
  return { ritmoSeg: ritmoSegPorKm(c.minutos, c.km), kmh: velocidadeKmh(c.minutos, c.km), zona: c.fcMedia && z ? zonaDaFc(c.fcMedia, z.zonas) : null };
}

// Semana (segunda a domingo) que contém `ref`: minutos, distância, sessões.
export function resumoSemanal(cardio, ref) {
  const seg = segundaDaSemana(ref), fim = somarDias(seg, 6), s = cardio.filter((c) => c.data >= seg && c.data <= fim);
  return { inicio: seg, minutos: s.reduce((a, c) => a + c.minutos, 0), km: Math.round(s.reduce((a, c) => a + (c.km ?? 0), 0) * 10) / 10, sessoes: s.length };
}
// "X das últimas N semanas com 150 min ou mais": contagem, nunca sequência.
export function semanasNaMetaCardio(cardio, hoje, n = 8) {
  const seg = segundaDaSemana(hoje), semanas = [];
  for (let k = n - 1; k >= 0; k--) { const r = resumoSemanal(cardio, somarDias(seg, -7 * k)); semanas.push({ ...r, naMeta: r.minutos >= META_SEMANAL_MIN.min }); }
  return { naMeta: semanas.filter((s) => s.naMeta).length, de: n, semanas };
}

export function registrarCardio(d, item, { novoId, agora }) {
  const id = item.id ?? novoId();
  let r = adicionar(d, "cardio", { ...item, id }, { novoId, agora });
  r = adicionar(r, "treinos", { id: ID_TREINO_DO_CARDIO(id), data: item.data, tipo: tipoTreinoDe(item.modalidade), minutos: item.minutos, ...(item.esforco ? { esforco: item.esforco } : {}) }, { novoId, agora });
  return r;
}
export function apagarCardio(d, id, { agora }) {
  let r = remover(d, "cardio", id, { agora });
  if (r.treinos.some((t) => t.id === ID_TREINO_DO_CARDIO(id))) r = remover(r, "treinos", ID_TREINO_DO_CARDIO(id), { agora });
  return r;
}
