// Espelho de ponto do mês: função pura (marcações + ajustes + jornada -> dias e totais).
// Regras:
// - Fuso de Brasília fixo em UTC-3: o Brasil não tem horário de verão desde 2019, e um fuso fixo deixa
//   o cálculo igual no Worker, no Node e no teste.
// - A marcação original nunca some: desconsiderada continua no espelho, riscada, com o motivo.
//   Incluída pelo RH aparece com origem "I". É o que separa ajuste de adulteração.
// - Trabalhado = soma dos pares (entrada, saída) na ordem do dia; número ímpar de marcações é alerta,
//   e a última entrada sem saída não conta hora.
// - Dia útil = segunda a sexta (jornada da pessoa); sábado e domingo têm previsto zero.
// - Dia futuro não tem saldo; dia útil passado sem marcação é falta.
// - Antes do início do vínculo (admissão, ou o cadastro quando não há admissão) não há previsto nem falta:
//   medido em 2026-10-21, sem isso quem foi cadastrado no dia 21 nascia com 14 faltas e -112 h no espelho.
const FUSO_MS = -3 * 3600 * 1000;
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const dois = (n) => String(n).padStart(2, "0");

export const diaLocal = (ms) => new Date(ms + FUSO_MS).toISOString().slice(0, 10);
export const horaLocal = (ms) => new Date(ms + FUSO_MS).toISOString().slice(11, 16);
// "2026-10-05" + "08:30" (horário de Brasília) -> epoch ms
export const msDe = (dia, hora) => Date.parse(`${dia}T${hora}:00.000Z`) - FUSO_MS;

export function mesValido(mes) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(mes || ""));
  return Boolean(m) && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[1]) >= 2020 && Number(m[1]) <= 2100;
}
export function limitesDoMes(mes) {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { inicio: msDe(`${mes}-01`, "00:00"), fim: msDe(`${mes}-${dois(ultimo)}`, "23:59") + 59999, dias: ultimo };
}

export function calcularEspelho({ mes, marcacoes = [], ajustes = [], jornada_min = 480, agora = Date.now(), inicio = null }) {
  const { dias: n } = limitesDoMes(mes);
  const hoje = diaLocal(agora);
  const desconsiderar = new Map(ajustes.filter((a) => a.tipo === "desconsiderar").map((a) => [a.marcacao, a]));
  const porDia = new Map();
  const empurrar = (dia, m) => { if (!porDia.has(dia)) porDia.set(dia, []); porDia.get(dia).push(m); };
  for (const m of marcacoes) {
    const d = desconsiderar.get(m.id);
    empurrar(diaLocal(m.quando), { id: m.id, nsr: m.nsr, quando: m.quando, hora: horaLocal(m.quando), origem: "O",
      dentro: Boolean(m.dentro), revisar: Boolean(m.revisar), desconsiderada: Boolean(d), motivo: d?.motivo || null });
  }
  for (const a of ajustes.filter((x) => x.tipo === "incluir")) {
    empurrar(diaLocal(a.quando), { id: a.id, nsr: null, quando: a.quando, hora: horaLocal(a.quando), origem: "I",
      dentro: true, revisar: false, desconsiderada: false, motivo: a.motivo });
  }
  const dias = [];
  const totais = { trabalhado_min: 0, previsto_min: 0, saldo_min: 0, faltas: 0, impares: 0, fora_da_cerca: 0, revisar: 0 };
  for (let i = 1; i <= n; i++) {
    const data = `${mes}-${dois(i)}`;
    const sem = new Date(`${data}T12:00:00Z`).getUTCDay();
    const vinculado = !inicio || data >= inicio;
    const util = vinculado && sem >= 1 && sem <= 5;
    const todas = (porDia.get(data) || []).sort((p, q) => p.quando - q.quando);
    const validas = todas.filter((m) => !m.desconsiderada);
    let trabalhado = 0;
    for (let k = 0; k + 1 < validas.length; k += 2) trabalhado += Math.floor((validas[k + 1].quando - validas[k].quando) / 60000);
    const passado = data <= hoje;
    const previsto = util ? jornada_min : 0;
    const alertas = [];
    if (validas.length % 2 === 1 && data < hoje) alertas.push("marcação ímpar");
    if (util && passado && data < hoje && validas.length === 0) alertas.push("falta");
    if (validas.some((m) => !m.dentro)) alertas.push("fora da cerca");
    if (validas.some((m) => m.revisar)) alertas.push("rosto a revisar");
    const fechado = data < hoje;
    const saldo = fechado ? trabalhado - previsto : null;
    dias.push({ data, semana: SEMANA[sem], util, marcacoes: todas, trabalhado_min: trabalhado, previsto_min: previsto, saldo_min: saldo, alertas });
    if (fechado) { totais.trabalhado_min += trabalhado; totais.previsto_min += previsto; totais.saldo_min += saldo; }
    if (alertas.includes("falta")) totais.faltas++;
    if (alertas.includes("marcação ímpar")) totais.impares++;
    totais.fora_da_cerca += validas.filter((m) => !m.dentro).length;
    totais.revisar += validas.filter((m) => m.revisar).length;
  }
  return { mes, dias, totais };
}

export const hhmm = (min) => (min == null ? "" : `${min < 0 ? "-" : ""}${Math.floor(Math.abs(min) / 60)}:${dois(Math.abs(min) % 60)}`);

// CSV para a contabilidade (separador ";" e vírgula decimal: abre direto no Excel em português).
export function espelhoCsv(esp, cab) {
  const linhas = [["Empresa", cab.empresa], ["CNPJ", cab.cnpj], ["Funcionário", cab.nome], ["CPF", cab.cpf], ["Período", esp.mes], [],
    ["Data", "Dia", "Marcações", "Trabalhado", "Previsto", "Saldo", "Alertas"]];
  for (const d of esp.dias) {
    const marcas = d.marcacoes.map((m) => `${m.hora}${m.origem === "I" ? "(I)" : ""}${m.desconsiderada ? "(D)" : ""}`).join(" ");
    linhas.push([d.data.split("-").reverse().join("/"), d.semana, marcas, hhmm(d.trabalhado_min), hhmm(d.previsto_min), hhmm(d.saldo_min), d.alertas.join(", ")]);
  }
  linhas.push([], ["Totais", "", "", hhmm(esp.totais.trabalhado_min), hhmm(esp.totais.previsto_min), hhmm(esp.totais.saldo_min), `${esp.totais.faltas} falta(s)`],
    ["Legenda", "(I) incluída pelo RH; (D) desconsiderada pelo RH, com motivo no sistema"]);
  // Nome que começa com = + @ (ou - sem número) viraria fórmula no Excel: ganha um apóstrofo na frente.
  const cel = (v) => { let s = String(v ?? ""); if (/^[=+@\t\r]|^-(?!\d)/.test(s)) s = "'" + s; return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + linhas.map((l) => l.map(cel).join(";")).join("\r\n") + "\r\n";
}
