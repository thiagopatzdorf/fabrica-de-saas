// Peças comuns do motor de insights: estatística robusta e o "contexto" de um dia (os mesmos recortes de
// dados calculados uma vez só e reaproveitados pelas regras). Puro: nada de DOM, relógio, rede ou aleatório;
// `hoje` (ISO UTC) sempre chega de fora. Dinheiro em centavos inteiros. Coleções ausentes valem como vazias,
// porque outras áreas do app (treino, nutrição, sono) criam as suas em paralelo e este módulo só LÊ.
import { diasEntre, mesDe, segundaDaSemana, somarDias, somarMeses } from "../../datas.mjs";
import { despesasDoMes, receitasDoMes } from "../lancamentos-soma.mjs";
import { normalizar } from "../esquema.mjs";
import { resumoDaSessao, ID_TREINO_DA_SESSAO } from "../treino/sessao.mjs";

export const soma = (xs) => xs.reduce((s, x) => s + x, 0);
export const mediaDe = (xs) => (xs.length ? soma(xs) / xs.length : null);

// Mediana (média dos dois do meio quando par). null para lista vazia.
export function mediana(xs) {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b), m = o.length >> 1;
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

// Desvio absoluto mediano (MAD): a mediana dos |x − mediana|. Robusto: um valor absurdo não o arrasta.
export function mad(xs, med = mediana(xs)) {
  return med == null ? null : mediana(xs.map((x) => Math.abs(x - med)));
}

// Escore z modificado de Iglewicz & Hoaglin (1993): 0,6745 · (x − mediana) / MAD. Valores com |z| > 3,5 são
// candidatos a atípicos. null quando o MAD é zero (todos iguais: não há escala para medir; a regra que chama
// decide o que fazer nesse caso).
export const LIMITE_Z_MODIFICADO = 3.5;
export function escoreModificado(x, historico) {
  const med = mediana(historico), m = mad(historico, med);
  return { mediana: med, mad: m, z: m ? (0.6745 * (x - med)) / m : null };
}

// Texto comparável de uma descrição de extrato: sem acento, caixa, dígitos, datas nem pontuação.
// "NETFLIX.COM 03/10" e "Netflix.com 04/11" viram a mesma chave.
export const chaveDescricao = (s) => normalizar(s).replace(/\d+/g, " ").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();

export const ultimosMeses = (ym, n) => Array.from({ length: n }, (_, i) => somarMeses(ym, -(n - i)));
export const fracaoBp = (a, b) => (b > 0 ? Math.round((a / b) * 10000) : null);

// Segunda a domingo da semana que contém `ref`.
export const semanaDe = (ref) => { const inicio = segundaDaSemana(ref); return { inicio, fim: somarDias(inicio, 6) }; };

// Treinos de uma semana (segunda a domingo) começando em `inicio`.
// Sono do dia a dia: a coleção `bemestar` (tela Corpo) guarda `sonoHoras` por data; `sonos`/`sono` ficam aceitos
// para dados de outras origens. Só entram noites com horas numéricas.
export function sonosDoEstado(d) {
  const lista = Array.isArray(d.sonos) ? d.sonos : Array.isArray(d.sono) ? d.sono : [];
  const doCorpo = (Array.isArray(d.bemestar) ? d.bemestar : []).filter((b) => Number.isFinite(b?.sonoHoras)).map((b) => ({ data: b.data, horas: b.sonoHoras }));
  const porData = new Map();
  for (const s of [...doCorpo, ...lista]) if (typeof s?.data === "string" && Number.isFinite(s.horas)) porData.set(s.data, { data: s.data, horas: s.horas });
  return [...porData.values()];
}

// O registro simples em `treinos` não sabe músculos; a sessão de força (coleção `sessoes`) sabe. Liga os dois pelo
// id que o motor de treino deriva da sessão e devolve o treino com `grupos` (primários dos exercícios de trabalho).
export function treinosComGrupos(d) {
  const sessoes = new Map((Array.isArray(d.sessoes) ? d.sessoes : []).map((x) => [ID_TREINO_DA_SESSAO(x.id), x]));
  return (d.treinos ?? []).map((t) => {
    const sessao = sessoes.get(t.id);
    if (!sessao || t.grupos) return t;
    try { return { ...t, grupos: resumoDaSessao(sessao, d.exercicios ?? []).grupos }; } catch { return t; }
  });
}

