// Diário de refeições: montar o registro, somar o dia, recentes, favoritos, "repetir ontem" e a visão semanal.
// Lógica pura sobre a coleção `refeicoes` (esquema.mjs). Cada registro guarda uma FOTO dos macros no momento em
// que foi feito: corrigir a base amanhã não reescreve o diário de ontem, e alimento próprio dispensa coleção.
// Água entra como registro com `refeicao: "agua"` e `gramas` = ml (1 ml ~ 1 g), sem macros.
import { diasEntre, segundaDaSemana, somarDias } from "../../datas.mjs";
import { nutrientes } from "./alimentos.mjs";

export const REFEICOES = ["cafe", "almoco", "lanche", "jantar", "ceia"];
export const AGUA = "agua";
const r1 = (v) => Math.round(v * 10 + 1e-9) / 10;

// Refeição pela hora do relógio (decisão: o padrão certo vira 1 toque a menos). Horas 0-23.
export function refeicaoPorHora(hora) {
  if (hora >= 5 && hora < 10) return "cafe";
  if (hora >= 10 && hora < 14) return "almoco";
  if (hora >= 14 && hora < 18) return "lanche";
  if (hora >= 18 && hora < 22) return "jantar";
  return "ceia";
}

export function novoRegistro({ alimento, gramas, data, refeicao, id, agora }) {
  const n = nutrientes(alimento, gramas);
  return { id, data, refeicao, alimentoId: String(alimento.id), nome: alimento.nome, gramas: r1(gramas), ...n, atualizadoEm: agora() };
}
export const novoRegistroAgua = ({ ml, data, id, agora }) => ({ id, data, refeicao: AGUA, alimentoId: "agua", nome: "agua", gramas: ml, kcal: 0, p: 0, c: 0, g: 0, fibra: 0, atualizadoEm: agora() });

export function somaDoDia(refeicoes, data) {
  const s = { kcal: 0, p: 0, c: 0, g: 0, fibra: 0, aguaMl: 0, itens: 0 };
  for (const r of refeicoes) {
    if (r.data !== data) continue;
    if (r.refeicao === AGUA) { s.aguaMl += r.gramas; continue; }
    s.kcal += r.kcal; s.p += r.p; s.c += r.c; s.g += r.g; s.fibra += r.fibra; s.itens++;
  }
  return { ...s, p: r1(s.p), c: r1(s.c), g: r1(s.g), fibra: r1(s.fibra) };
}

// Quanto falta (positivo) ou passou (negativo) de cada meta. Passar não é falha: a tela diz "acima da meta".
export const restante = (soma, alvo) => ({ kcal: alvo.kcal - soma.kcal, p: r1(alvo.p - soma.p), c: r1(alvo.c - soma.c), g: r1(alvo.g - soma.g), fibra: r1(alvo.fibra - soma.fibra), aguaMl: alvo.aguaMl - soma.aguaMl });

// Alimento reconstruído de um registro (por 100 g): serve para recentes e favoritos de alimento próprio.
export function alimentoDoRegistro(r) {
  const f = 100 / r.gramas;
  return { id: r.alimentoId, nome: r.nome, kcal: r.kcal * f, p: r.p * f, c: r.c * f, g: r.g * f, fibra: r.fibra * f, porcoes: [], origem: 3 };
}

const comida = (refeicoes) => refeicoes.filter((r) => r.refeicao !== AGUA);

// Recentes: um por alimento, o mais novo primeiro, com a última quantidade usada.
export function recentes(refeicoes, n = 8) {
  const vistos = new Map();
  for (const r of [...comida(refeicoes)].sort((a, b) => (a.data === b.data ? (a.atualizadoEm < b.atualizadoEm ? 1 : -1) : a.data < b.data ? 1 : -1))) if (!vistos.has(r.alimentoId)) vistos.set(r.alimentoId, r);
  return [...vistos.values()].slice(0, n);
}

