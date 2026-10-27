// Registro diário de bem-estar (coleção `bemestar`): UM item por data, com sono, energia, dor e água. Cada campo é
// opcional: dá para registrar só a água. Funções puras sobre o documento v2 (imutáveis, como o esquema).
import { adicionar, editar } from "../esquema.mjs";

export const CAMPOS = ["sonoHoras", "sonoQualidade", "dormiuMin", "acordouMin", "energia", "dor", "aguaMl"];
export const bemestarDoDia = (d, data) => d.bemestar.find((b) => b.data === data) ?? null;

// Grava os campos informados no dia (cria ou mescla). `null` APAGA o campo; campo ausente fica como está.
export function salvarBemestar(d, data, campos, opcoes) {
  const atual = bemestarDoDia(d, data);
  const limpo = {};
  for (const k of CAMPOS) if (k in campos) limpo[k] = campos[k];
  if (!atual) return adicionar(d, "bemestar", { data, ...Object.fromEntries(Object.entries(limpo).filter(([, v]) => v != null)) }, opcoes);
  // `editar` mescla por cima do item antigo; null = campo vazio (o esquema aceita).
  return editar(d, "bemestar", atual.id, limpo, opcoes);
}
// Água: soma `ml` ao dia (negativo desfaz; nunca abaixo de zero).
export function somarAgua(d, data, ml, opcoes) {
  const novo = Math.max(0, (bemestarDoDia(d, data)?.aguaMl ?? 0) + ml);
  return salvarBemestar(d, data, { aguaMl: novo }, opcoes);
}
