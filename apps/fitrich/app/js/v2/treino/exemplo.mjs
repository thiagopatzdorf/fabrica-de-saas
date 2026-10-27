// Dados de exemplo do treino: 9 semanas de um ABC com a carga subindo pela própria dupla progressão (o exemplo
// usa o motor, então demo e regra nunca divergem), um supino parado de propósito (para a pessoa ver o aviso de
// platô e o convite ao deload sem culpa) e corridas/caminhadas com FC. Todo id leva o prefixo `exemplo-`, e o
// treino simples de cada sessão (`<id>-treino`) também: `sairDoExemplo` apaga tudo sem tocar em dado real.
import { adicionar, definir } from "../esquema.mjs";
import { somarDias, segundaDaSemana } from "../../datas.mjs";
import { exercicioPorId } from "./catalogo.mjs";
import { historicoDoExercicio, sugerirProxima } from "./progressao.mjs";
import { montarPrograma } from "./programas.mjs";
import { ID_TREINO_DA_SESSAO } from "./sessao.mjs";
import { ID_TREINO_DO_CARDIO, tipoTreinoDe } from "./cardio.mjs";

const PREFIXO = "exemplo-";
// Carga de partida (kg) por exercício do ABC.
const INICIO = { "supino-reto-barra": 80, "supino-inclinado-halteres": 24, "crossover-cabo": 15, "desenvolvimento-halteres": 18, "elevacao-lateral-halteres": 8, "triceps-testa-barra": 30, "triceps-corda": 25,
  "puxada-frente": 55, "remada-curvada-barra": 50, "remada-baixa-cabo": 50, "crucifixo-inverso-maquina": 25, "rosca-direta-barra": 25, "rosca-martelo": 12,
  "agachamento-livre": 80, "leg-press": 160, "stiff-barra": 70, "cadeira-extensora": 45, "mesa-flexora": 35, "panturrilha-em-pe": 60, "abdominal-crunch": 0 };

export function exemploTreino(d, { hoje, agora, idioma = "pt-BR", semanas = 9 }) {
  const op = { agora };
  let n = 0;
  const id = (r) => `${PREFIXO}${r}-${++n}`;
  // Sem treino simples de exemplo anterior: os de sessão e cardio abaixo o substituem (Shape continua coerente).
  d = { ...d, treinos: d.treinos.filter((t) => !t.id.startsWith(`${PREFIXO}treino`)) };
  const rotinas = montarPrograma("abc", idioma, { novoId: () => id("rotina") });
  for (const r of rotinas) d = adicionar(d, "rotinas", r, op);
  // Pelo menos 3 sessões por rotina até hoje; segunda, quarta e sexta, da mais antiga para a mais nova.
  const seg0 = somarDias(segundaDaSemana(hoje), -7 * (semanas - 1)), datas = [];
  for (let w = 0; w < semanas; w++) for (const off of [0, 2, 4]) { const dt = somarDias(seg0, w * 7 + off); if (dt <= hoje) datas.push(dt); }
  const sessoes = [], contagem = {};
  datas.forEach((data, i) => {
    const rotina = rotinas[i % rotinas.length], series = [];
    const sessaoId = `${PREFIXO}sessao-${i + 1}`;
    for (const item of rotina.itens) {
      const ex = exercicioPorId(item.exercicioId), hist = historicoDoExercicio(sessoes, item.exercicioId), k = contagem[item.exercicioId] = (contagem[item.exercicioId] ?? 0) + 1;
      const sug = sugerirProxima(hist, item, ex);
      let kg = sug.kg ?? INICIO[item.exercicioId] ?? 20, reps = Array.from({ length: item.series }, () => sug.repsAlvo);
      if (i % 4 === 3) reps[reps.length - 1] = Math.max(item.repsMin, sug.repsAlvo - 1);
      // O supino reto emperra: da 5ª vez em diante a mesma carga e menos repetições que o melhor dia.
      if (item.exercicioId === "supino-reto-barra" && k >= 5) { kg = 80; reps = [7, 7, 6, 6]; }
      reps.forEach((r, j) => series.push({ exercicioId: item.exercicioId, kg, reps: r, rir: j === item.series - 1 ? 1 : 2, aquecimento: false, em: `${data}T10:${String(10 + series.length % 40).padStart(2, "0")}:00.000Z` }));
    }
    const minutos = 52 + (i % 4) * 4;
    const sessao = { id: sessaoId, data, estado: "concluida", inicio: `${data}T10:00:00.000Z`, fim: `${data}T10:${String(minutos % 60).padStart(2, "0")}:00.000Z`, minutos, rotinaId: rotina.id, rotinaNome: rotina.nome, series };
    sessoes.push(sessao);
    d = adicionar(d, "sessoes", sessao, op);
    d = adicionar(d, "treinos", { id: ID_TREINO_DA_SESSAO(sessaoId), data, tipo: "Musculação", minutos, esforco: 3 }, op);
  });
  // Cardio: terça (corrida curta) e sábado (corrida ou caminhada longa), ritmo melhorando devagar.
  for (let w = 0; w < semanas; w++) {
    for (const [off, mod, min, km0] of [[1, "corrida", 30, 4.6], [5, w % 3 === 2 ? "caminhada" : "corrida", w % 3 === 2 ? 55 : 42, w % 3 === 2 ? 5.0 : 6.6]]) {
      const data = somarDias(seg0, w * 7 + off);
      if (data > hoje) continue;
      const km = Math.round((km0 + w * (mod === "corrida" ? 0.12 : 0)) * 10) / 10, cid = id("cardio");
      d = adicionar(d, "cardio", { id: cid, data, modalidade: mod, minutos: min, km, fcMedia: mod === "corrida" ? 152 - (w % 2) * 3 : 112 }, op);
      d = adicionar(d, "treinos", { id: ID_TREINO_DO_CARDIO(cid), data, tipo: tipoTreinoDe(mod), minutos: min, esforco: mod === "corrida" ? 3 : 2 }, op);
    }
  }
  return definir(d, "perfil", { idade: 34, fcRepousoBpm: 58 }, op);
}
