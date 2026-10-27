// Datas como texto "AAAA-MM-DD", sempre em UTC: nenhuma conta aqui depende do fuso nem do horário de verão.
const MS = 86400000;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function ehISO(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(s + "T00:00:00Z");
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s; // recusa 2026-02-31
}
export const dia = (iso) => Math.floor(Date.parse(iso + "T00:00:00Z") / MS);
export const deDia = (n) => new Date(n * MS).toISOString().slice(0, 10);
export const somarDias = (iso, n) => deDia(dia(iso) + n);
export const diasEntre = (a, b) => dia(b) - dia(a);
// Segunda-feira da semana de `iso` (a semana do Fitrich vai de segunda a domingo).
export const segundaDaSemana = (iso) => somarDias(iso, -((new Date(iso + "T00:00:00Z").getUTCDay() + 6) % 7));
export const mesDe = (iso) => iso.slice(0, 7);
export function somarMeses(ym, n) {
  const [a, m] = ym.split("-").map(Number), t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
export const ultimoDiaDoMes = (ym) => somarDias(somarMeses(ym, 1) + "-01", -1);
// Data de hoje no fuso de quem usa (o dia que a pessoa vê no relógio), não a de Greenwich.
export const hojeISO = (agora = new Date()) => `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
export const nomeMes = (ym) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
export const dataCurta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const dataBR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
