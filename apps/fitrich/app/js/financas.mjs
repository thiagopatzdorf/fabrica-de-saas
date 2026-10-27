// Dinheiro sempre em CENTAVOS inteiros: somar 0,10 + 0,20 em ponto flutuante dá 0,30000000000000004,
// e um extrato que não fecha ao centavo destrói a confiança no app inteiro.
import { somarMeses, mesDe } from "./datas.mjs";
import { CATEGORIA_FITNESS } from "./dados.mjs";

// Aceita "1.234,56", "1234,56", "1234.56", "R$ 12", "12,5". null se não for dinheiro.
export function lerReais(texto) {
  let s = String(texto ?? "").replace(/R\$|\s/g, "");
  if (!s || !/^[\d.,]+$/.test(s)) return null;
  const v = s.lastIndexOf(","), p = s.lastIndexOf(".");
  if (v >= 0 && p >= 0) s = v > p ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (v >= 0) s = s.replace(",", ".");
  else if (p >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // "1.234" = mil duzentos e trinta e quatro
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const c = Math.round(Number(s) * 100);
  return Number.isSafeInteger(c) && c > 0 ? c : null;
}

export function formatarReais(centavos, { sinal = false } = {}) {
  const neg = centavos < 0, a = Math.abs(centavos);
  const inteiro = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "−" : sinal && centavos > 0 ? "+" : ""}R$ ${inteiro},${String(a % 100).padStart(2, "0")}`;
}

export function resumoMes(lancs, ym) {
  let receitas = 0, despesas = 0;
  const cat = {};
  for (const l of lancs) {
    if (mesDe(l.data) !== ym) continue;
    if (l.tipo === "receita") receitas += l.centavos; else { despesas += l.centavos; cat[l.categoria] = (cat[l.categoria] || 0) + l.centavos; }
  }
  const saldo = receitas - despesas;
  return {
    ym, receitas, despesas, saldo,
    taxaPoupanca: receitas > 0 ? Math.round((saldo / receitas) * 1000) / 10 : null, // % com 1 casa; pode ser negativa
    porCategoria: Object.entries(cat).map(([categoria, centavos]) => ({ categoria, centavos })).sort((a, b) => b.centavos - a.centavos),
  };
}

// 80% do limite = atenção; passou de 100% = estourou. O estado vira ícone e texto na tela, nunca só cor.
export function orcamentoStatus(lancs, ym, limites) {
  const gasto = Object.fromEntries(resumoMes(lancs, ym).porCategoria.map((c) => [c.categoria, c.centavos]));
  return Object.entries(limites).map(([categoria, limite]) => {
    const g = gasto[categoria] || 0, pct = Math.round((g / limite) * 100);
    return { categoria, gasto: g, limite, pct, estado: pct > 100 ? "estourou" : pct >= 80 ? "atencao" : "ok" };
  }).sort((a, b) => b.pct - a.pct);
}

export function serieMensal(lancs, ymFinal, n = 6) {
  return Array.from({ length: n }, (_, i) => { const r = resumoMes(lancs, somarMeses(ymFinal, -(n - 1 - i))); return { ym: r.ym, receitas: r.receitas, despesas: r.despesas, saldo: r.saldo }; });
}

// Média do saldo (receitas − despesas) dos últimos `meses` meses COMPLETOS antes de `ymAtual`, só os que tiveram receita.
export function ritmoPoupanca(lancs, ymAtual, meses = 3) {
  const lista = serieMensal(lancs, somarMeses(ymAtual, -1), meses).filter((m) => m.receitas > 0);
  return lista.length ? Math.round(lista.reduce((s, m) => s + m.saldo, 0) / lista.length) : null;
}

// Meses para chegar à meta de reserva no ritmo atual. 0 se já chegou; null sem ritmo positivo.
export function mesesParaMeta(alvo, atual, ritmo) {
  if (!alvo) return null;
  if (atual >= alvo) return 0;
  if (!ritmo || ritmo <= 0) return null;
  const m = Math.ceil((alvo - atual) / ritmo);
  return m > 600 ? null : m;
}

// O número que só existe porque corpo e dinheiro estão no mesmo app: quanto custa cada treino.
export function custoPorTreino(lancs, treinos, ym) {
  const gasto = lancs.filter((l) => l.tipo === "despesa" && l.categoria === CATEGORIA_FITNESS && mesDe(l.data) === ym).reduce((s, l) => s + l.centavos, 0);
  const n = treinos.filter((t) => mesDe(t.data) === ym).length;
  return gasto > 0 && n > 0 ? Math.round(gasto / n) : null;
}
