// Biblioteca de exercícios do Fitrich: dados ORIGINAIS (escritos aqui, sem copiar base licenciada).
export { EQUIPAMENTOS, GRUPOS, MODALIDADES, PADROES } from "./constantes.mjs";

// Cada exercício diz o grupo principal (conta como 1 série no volume semanal), o equipamento, o padrão de
// movimento e os músculos primários (1 série) e secundários (0,5 série: contagem "fracionada", a mesma do
// meta-regression de Pelland et al. 2024). Nome nos dois idiomas é DADO, não texto de interface.
// Ids são slugs fixos: o histórico da pessoa aponta para eles, então um id publicado nunca muda de sentido.


// [id, pt, en, grupo, equipamento, padrao, primários, secundários]
const L = [
  // peito
  ["supino-reto-barra", "Supino reto com barra", "Barbell bench press", "peito", "barra", "empurrar_h", "peito", "triceps,ombros"],
  ["supino-inclinado-barra", "Supino inclinado com barra", "Incline barbell press", "peito", "barra", "empurrar_h", "peito", "triceps,ombros"],
  ["supino-reto-halteres", "Supino reto com halteres", "Dumbbell bench press", "peito", "halteres", "empurrar_h", "peito", "triceps,ombros"],
  ["supino-inclinado-halteres", "Supino inclinado com halteres", "Incline dumbbell press", "peito", "halteres", "empurrar_h", "peito", "triceps,ombros"],
  ["supino-maquina", "Supino na máquina", "Machine chest press", "peito", "maquina", "empurrar_h", "peito", "triceps,ombros"],
  ["crucifixo-halteres", "Crucifixo com halteres", "Dumbbell fly", "peito", "halteres", "isolar", "peito", ""],
  ["crossover-cabo", "Crossover no cabo", "Cable crossover", "peito", "cabo", "isolar", "peito", ""],
  ["peck-deck", "Voador (peck deck)", "Pec deck", "peito", "maquina", "isolar", "peito", ""],
  ["flexao-braco", "Flexão de braço", "Push-up", "peito", "peso_corporal", "empurrar_h", "peito", "triceps,ombros,core"],
  ["flexao-pes-elevados", "Flexão com pés elevados", "Feet-elevated push-up", "peito", "peso_corporal", "empurrar_h", "peito", "triceps,ombros"],
  ["mergulho-paralelas", "Mergulho nas paralelas", "Parallel-bar dip", "peito", "peso_corporal", "empurrar_h", "peito,triceps", "ombros"],
  // costas
  ["barra-fixa-pronada", "Barra fixa pronada", "Pull-up", "costas", "peso_corporal", "puxar_v", "costas", "biceps,antebracos"],
  ["barra-fixa-supinada", "Barra fixa supinada", "Chin-up", "costas", "peso_corporal", "puxar_v", "costas,biceps", "antebracos"],
  ["puxada-frente", "Puxada alta na frente", "Lat pulldown", "costas", "cabo", "puxar_v", "costas", "biceps"],
  ["puxada-triangulo", "Puxada com pegada neutra", "Neutral-grip pulldown", "costas", "cabo", "puxar_v", "costas", "biceps"],
  ["remada-curvada-barra", "Remada curvada com barra", "Barbell bent-over row", "costas", "barra", "puxar_h", "costas", "biceps,posteriores,core"],
  ["remada-unilateral-halter", "Remada unilateral com halter", "One-arm dumbbell row", "costas", "halteres", "puxar_h", "costas", "biceps"],
  ["remada-baixa-cabo", "Remada baixa no cabo", "Seated cable row", "costas", "cabo", "puxar_h", "costas", "biceps"],
  ["remada-maquina", "Remada na máquina", "Machine row", "costas", "maquina", "puxar_h", "costas", "biceps"],
  ["remada-invertida", "Remada invertida", "Inverted row", "costas", "peso_corporal", "puxar_h", "costas", "biceps,core"],
  ["remada-elastico", "Remada com elástico", "Resistance-band row", "costas", "elastico", "puxar_h", "costas", "biceps"],
  ["pullover-cabo", "Pullover no cabo", "Cable pullover", "costas", "cabo", "isolar", "costas", ""],
  ["encolhimento-halteres", "Encolhimento com halteres", "Dumbbell shrug", "costas", "halteres", "isolar", "costas", "antebracos"],
  // ombros
  ["desenvolvimento-barra", "Desenvolvimento em pé com barra", "Standing barbell overhead press", "ombros", "barra", "empurrar_v", "ombros", "triceps,core"],
  ["desenvolvimento-halteres", "Desenvolvimento com halteres", "Seated dumbbell shoulder press", "ombros", "halteres", "empurrar_v", "ombros", "triceps"],
  ["desenvolvimento-maquina", "Desenvolvimento na máquina", "Machine shoulder press", "ombros", "maquina", "empurrar_v", "ombros", "triceps"],
  ["arnold-press", "Desenvolvimento Arnold", "Arnold press", "ombros", "halteres", "empurrar_v", "ombros", "triceps"],
  ["elevacao-lateral-halteres", "Elevação lateral com halteres", "Dumbbell lateral raise", "ombros", "halteres", "isolar", "ombros", ""],
  ["elevacao-lateral-cabo", "Elevação lateral no cabo", "Cable lateral raise", "ombros", "cabo", "isolar", "ombros", ""],
  ["elevacao-frontal", "Elevação frontal", "Front raise", "ombros", "halteres", "isolar", "ombros", ""],
  ["crucifixo-inverso-halteres", "Crucifixo inverso com halteres", "Dumbbell reverse fly", "ombros", "halteres", "isolar", "ombros", "costas"],
  ["crucifixo-inverso-maquina", "Crucifixo inverso na máquina", "Machine reverse fly", "ombros", "maquina", "isolar", "ombros", "costas"],
  ["face-pull", "Face pull", "Face pull", "ombros", "cabo", "puxar_h", "ombros", "costas"],
  ["pike-push-up", "Flexão em pico (pike)", "Pike push-up", "ombros", "peso_corporal", "empurrar_v", "ombros", "triceps"],
  // bíceps
  ["rosca-direta-barra", "Rosca direta com barra", "Barbell curl", "biceps", "barra", "isolar", "biceps", "antebracos"],
  ["rosca-alternada", "Rosca alternada com halteres", "Alternating dumbbell curl", "biceps", "halteres", "isolar", "biceps", "antebracos"],
  ["rosca-martelo", "Rosca martelo", "Hammer curl", "biceps", "halteres", "isolar", "biceps,antebracos", ""],
  ["rosca-scott", "Rosca Scott", "Preacher curl", "biceps", "maquina", "isolar", "biceps", ""],
  ["rosca-cabo", "Rosca no cabo", "Cable curl", "biceps", "cabo", "isolar", "biceps", ""],
  ["rosca-inclinada", "Rosca no banco inclinado", "Incline dumbbell curl", "biceps", "halteres", "isolar", "biceps", ""],
  ["rosca-concentrada", "Rosca concentrada", "Concentration curl", "biceps", "halteres", "isolar", "biceps", ""],
  // tríceps
  ["triceps-testa-barra", "Tríceps testa com barra", "Barbell skull crusher", "triceps", "barra", "isolar", "triceps", ""],
  ["triceps-corda", "Tríceps na corda", "Cable rope pushdown", "triceps", "cabo", "isolar", "triceps", ""],
  ["triceps-frances-halter", "Tríceps francês com halter", "Overhead dumbbell extension", "triceps", "halteres", "isolar", "triceps", ""],
  ["extensao-triceps-cabo", "Extensão de tríceps acima da cabeça no cabo", "Overhead cable extension", "triceps", "cabo", "isolar", "triceps", ""],
  ["mergulho-banco", "Mergulho no banco", "Bench dip", "triceps", "peso_corporal", "empurrar_h", "triceps", "peito,ombros"],
  ["supino-fechado", "Supino fechado", "Close-grip bench press", "triceps", "barra", "empurrar_h", "triceps", "peito,ombros"],
  ["flexao-diamante", "Flexão diamante", "Diamond push-up", "triceps", "peso_corporal", "empurrar_h", "triceps", "peito,ombros"],
  ["triceps-coice", "Tríceps coice com halter", "Dumbbell kickback", "triceps", "halteres", "isolar", "triceps", ""],
  // antebraços
  ["rosca-punho", "Rosca de punho", "Wrist curl", "antebracos", "halteres", "isolar", "antebracos", ""],
  ["rosca-inversa", "Rosca inversa", "Reverse curl", "antebracos", "barra", "isolar", "antebracos", "biceps"],
  ["caminhada-fazendeiro", "Caminhada do fazendeiro", "Farmer's carry", "antebracos", "halteres", "carregar", "antebracos", "core,costas"],
  // quadríceps
  ["agachamento-livre", "Agachamento livre", "Barbell back squat", "quadriceps", "barra", "agachar", "quadriceps,gluteos", "posteriores,core"],
  ["agachamento-frontal", "Agachamento frontal", "Front squat", "quadriceps", "barra", "agachar", "quadriceps", "gluteos,core"],
  ["agachamento-goblet", "Agachamento goblet", "Goblet squat", "quadriceps", "kettlebell", "agachar", "quadriceps,gluteos", "core"],
  ["leg-press", "Leg press 45°", "45-degree leg press", "quadriceps", "maquina", "agachar", "quadriceps", "gluteos"],
  ["hack-squat", "Agachamento hack", "Hack squat", "quadriceps", "maquina", "agachar", "quadriceps", "gluteos"],
  ["cadeira-extensora", "Cadeira extensora", "Leg extension", "quadriceps", "maquina", "isolar", "quadriceps", ""],
  ["agachamento-bulgaro", "Agachamento búlgaro", "Bulgarian split squat", "quadriceps", "halteres", "avanco", "quadriceps,gluteos", "posteriores"],
  ["afundo-halteres", "Afundo com halteres", "Dumbbell lunge", "quadriceps", "halteres", "avanco", "quadriceps,gluteos", "posteriores"],
  ["passada-caminhando", "Passada caminhando", "Walking lunge", "quadriceps", "halteres", "avanco", "quadriceps,gluteos", "posteriores"],
  ["step-up", "Subida no banco (step-up)", "Step-up", "quadriceps", "halteres", "avanco", "quadriceps,gluteos", ""],
  ["agachamento-ar", "Agachamento no ar", "Bodyweight squat", "quadriceps", "peso_corporal", "agachar", "quadriceps,gluteos", "core"],
  ["agachamento-bulgaro-corporal", "Agachamento búlgaro com peso do corpo", "Bodyweight Bulgarian split squat", "quadriceps", "peso_corporal", "avanco", "quadriceps,gluteos", "posteriores"],
  // posteriores
  ["stiff-barra", "Levantamento terra romeno (stiff) com barra", "Barbell Romanian deadlift", "posteriores", "barra", "dobrar_quadril", "posteriores,gluteos", "core,costas"],
  ["stiff-halteres", "Levantamento terra romeno com halteres", "Dumbbell Romanian deadlift", "posteriores", "halteres", "dobrar_quadril", "posteriores,gluteos", "core"],
  ["levantamento-terra", "Levantamento terra", "Conventional deadlift", "posteriores", "barra", "dobrar_quadril", "posteriores,gluteos", "costas,antebracos,core,quadriceps"],
  ["mesa-flexora", "Mesa flexora", "Lying leg curl", "posteriores", "maquina", "isolar", "posteriores", ""],
  ["cadeira-flexora", "Cadeira flexora", "Seated leg curl", "posteriores", "maquina", "isolar", "posteriores", ""],
  ["good-morning", "Bom dia (good morning)", "Good morning", "posteriores", "barra", "dobrar_quadril", "posteriores", "gluteos,core"],
  ["flexao-nordica", "Flexão nórdica", "Nordic hamstring curl", "posteriores", "peso_corporal", "isolar", "posteriores", ""],
  ["stiff-unilateral", "Terra romeno unilateral", "Single-leg Romanian deadlift", "posteriores", "halteres", "dobrar_quadril", "posteriores,gluteos", "core"],
  // glúteos
  ["hip-thrust-barra", "Elevação de quadril com barra (hip thrust)", "Barbell hip thrust", "gluteos", "barra", "dobrar_quadril", "gluteos", "posteriores"],
  ["ponte-gluteo", "Ponte de glúteo", "Glute bridge", "gluteos", "peso_corporal", "dobrar_quadril", "gluteos", "posteriores"],
  ["ponte-gluteo-unilateral", "Ponte de glúteo unilateral", "Single-leg glute bridge", "gluteos", "peso_corporal", "dobrar_quadril", "gluteos", "posteriores,core"],
  ["abducao-maquina", "Abdução de quadril na máquina", "Machine hip abduction", "gluteos", "maquina", "isolar", "gluteos", ""],
  ["coice-cabo", "Coice no cabo", "Cable glute kickback", "gluteos", "cabo", "isolar", "gluteos", ""],
  ["kettlebell-swing", "Balanço com kettlebell", "Kettlebell swing", "gluteos", "kettlebell", "dobrar_quadril", "gluteos,posteriores", "core,costas"],
  // panturrilhas
  ["panturrilha-em-pe", "Panturrilha em pé na máquina", "Standing calf raise", "panturrilhas", "maquina", "isolar", "panturrilhas", ""],
  ["panturrilha-sentado", "Panturrilha sentado", "Seated calf raise", "panturrilhas", "maquina", "isolar", "panturrilhas", ""],
  ["panturrilha-leg-press", "Panturrilha no leg press", "Leg-press calf raise", "panturrilhas", "maquina", "isolar", "panturrilhas", ""],
  ["panturrilha-degrau", "Panturrilha unilateral no degrau", "Single-leg step calf raise", "panturrilhas", "peso_corporal", "isolar", "panturrilhas", ""],
  // core
  ["abdominal-crunch", "Abdominal crunch", "Crunch", "core", "peso_corporal", "core", "core", ""],
  ["prancha", "Prancha", "Plank", "core", "peso_corporal", "core", "core", "ombros"],
  ["prancha-lateral", "Prancha lateral", "Side plank", "core", "peso_corporal", "core", "core", "ombros"],
  ["elevacao-pernas-suspenso", "Elevação de pernas suspenso", "Hanging leg raise", "core", "peso_corporal", "core", "core", "antebracos"],
  ["abdominal-roda", "Abdominal com roda", "Ab wheel rollout", "core", "peso_corporal", "core", "core", "ombros,costas"],
  ["crunch-cabo", "Abdominal no cabo", "Cable crunch", "core", "cabo", "core", "core", ""],
  ["rotacao-russa", "Rotação russa", "Russian twist", "core", "peso_corporal", "core", "core", ""],
  ["dead-bug", "Dead bug", "Dead bug", "core", "peso_corporal", "core", "core", ""],
  ["bird-dog", "Bird dog", "Bird dog", "core", "peso_corporal", "core", "core", "gluteos,costas"],
  ["hiperextensao-lombar", "Hiperextensão lombar", "Back extension", "core", "peso_corporal", "dobrar_quadril", "core", "gluteos,posteriores"],
];

