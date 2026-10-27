// "1.234,56", "150", "R$ 150,5" -> centavos inteiros; qualquer outra coisa -> null.
// Em centavos inteiros porque o Stripe não aceita fração e ponto flutuante erra (0,1 + 0,2).
export function paraCentavos(texto) {
  const t = String(texto ?? "").trim().replace(/^R\$\s*/i, "").replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [reais, cent = ""] = t.split(".");
  return Number(reais) * 100 + Number(cent.padEnd(2, "0"));
}
