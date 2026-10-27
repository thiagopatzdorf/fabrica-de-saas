// Sono: faixa por idade, duração, regularidade do ponto médio e "dívida" (déficit) contra a meta. Puro.
// Referências: National Sleep Foundation 2015 (Hirshkowitz et al.) e consenso AASM/SRS 2015 (Watson et al.).
import { dia } from "../../datas.mjs";

const arred = (v, c) => Math.round(v * 10 ** c) / 10 ** c;

// Faixas recomendadas (horas) por idade. Menores de 6 não cabem no app: caem na faixa de 6–13.
const FAIXAS = [[14, { min: 9, max: 11, grupo: "6-13" }], [18, { min: 8, max: 10, grupo: "14-17" }], [65, { min: 7, max: 9, grupo: "18-64" }], [Infinity, { min: 7, max: 8, grupo: "65+" }]];
export function faixaSono(idade) {
  if (!Number.isFinite(idade) || idade < 0) return { min: 7, max: 9, grupo: "18-64", presumida: true }; // sem idade: adulto, e a UI avisa
  return { ...FAIXAS.find(([lim]) => idade < lim)[1], presumida: false };
}
// Meta padrão = meio da faixa (adulto: 8 h). A pessoa pode sobrescrever em `perfil.metaSonoHoras`.
export function metaSonoHoras(perfil, hoje) {
  if (perfil.metaSonoHoras != null) return perfil.metaSonoHoras;
  const f = faixaSono(idadeEm(perfil.nascimento, hoje));
  return (f.min + f.max) / 2;
}
// Anos completos em `hoje`; null sem nascimento.
export function idadeEm(nascimento, hoje) {
  if (!nascimento) return null;
  const a = Number(hoje.slice(0, 4)) - Number(nascimento.slice(0, 4));
  return hoje.slice(5) < nascimento.slice(5) ? a - 1 : a;
}

// Minutos desde 00:00 ("23:30" → 1410). null se mal formado.
export function minutosDeHora(txt) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(txt ?? "").trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
export const horaDeMinutos = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

// Duração entre deitar e acordar, atravessando a meia-noite. Iguais = ambíguo (0 ou 24 h): null.
export function duracaoHoras(dormiuMin, acordouMin) {
  if (!Number.isInteger(dormiuMin) || !Number.isInteger(acordouMin) || dormiuMin === acordouMin) return null;
  return arred((((acordouMin - dormiuMin) % 1440) + 1440) % 1440 / 60, 2);
}
// Ponto médio do sono (minutos desde 00:00, 0–1439).
export function pontoMedioMin(dormiuMin, acordouMin) {
  const dur = duracaoHoras(dormiuMin, acordouMin);
  return dur == null ? null : Math.round((dormiuMin + (dur * 60) / 2) % 1440);
}

// Regularidade: desvio-padrão (amostral) do ponto médio, em minutos. Os pontos são "desenrolados" em torno do
// primeiro (diferença circular em [−720, 720)) para que 23:50 e 00:10 estejam a 20 min, não a 23 h40.
// Faixas são heurística (≤30 min alta, ≤60 média): a literatura usa o índice de regularidade (Phillips 2017) e
// variabilidade > 60 min aparece associada a pior saúde cardiometabólica; ver docs/pesquisa-corpo.md.
export function regularidade(pontosMedios) {
  const p = pontosMedios.filter((x) => Number.isFinite(x));
  if (p.length < 3) return null;
  const d = p.map((x) => ((x - p[0] + 2160) % 1440) - 720);
  const m = d.reduce((a, b) => a + b, 0) / d.length;
  const sd = Math.sqrt(d.reduce((a, x) => a + (x - m) ** 2, 0) / (d.length - 1));
  return { desvioMin: arred(sd, 1), n: p.length, faixa: sd <= 30 ? "alta" : sd <= 60 ? "media" : "baixa", pontoMedioMin: Math.round((((p[0] + m) % 1440) + 1440) % 1440) };
}

// "Dívida" de sono nos últimos `dias` dias: soma de max(0, meta − horas) nas noites registradas. Modelo, não diagnóstico:
// recuperar não é 1 para 1; ~1 h a mais por noite durante alguns dias costuma bastar. Precisa de ≥ 3 noites.
export function dividaDeSono(registros, hoje, metaHoras, { dias = 7 } = {}) {
  const ini = dia(hoje) - dias + 1;
  const n = registros.filter((r) => r.sonoHoras != null && dia(r.data) >= ini && dia(r.data) <= dia(hoje));
  if (n.length < 3) return null;
  const deficit = n.reduce((s, r) => s + Math.max(0, metaHoras - r.sonoHoras), 0);
  return { deficitHoras: arred(deficit, 2), noites: n.length, mediaHoras: arred(n.reduce((s, r) => s + r.sonoHoras, 0) / n.length, 2), metaHoras };
}

export const noitesNaFaixa = (registros, faixa) => registros.filter((r) => r.sonoHoras != null && r.sonoHoras >= faixa.min && r.sonoHoras <= faixa.max).length;
