export type Tone = "ok" | "warn" | "danger" | "mute";

export const LISTING_STATUS = {
  draft: "Rascunho",
  published: "Publicado",
  paused: "Pausado",
  error: "Erro",
  review: "Em revisão",
} as const;

export const ORDER_STATUS = {
  awaiting_payment: "Aguardando pagamento",
  paid: "Pago",
  invoiced: "Faturado",
  shipped: "Despachado",
  delivered: "Entregue",
  cancelled: "Cancelado",
  returned: "Devolvido",
} as const;

export const ACCOUNT_STATUS = {
  connected: "Conectada",
  token_expired: "Token expirado",
  error: "Erro",
} as const;

export const PRODUCT_KIND = {
  simple: "Simples",
  variation: "Variação",
  kit: "Kit",
  parent: "Pai",
} as const;

export const LISTING_KIND = {
  simple: "Simples",
  variation: "Variação",
  catalog: "Catálogo",
} as const;

export function listingTone(status: string): Tone {
  if (status === "published") return "ok";
  if (status === "paused" || status === "review" || status === "draft") return "warn";
  if (status === "error") return "danger";
  return "mute";
}

export function orderTone(status: string): Tone {
  if (status === "delivered" || status === "shipped" || status === "invoiced" || status === "paid") return "ok";
  if (status === "awaiting_payment") return "warn";
  if (status === "cancelled") return "danger";
  if (status === "returned") return "warn";
  return "mute";
}

export function accountTone(status: string): Tone {
  if (status === "connected") return "ok";
  if (status === "token_expired") return "warn";
  if (status === "error") return "danger";
  return "mute";
}

export function labelOf(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}
