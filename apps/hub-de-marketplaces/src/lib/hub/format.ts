import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { todayBR } from "./ids";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(cents: number): string {
  return brl.format((Number.isFinite(cents) ? cents : 0) / 100);
}

export function parseDecimal(input: string): number {
  const clean = input.trim().replace(/\s/g, "").replace("%", "").replace(/^R\$/, "");
  if (!clean) return 0;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  const n = Number(normalized);
  if (!Number.isFinite(n)) throw new Error("Número inválido.");
  return n;
}

export function parseMoney(input: string): number {
  return Math.round(parseDecimal(input) * 100);
}

export function parseBps(input: string): number {
  return Math.round(parseDecimal(input) * 100);
}

export function moneyToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function bpsToInput(bps: number): string {
  return (bps / 100).toFixed(2).replace(".", ",").replace(",00", "");
}

export function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  const date = parseISO(value);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "dd MMM · HH:mm", { locale: ptBR });
}

export type PriceInput = {
  costCents: number;
  freightCents: number;
  commissionBps: number;
  taxBps: number;
  marginBps: number;
  markupBps: number;
  floorCents: number;
  round90: boolean;
  promoPct: number;
  promoStart: string | null;
  promoEnd: string | null;
  now?: string;
};

export type PriceBreakdown = {
  costCents: number;
  markupCents: number;
  freightCents: number;
  commissionCents: number;
  taxCents: number;
  marginCents: number;
  listCents: number;
  suggestedCents: number;
  promoActive: boolean;
};

function round90(cents: number): number {
  const reais = cents / 100;
  const whole = Math.floor(reais + 1e-9);
  const candidate = whole + 0.9;
  const value = reais <= candidate + 1e-9 ? candidate : whole + 1 + 0.9;
  return Math.round(value * 100);
}

function promoOn(input: PriceInput): boolean {
  if (input.promoPct <= 0 || !input.promoStart || !input.promoEnd) return false;
  const today = (input.now ?? todayBR()).slice(0, 10);
  return today >= input.promoStart && today <= input.promoEnd;
}

export function suggestPrice(input: PriceInput): PriceBreakdown {
  const markupRate = Math.max(0, input.markupBps) / 10_000;
  const lifted = Math.round(input.costCents * (1 + markupRate));
  const markupCents = lifted - input.costCents;
  const base = lifted + Math.max(0, input.freightCents);
  const take = (input.commissionBps + input.taxBps + input.marginBps) / 10_000;
  const rate = Math.min(Math.max(take, 0), 0.8);
  let cents = Math.round(base / (1 - rate));
  if (cents < input.floorCents) cents = input.floorCents;
  if (input.round90) cents = round90(cents);
  if (cents < input.floorCents) cents = input.round90 ? round90(Math.max(input.floorCents, cents)) : input.floorCents;
  const listCents = cents;
  const promoActive = promoOn(input);
  if (promoActive) {
    cents = Math.round(listCents * (1 - input.promoPct / 100));
    if (input.round90) cents = round90(cents);
  }
  const commissionCents = Math.round((cents * input.commissionBps) / 10_000);
  const taxCents = Math.round((cents * input.taxBps) / 10_000);
  const marginCents = cents - input.costCents - markupCents - input.freightCents - commissionCents - taxCents;
  return {
    costCents: input.costCents,
    markupCents,
    freightCents: input.freightCents,
    commissionCents,
    taxCents,
    marginCents,
    listCents,
    suggestedCents: cents,
    promoActive,
  };
}
