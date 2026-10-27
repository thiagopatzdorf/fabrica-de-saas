// Lógica da sessão ao vivo: "última vez", descanso sugerido, aquecimento, resumo e fechamento. Funções puras
// sobre o documento: a tela só chama `mudar` com o que sai daqui.
import { adicionar, editar, remover } from "../esquema.mjs";
import { arred, arredondarCarga, tonelagem } from "./formulas.mjs";
import { exercicioPorId } from "./catalogo.mjs";
import { concluida, historicoDoExercicio, seriesDeTrabalho } from "./progressao.mjs";
import { recordesDoExercicio, novosRecordes } from "./recordes.mjs";

export const ID_TREINO_DA_SESSAO = (sessaoId) => `${sessaoId}-treino`;
export const sessaoEmAndamento = (d) => d.sessoes.find((x) => x.estado === "andamento") ?? null;

// "Última vez foi 3 séries: 60 kg × 8, 8, 7": a sessão concluída mais recente com o exercício.
export function ultimaVez(sessoes, exercicioId, antesDe = null) {
  const h = historicoDoExercicio(sessoes, exercicioId, { antesDe });
  return h.length ? h[h.length - 1] : null;
}

// Descanso entre séries, em segundos. Compostos pesados pedem mais (Schoenfeld 2016: 3 min rendeu mais força e
// hipertrofia no quadríceps que 1 min em treinados). Isoladores e séries leves, menos. Quem quiser troca no
// campo do exercício; isto é só o ponto de partida.
export function descansoSugerido(exercicio, reps = 10) {
  const composto = exercicio && exercicio.padrao !== "isolar" && exercicio.padrao !== "core";
  if (!composto) return reps <= 6 ? 120 : 75;
  return reps <= 6 ? 180 : reps <= 12 ? 120 : 90;
}

// Séries de aquecimento até a carga de trabalho: 40% × 8, 60% × 5, 80% × 3 (arredondadas ao degrau). Em carga
// pequena (menos de 2 degraus) não há o que aquecer.
export function aquecimentoPara(kgTrabalho, passo = 2.5) {
  if (!(kgTrabalho > 0) || kgTrabalho < passo * 4) return [];
  return [[0.4, 8], [0.6, 5], [0.8, 3]].map(([f, reps]) => ({ kg: arredondarCarga(kgTrabalho * f, passo), reps })).filter((s, i, a) => s.kg > 0 && s.kg < kgTrabalho && (i === 0 || s.kg > a[i - 1].kg));
}

// Resumo de uma sessão: séries de trabalho, tonelagem, exercícios distintos, grupos tocados.
export function resumoDaSessao(sessao, pessoais = []) {
  const trabalho = (sessao.series ?? []).filter((s) => !s.aquecimento && s.reps >= 1);
  const ids = [...new Set(trabalho.map((s) => s.exercicioId))];
  const grupos = new Set();
  for (const id of ids) { const ex = exercicioPorId(id, pessoais); if (ex) ex.primarios.forEach((g) => grupos.add(g)); }
  return { series: trabalho.length, tonelagem: trabalho.reduce((s, x) => s + tonelagem(x.kg, x.reps), 0), exercicios: ids.length, grupos: [...grupos] };
}

// Minutos de uma sessão pelos instantes de início e fim (ISO). Mínimo 1.
export const minutosEntre = (inicio, fim) => Math.max(1, Math.round((Date.parse(fim) - Date.parse(inicio)) / 60000) || 1);

// ---- operações sobre o documento (cada uma devolve o documento novo) ----
export function iniciarSessao(d, { rotina = null, hoje, agora, novoId }) {
  if (sessaoEmAndamento(d)) throw Object.assign(new Error("sessao.ja_em_andamento"), { erros: [{ codigo: "sessao.ja_em_andamento" }] });
  const inicio = agora();
  return adicionar(d, "sessoes", { id: novoId(), data: hoje, estado: "andamento", inicio, rotinaId: rotina?.id ?? null, rotinaNome: rotina?.nome ?? "", series: [] }, { novoId, agora });
}

