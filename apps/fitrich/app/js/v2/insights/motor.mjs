// O motor: avalia o catálogo, prioriza por meio-termo e respeita o que a pessoa dispensou. Puro e sem LLM:
// mesmos dados + mesma data = mesmos insights, sempre (é isso que o teste de determinismo fixa).
import { CATALOGO } from "./catalogo.mjs";
import { contexto } from "./base.mjs";
import { MAX_DISPENSADOS } from "../esquema.mjs";

// Meio-termo, não excesso: no máximo 3 por visita, no máximo 2 do mesmo eixo (dinheiro/corpo), no máximo 2 de
// severidade "atenção" (não afogar a pessoa em alertas) e uma instância por regra.
export const LIMITES_DA_VISITA = Object.freeze({ maximo: 3, porEixo: 2, atencao: 2, porRegra: 1 });

// Prioridade = impacto × acionabilidade (1 a 5 cada), com peso 1,5 para "atenção". A instância pode ter impacto próprio
// (ex.: assinatura cara pesa mais). Desempate pela chave, para a ordem nunca depender da ordem de avaliação.
export const pontuacao = (i) => i.impacto * i.acionavel * (i.severidade === "atencao" ? 1.5 : 1);

// Chave do texto: `revisao.i.<regra>[.<variante>].t` (a frase) e `.p` (o UM próximo passo).
export const chaveTexto = (i) => `revisao.i.${i.id}${i.variante ? `.${i.variante}` : ""}`;

// Avalia todas as regras. Uma regra que lança não derruba as outras (nem a tela Hoje): o erro vai em `erros`,
// e o teste do catálogo exige que, com dados válidos, `erros` seja vazio.
export function avaliarTodos(d, hoje, { catalogo = CATALOGO } = {}) {
  const ctx = contexto(d, hoje), insights = [], erros = [];
  for (const r of catalogo) {
    try {
      for (const i of r.avaliar(ctx)) insights.push({ ...i, eixo: r.eixo, impacto: i.impacto ?? r.impacto, acionavel: r.acionavel, texto: chaveTexto(i) });
    } catch (e) { erros.push({ id: r.id, mensagem: String(e?.message ?? e) }); }
  }
  for (const i of insights) i.pontuacao = pontuacao(i);
  return { insights, erros };
}

export const ordenar = (insights) => [...insights].sort((a, b) => b.pontuacao - a.pontuacao || (a.chave < b.chave ? -1 : a.chave > b.chave ? 1 : 0));

export function priorizar(insights, { dispensados = [], limites = LIMITES_DA_VISITA } = {}) {
  const fora = new Set(dispensados);
  const escolhidos = [], porEixo = {}, porRegra = {};
  let atencao = 0;
  for (const i of ordenar(insights)) {
    if (escolhidos.length >= limites.maximo) break;
    if (fora.has(i.chave)) continue;
    if ((porEixo[i.eixo] ?? 0) >= limites.porEixo || (porRegra[i.id] ?? 0) >= limites.porRegra) continue;
    if (i.severidade === "atencao" && atencao >= limites.atencao) continue;
    escolhidos.push(i);
    porEixo[i.eixo] = (porEixo[i.eixo] ?? 0) + 1; porRegra[i.id] = (porRegra[i.id] ?? 0) + 1;
    if (i.severidade === "atencao") atencao++;
  }
  return escolhidos;
}

export const dispensadosDe = (d) => (Array.isArray(d.perfil?.insightsDispensados) ? d.perfil.insightsDispensados : []);

// "Para olhar hoje": até 3 insights, sem o que foi dispensado.
export function paraOlhar(d, hoje) {
  const { insights, erros } = avaliarTodos(d, hoje);
  return { itens: priorizar(insights, { dispensados: dispensadosDe(d) }), total: insights.length, erros };
}

// Novo valor de `perfil.insightsDispensados` (o chamador grava com `definir(d, "perfil", ...)`). Sem duplicata; se passar
// do teto, os mais antigos saem (a lista nunca cresce sem fim).
export const dispensar = (lista, chave) => [...(lista ?? []).filter((c) => c !== chave), chave].slice(-MAX_DISPENSADOS);
export const restaurar = (lista, chave) => (lista ?? []).filter((c) => c !== chave);