// Exercícios medidos em SEGUNDOS (isométricos e carregadas): o campo "repetições" guarda os segundos.
export const POR_TEMPO = new Set(["prancha", "prancha-lateral", "caminhada-fazendeiro"]);
export const porTempo = (ex) => Boolean(ex && (POR_TEMPO.has(ex.id) || ex.porTempo));

const lista = (s) => (s ? s.split(",") : []);
export const CATALOGO = Object.freeze(L.map(([id, pt, en, grupo, equipamento, padrao, p, s]) => Object.freeze({ id, nome: { "pt-BR": pt, en }, grupo, equipamento, padrao, primarios: lista(p), secundarios: lista(s) })));
const POR_ID = new Map(CATALOGO.map((e) => [e.id, e]));
const INFERIORES = new Set(["quadriceps", "posteriores", "gluteos", "panturrilhas"]);

// Acha no catálogo ou nos exercícios criados pela pessoa (`d.exercicios`, mesmo formato).
export function exercicioPorId(id, pessoais = []) {
  return POR_ID.get(id) ?? pessoais.find((e) => e.id === id) ?? null;
}
export const todosExercicios = (pessoais = []) => [...CATALOGO, ...pessoais];
export const nomeDe = (ex, idioma = "pt-BR") => (typeof ex?.nome === "string" ? ex.nome : ex?.nome?.[idioma] ?? ex?.nome?.["pt-BR"] ?? ex?.nome?.en ?? "");