// Registra uma série. `rir`/`rpe` opcionais. Devolve também quais recordes a série bateu.
export function registrarSerie(d, sessaoId, serie, { agora }) {
  const sessao = d.sessoes.find((x) => x.id === sessaoId);
  // A sessão atual entra como concluída só para esta conta: as séries anteriores dela também são "o que havia".
  const anteriores = recordesDoExercicio(d.sessoes.map((x) => (x.id === sessaoId ? { ...x, estado: "concluida" } : x)), serie.exercicioId);
  const nova = { exercicioId: serie.exercicioId, kg: serie.kg, reps: serie.reps, rir: serie.rir ?? null, aquecimento: Boolean(serie.aquecimento), em: agora() };
  const recordes = novosRecordes(anteriores, nova);
  return { dados: editar(d, "sessoes", sessaoId, { series: [...sessao.series, nova] }, { agora }), recordes };
}

export function desfazerUltimaSerie(d, sessaoId, { agora }) {
  const sessao = d.sessoes.find((x) => x.id === sessaoId);
  return editar(d, "sessoes", sessaoId, { series: sessao.series.slice(0, -1) }, { agora });
}
export function editarSerie(d, sessaoId, indice, mudancas, { agora }) {
  const sessao = d.sessoes.find((x) => x.id === sessaoId), series = sessao.series.map((s, i) => (i === indice ? { ...s, ...mudancas } : s));
  return editar(d, "sessoes", sessaoId, { series }, { agora });
}
export function removerSerie(d, sessaoId, indice, { agora }) {
  const sessao = d.sessoes.find((x) => x.id === sessaoId);
  return editar(d, "sessoes", sessaoId, { series: sessao.series.filter((_, i) => i !== indice) }, { agora });
}

// Conclui: fecha a sessão e cria o registro simples em `treinos` (assim Shape, Metas e Hoje contam o treino sem
// saber que existe um motor de séries). `esforco` 1–5 opcional.
export function concluirSessao(d, sessaoId, { agora, esforco = null }) {
  const sessao = d.sessoes.find((x) => x.id === sessaoId), fim = agora();
  const minutos = Math.min(1440, minutosEntre(sessao.inicio ?? fim, fim));
  let r = editar(d, "sessoes", sessaoId, { estado: "concluida", fim, minutos }, { agora });
  r = adicionar(r, "treinos", { id: ID_TREINO_DA_SESSAO(sessaoId), data: sessao.data, tipo: "Musculação", minutos, ...(esforco ? { esforco } : {}) }, { agora });
  return r;
}
// Apaga a sessão (andamento ou concluída) e o treino simples que ela gerou.
export function apagarSessao(d, sessaoId, { agora }) {
  let r = remover(d, "sessoes", sessaoId, { agora });
  if (r.treinos.some((t) => t.id === ID_TREINO_DA_SESSAO(sessaoId))) r = remover(r, "treinos", ID_TREINO_DA_SESSAO(sessaoId), { agora });
  return r;
}

// Para a tela: o que já foi feito de cada item da rotina dentro da sessão.
export function progressoDaRotina(sessao, rotina) {
  return (rotina?.itens ?? []).map((it) => ({ item: it, feitas: seriesDeTrabalho(sessao, it.exercicioId).length, prescritas: it.series }));
}
export { concluida, arred };

// Rotina que vem a seguir no rodízio: a seguinte à da última sessão concluída (por `ordem`); sem sessão ou
// sem rotina conhecida, a primeira. Convite, não obrigação: a pessoa escolhe outra com um toque.
export function proximaRotina(d) {
  const lista = [...d.rotinas].sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99) || (a.nome < b.nome ? -1 : 1));
  if (!lista.length) return null;
  const ult = [...d.sessoes].filter((x) => x.estado === "concluida" && lista.some((r) => r.id === x.rotinaId)).sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : a.id < b.id ? 1 : -1))[0];
  if (!ult) return lista[0];
  return lista[(lista.findIndex((r) => r.id === ult.rotinaId) + 1) % lista.length];
}
