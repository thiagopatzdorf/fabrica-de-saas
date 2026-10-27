// Dinheiro é sempre inteiro em centavos: nunca float, nunca texto vindo do navegador sem passar por aqui.
export const MAX_CENTAVOS = 5_000_000; // R$ 50.000,00: teto de uma cobrança (o provedor de pagamento pode ter o seu)

export function centavos(v) {
  return Number.isSafeInteger(v) && v >= 0 && v <= MAX_CENTAVOS ? v : null;
}

export const reais = (c) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