export const treinosEntre = (treinos, de, ate) => treinos.filter((t) => t.data >= de && t.data <= ate);
export const minutosDe = (treinos) => soma(treinos.map((t) => t.minutos ?? 0));

// Grupos musculares de um treino, quando a área de treino os registra. O esquema atual não tem o campo;
// aceitamos `grupos` ou `musculos` (lista de textos) e `exercicios[].grupo`. Sem nada, lista vazia.
export function gruposDoTreino(t) {
  const lista = [...(Array.isArray(t.grupos) ? t.grupos : []), ...(Array.isArray(t.musculos) ? t.musculos : []), ...(Array.isArray(t.exercicios) ? t.exercicios.map((e) => e?.grupo) : [])];
  return [...new Set(lista.filter((g) => typeof g === "string" && g.trim()).map((g) => g.trim().toLowerCase()))];
}

const porData = (a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0);

// Tudo o que as regras precisam do dia, calculado uma vez. `reais` = o que já aconteceu (efetivado, até
// hoje, na moeda padrão): previsto e cancelado não entram em nenhuma conta de comportamento.
export function contexto(d, hoje) {
  const moeda = d.perfil?.moedaPadrao ?? "BRL";
  const ym = mesDe(hoje), ymAnt = somarMeses(ym, -1);
  const reais = (d.lancamentos ?? []).filter((l) => l.status === "efetivado" && l.data <= hoje && l.moeda === moeda);
  const categorias = d.categorias ?? [];
  const cat = (id) => categorias.find((c) => c.id === id) ?? null;
  const despesaMes = (m) => despesasDoMes(reais, m), receitaMes = (m) => receitasDoMes(reais, m);
  const meses = (n, ate = ymAnt) => ultimosMeses(somarMeses(ate, 1), n);
  return {
    d, hoje, moeda, ym, ymAnt, reais, cat,
    // Ordem por data garantida aqui: as regras de tendência dependem dela e não devem confiar em quem montou o documento.
    treinos: treinosComGrupos(d).filter((t) => t.data <= hoje).sort(porData),
    pesos: (d.pesos ?? []).filter((p) => p.data <= hoje).sort(porData),
    despesas: reais.filter((l) => l.tipo === "despesa"),
    despesaMes, receitaMes, meses,
    // Receita média dos `n` meses fechados que tiveram receita; null sem nenhum.
    receitaMedia: (n = 3) => { const v = meses(n).map(receitaMes).filter((x) => x > 0); return v.length ? mediaDe(v) : null; },
    // Folga média por mês (receita − despesa) nos meses fechados com receita.
    folgaMedia: (n = 3) => { const v = meses(n).filter((m) => receitaMes(m) > 0).map((m) => receitaMes(m) - despesaMes(m)); return v.length ? mediaDe(v) : null; },
    despesaMedia: (n = 3) => { const v = meses(n).map(despesaMes).filter((x) => x > 0); return v.length ? mediaDe(v) : null; },
    taxaBp: (m) => { const r = receitaMes(m); return r > 0 ? Math.round(((r - despesaMes(m)) / r) * 10000) : null; },
    diasDesde: (iso) => diasEntre(iso, hoje),
  };
}

// Molde de regra. `impacto` e `acionavel` (1 a 5) são a única fonte da ordem de prioridade: impacto = quanto
// a coisa pesa na vida da pessoa; acionável = quão claro e barato é o próximo passo. `limiares` documenta
// os números da regra (e é o que o teste de "dois lados" exercita).
export const regra = (id, eixo, { impacto, acionavel, limiares, avaliar }) => ({ id, eixo, impacto, acionavel, limiares, avaliar });
// Instância de insight. `numeros` só guarda números e nomes (o texto vem das chaves i18n); `evidencia` lista
// os ids que provam o insight (lançamentos, treinos, pesos, recorrências).
export const insight = (id, { alvo = null, variante = null, severidade = "info", numeros = {}, evidencia = {}, impacto = null }) => ({ id, chave: alvo ? `${id}:${alvo}` : id, variante, severidade, numeros, evidencia, impacto });
