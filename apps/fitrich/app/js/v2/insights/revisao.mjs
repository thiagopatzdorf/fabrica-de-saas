// Revisão da semana: o que a semana (segunda a domingo) teve de dinheiro e de corpo, sugestões de vitórias, e a
// revisão escrita pela pessoa (3 vitórias, 1 ajuste, 1 intenção) guardada em `perfil.revisoes[<segunda ISO>]`.
// Pura. Lê coleções que podem não existir (`sonos`, `refeicoes`) como vazias.
import { somarDias } from "../../datas.mjs";
import { MAX_TEXTO_REVISAO, agoraPadrao, definir } from "../esquema.mjs";
import { semanaDe, contexto, mediaDe, minutosDe, soma, sonosDoEstado, treinosEntre } from "./base.mjs";

export const MAX_TEXTO = MAX_TEXTO_REVISAO;
export const MAX_SEMANAS_GUARDADAS = 104;

// Sábado e domingo fecham a semana que está acontecendo; nos outros dias a revisão natural é a da semana passada.
export function semanaDaRevisao(hoje) {
  const dow = new Date(`${hoje}T00:00:00Z`).getUTCDay(); // 0 domingo … 6 sábado
  const { inicio } = semanaDe(hoje);
  const inicioRevisao = dow === 6 || dow === 0 ? inicio : somarDias(inicio, -7);
  return { inicio: inicioRevisao, fim: somarDias(inicioRevisao, 6), fechaAgora: dow === 6 || dow === 0 };
}

export function dadosDaSemana(d, inicio, hoje) {
  const ctx = contexto(d, hoje), fim = somarDias(inicio, 6), antIni = somarDias(inicio, -7), antFim = somarDias(inicio, -1);
  const entre = (ls, a, b) => ls.filter((l) => l.data >= a && l.data <= b);
  const resumo = (a, b) => {
    const ls = entre(ctx.reais, a, b);
    const receita = soma(ls.filter((l) => l.tipo === "receita").map((l) => l.centavos));
    const despesa = soma(ls.filter((l) => l.tipo === "despesa").map((l) => l.centavos)) - soma(ls.filter((l) => l.tipo === "estorno").map((l) => l.centavos));
    const porCat = {};
    for (const l of ls) if (l.tipo === "despesa") porCat[l.categoriaId ?? "sem-categoria"] = (porCat[l.categoriaId ?? "sem-categoria"] ?? 0) + l.centavos; else if (l.tipo === "estorno" && l.categoriaId) porCat[l.categoriaId] = (porCat[l.categoriaId] ?? 0) - l.centavos;
    return { ls, receita, despesa, porCat };
  };
  const a = resumo(inicio, fim), b = resumo(antIni, antFim);
  const topCategorias = Object.entries(a.porCat).map(([categoriaId, centavos]) => ({ categoriaId, centavos, deltaCentavos: centavos - (b.porCat[categoriaId] ?? 0) })).sort((x, y) => y.deltaCentavos - x.deltaCentavos || (x.categoriaId < y.categoriaId ? -1 : 1)).slice(0, 3);
  const maior = [...a.ls.filter((l) => l.tipo === "despesa")].sort((x, y) => y.centavos - x.centavos || (x.id < y.id ? -1 : 1))[0] ?? null;
  const treinos = treinosEntre(ctx.treinos, inicio, fim);
  const pesos = entre(ctx.pesos, inicio, fim);
  const sonos = sonosDoEstado(d).filter((s) => s.data >= inicio && s.data <= fim && Number.isFinite(s.horas));
  const refeicoes = (Array.isArray(d.refeicoes) ? d.refeicoes : []).filter((r) => typeof r?.data === "string" && r.data >= inicio && r.data <= fim);
  const diasComRegistro = new Set([...a.ls, ...treinos, ...pesos, ...(d.medidas ?? []).filter((m) => m.data >= inicio && m.data <= fim)].map((x) => x.data)).size;
  const metaTreinos = d.metas?.find((m) => m.tipo === "treino")?.alvo ?? null;
  return {
    inicio, fim, emAndamento: hoje < fim,
    dinheiro: {
      entrouCentavos: a.receita, saiuCentavos: a.despesa, poupouCentavos: a.receita - a.despesa, saiuAnteriorCentavos: b.despesa,
      variacaoSaiuBp: b.despesa > 0 ? Math.round(((a.despesa - b.despesa) / b.despesa) * 10000) : null,
      lancamentos: a.ls.length, topCategorias, maiorGasto: maior ? { id: maior.id, centavos: maior.centavos, descricao: maior.descricao ?? "", categoriaId: maior.categoriaId ?? null } : null,
    },
    corpo: {
      treinos: treinos.length, minutos: minutosDe(treinos), metaTreinos, treinoIds: treinos.map((t) => t.id),
      pesagens: pesos.length, pesoInicioKg: pesos[0]?.kg ?? null, pesoFimKg: pesos[pesos.length - 1]?.kg ?? null,
      deltaKg: pesos.length >= 2 ? Math.round((pesos[pesos.length - 1].kg - pesos[0].kg) * 10) / 10 : null,
      sonoMedioHoras: sonos.length ? Math.round(mediaDe(sonos.map((s) => s.horas)) * 10) / 10 : null, noites: sonos.length,
      refeicoes: refeicoes.length,
    },
    diasComRegistro,
  };
}