// Menor degrau de carga que costuma existir para o equipamento (kg). 0 = progride por repetições/variação.
export function incrementoPadrao(ex) {
  if (!ex) return 2.5;
  switch (ex.equipamento) {
    case "peso_corporal": case "elastico": return 0;
    case "halteres": return 2;
    case "kettlebell": return 4;
    case "barra": return INFERIORES.has(ex.grupo) || ex.padrao === "dobrar_quadril" ? 5 : 2.5;
    default: return 2.5;
  }
}

// Busca sem acento e sem caixa por nome (nos dois idiomas), grupo, equipamento e padrão.
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export function buscar(pessoais, { texto = "", grupo = null, equipamento = null, padrao = null } = {}) {
  const q = norm(texto).trim();
  return todosExercicios(pessoais).filter((e) => (!grupo || e.grupo === grupo) && (!equipamento || e.equipamento === equipamento) && (!padrao || e.padrao === padrao)
    && (!q || norm(nomeDe(e, "pt-BR")).includes(q) || norm(nomeDe(e, "en")).includes(q)));
}

// Rotinas e sessões que citam exercício que não está no catálogo nem entre os da pessoa. O esquema não confere
// isso (carregar o catálogo na carga inicial passaria do teto de 120 KB); a tela e o teste conferem aqui.
export function exerciciosOrfaos(d) {
  const orfao = (id) => !exercicioPorId(id, d.exercicios);
  return [...d.rotinas.flatMap((r) => r.itens.filter((i) => orfao(i.exercicioId)).map((i) => i.exercicioId)), ...d.sessoes.flatMap((s) => s.series.filter((x) => orfao(x.exercicioId)).map((x) => x.exercicioId))];
}