// Favoritos: os marcados pela pessoa primeiro, depois os mais repetidos nos últimos 60 dias.
export function favoritos(refeicoes, hoje, marcados = [], n = 8) {
  const ini = somarDias(hoje, -59), cont = new Map(), ultimo = new Map();
  for (const r of comida(refeicoes)) {
    if (r.data < ini || r.data > hoje) continue;
    cont.set(r.alimentoId, (cont.get(r.alimentoId) ?? 0) + 1);
    if (!ultimo.has(r.alimentoId) || ultimo.get(r.alimentoId).data < r.data) ultimo.set(r.alimentoId, r);
  }
  const marc = marcados.map(String), ids = [...cont.keys()].filter((id) => cont.get(id) >= 2 && !marc.includes(id)).sort((a, b) => cont.get(b) - cont.get(a) || (a < b ? -1 : 1));
  return [...marc.filter((id) => ultimo.has(id)), ...ids].slice(0, n).map((id) => ultimo.get(id));
}

// "Repetir ontem" (ou qualquer dia): cópias dos registros de `de` para `para`, sem a água.
export function repetirDia(refeicoes, de, para, { novoId, agora }) {
  return comida(refeicoes).filter((r) => r.data === de).map((r) => ({ ...r, id: novoId(), data: para, atualizadoEm: agora() }));
}

// Visão semanal: as `n` últimas semanas (segunda a domingo, a corrente por último). Uma semana está "na faixa"
// quando houve registro em pelo menos 4 dias e a média de calorias dos dias registrados ficou entre 90% e 110% do
// alvo (decisão: o meio-termo, nem em falta nem em excesso). Nunca sequência: a tela diz "X das últimas N semanas".
export function semanas(refeicoes, hoje, alvoKcal, n = 8) {
  const seg0 = segundaDaSemana(hoje);
  return Array.from({ length: n }, (_, i) => {
    const inicio = somarDias(seg0, -7 * (n - 1 - i)), fim = somarDias(inicio, 6);
    const dias = Array.from({ length: 7 }, (_, k) => { const d = somarDias(inicio, k); return { data: d, ...somaDoDia(refeicoes, d), registrado: refeicoes.some((r) => r.data === d && r.refeicao !== AGUA) }; });
    const reg = dias.filter((d) => d.registrado && d.data <= hoje), k = reg.length;
    const media = (campo) => (k ? r1(reg.reduce((s, d) => s + d[campo], 0) / k) : 0);
    const mediaKcal = k ? Math.round(reg.reduce((s, d) => s + d.kcal, 0) / k + 1e-9) : 0;
    return { inicio, fim, dias, diasRegistrados: k, mediaKcal, mediaP: media("p"), mediaC: media("c"), mediaG: media("g"), naFaixa: !!alvoKcal && k >= 4 && mediaKcal >= alvoKcal * 0.9 - 1e-9 && mediaKcal <= alvoKcal * 1.1 + 1e-9, completa: fim <= hoje };
  });
}

// Dias com registro de comida na janela [hoje-janela+1, hoje] (entrada da adaptação por tendência).
export const diasRegistrados = (refeicoes, hoje, janela = 14) => new Set(comida(refeicoes).filter((r) => r.data <= hoje && diasEntre(r.data, hoje) < janela).map((r) => r.data)).size;

// Cruzamento opt-in com Finanças: números lado a lado, sem inferir nada. Despesa líquida do mês nas categorias de
// mercado e delivery (resumoMes já abate estornos) e quantos dias do mês tiveram refeição registrada.
export function cruzamentoFinancas({ resumo, refeicoes, ym, hoje, categoriaMercado = "cat-mercado", categoriaDelivery = "cat-delivery" }) {
  const gasto = (id) => resumo.porCategoria.find((c) => c.categoriaId === id)?.centavos ?? 0;
  const diasComRegistro = new Set(comida(refeicoes).filter((r) => r.data.slice(0, 7) === ym && r.data <= hoje).map((r) => r.data)).size;
  const diasNoMes = hoje.slice(0, 7) === ym ? Number(hoje.slice(8)) : new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5)), 0)).getUTCDate();
  return { mercadoCentavos: gasto(categoriaMercado), deliveryCentavos: gasto(categoriaDelivery), diasComRegistro, diasNoMes };
}