// Vitórias que o app SUGERE a partir dos números; a pessoa adota, edita ou escreve as suas. Sempre pelo menos 3 (a última é
// genérica de propósito: olhar os números já é uma vitória). Cada uma é uma chave de texto + números.
export function vitoriasSugeridas(w) {
  const v = [], c = w.corpo, m = w.dinheiro;
  if (c.metaTreinos && c.treinos >= c.metaTreinos) v.push({ chave: "treinos_meta", numeros: { n: c.treinos, meta: c.metaTreinos } });
  else if (c.treinos > 0) v.push({ chave: "treinou", numeros: { n: c.treinos } });
  if (m.poupouCentavos > 0) v.push({ chave: "poupou", numeros: { valorCentavos: m.poupouCentavos } });
  if (m.variacaoSaiuBp != null && m.variacaoSaiuBp < 0) v.push({ chave: "saiu_menos", numeros: { taxaBp: Math.abs(m.variacaoSaiuBp) } });
  if (w.diasComRegistro >= 4) v.push({ chave: "registrou_dias", numeros: { dias: w.diasComRegistro } });
  if (c.pesagens > 0) v.push({ chave: "pesou", numeros: { n: c.pesagens } });
  if (c.sonoMedioHoras != null && c.sonoMedioHoras >= 7) v.push({ chave: "dormiu", numeros: { horas: c.sonoMedioHoras } });
  v.push({ chave: "olhou_numeros", numeros: {} });
  v.push({ chave: "parou_para_revisar", numeros: {} }, { chave: "escolheu_intencao", numeros: {} });
  return v.slice(0, Math.max(3, Math.min(6, v.length)));
}

// ---------- a revisão escrita ----------
export const revisaoVazia = () => ({ vitorias: ["", "", ""], ajuste: "", intencao: "", atualizadoEm: null });
export function revisaoDe(d, inicio) {
  const r = d.perfil?.revisoes?.[inicio];
  if (!r) return revisaoVazia();
  return { vitorias: [0, 1, 2].map((i) => r.vitorias?.[i] ?? ""), ajuste: r.ajuste ?? "", intencao: r.intencao ?? "", atualizadoEm: r.atualizadoEm ?? null };
}
const limpar = (s) => String(s ?? "").trim().slice(0, MAX_TEXTO);

// Novo documento com a revisão da semana gravada em `perfil.revisoes`. Guarda as 104 semanas mais recentes (2 anos).
export function salvarRevisao(d, inicio, rev, { agora } = {}) {
  const t = (agora ?? agoraPadrao)();
  const nova = { vitorias: [0, 1, 2].map((i) => limpar(rev.vitorias?.[i])), ajuste: limpar(rev.ajuste), intencao: limpar(rev.intencao), atualizadoEm: t };
  const todas = { ...(d.perfil?.revisoes ?? {}), [inicio]: nova };
  const guardar = Object.keys(todas).sort().slice(-MAX_SEMANAS_GUARDADAS);
  return definir(d, "perfil", { revisoes: Object.fromEntries(guardar.map((k) => [k, todas[k]])) }, { agora: () => t });
}

// Texto da revisão em Markdown (exportar/copiar). `t` e `fmt` vêm da tela: nenhuma frase fixa aqui.
export function textoDaRevisao({ dados, revisao, t, fmt }) {
  const m = dados.dinheiro, c = dados.corpo, L = [];
  L.push(`# ${t("revisao.exportTitulo", { inicio: fmt.data(dados.inicio), fim: fmt.data(dados.fim) })}`, "");
  L.push(`## ${t("revisao.dinheiro")}`);
  L.push(`- ${t("revisao.entrou")}: ${fmt.moeda(m.entrouCentavos)}`, `- ${t("revisao.saiu")}: ${fmt.moeda(m.saiuCentavos)}`, `- ${t("revisao.poupou")}: ${fmt.moeda(m.poupouCentavos)}`, "");
  L.push(`## ${t("revisao.corpo")}`);
  L.push(`- ${t("revisao.treinos")}: ${c.treinos} (${t("revisao.minutosN", { n: c.minutos })})`);
  if (c.pesoFimKg != null) L.push(`- ${t("revisao.peso")}: ${fmt.numero(c.pesoFimKg, 1)} kg`);
  if (c.sonoMedioHoras != null) L.push(`- ${t("revisao.sono")}: ${fmt.numero(c.sonoMedioHoras, 1)} h`);
  L.push("", `## ${t("revisao.tresVitorias")}`);
  revisao.vitorias.filter(Boolean).forEach((v, i) => L.push(`${i + 1}. ${v}`));
  L.push("", `## ${t("revisao.ajuste")}`, revisao.ajuste || "—", "", `## ${t("revisao.intencao")}`, revisao.intencao || "—", "");
  return L.join("\n");
}
