// Formatação por idioma. Dinheiro entra e sai em CENTAVOS inteiros; a vírgula/ponto e o símbolo são só
// da exibição (Intl). Datas são ISO "AAAA-MM-DD" e formatadas em UTC, para o dia nunca virar por fuso.
const LOCALE = { "pt-BR": "pt-BR", en: "en-US" };

export function criarFmt(idioma = "pt-BR") {
  const loc = LOCALE[idioma] ?? "pt-BR";
  const nf = (casas) => new Intl.NumberFormat(loc, { minimumFractionDigits: casas, maximumFractionDigits: casas });
  const iso = (s) => new Date(`${s}T00:00:00Z`);
  const dt = (opts) => new Intl.DateTimeFormat(loc, { timeZone: "UTC", ...opts });
  return {
    idioma, locale: loc,
    // 123456 → "R$ 1.234,56" (pt-BR) ou "R$1,234.56" (en). Negativo com sinal de menos real (−).
    moeda(centavos, moeda = "BRL", { sinal = false } = {}) {
      const v = centavos / 100;
      const s = new Intl.NumberFormat(loc, { style: "currency", currency: moeda }).format(Math.abs(v));
      return (centavos < 0 ? "−" : sinal && centavos > 0 ? "+" : "") + s;
    },
    numero: (n, casas = 0) => (n < 0 ? "−" : "") + nf(casas).format(Math.abs(n)),
    percentualBp: (bp, casas = 1) => `${(bp < 0 ? "−" : "")}${nf(casas).format(Math.abs(bp) / 100)}%`,
    data: (s) => dt({ day: "2-digit", month: "2-digit", year: "numeric" }).format(iso(s)),
    dataCurta: (s) => dt({ day: "2-digit", month: "2-digit" }).format(iso(s)),
    dataLonga: (s) => dt({ weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(iso(s)),
    mes: (ym) => dt({ month: "short", year: "2-digit" }).format(iso(`${ym}-01`)).replace(".", ""),
    mesLongo: (ym) => dt({ month: "long", year: "numeric" }).format(iso(`${ym}-01`)),
    diaDaSemana: (s) => dt({ weekday: "short" }).format(iso(s)).replace(".", ""),
  };
}
