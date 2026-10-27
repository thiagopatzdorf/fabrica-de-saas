import { describe, expect, it } from "vitest";
import { CSV_TEMPLATE, parseCsv } from "../src/lib/hub/csv";
import {
  bpsToInput,
  formatBRL,
  moneyToInput,
  parseBps,
  parseDecimal,
  parseMoney,
  suggestPrice,
  type PriceInput,
} from "../src/lib/hub/format";

describe("parseCsv", () => {
  it("lê o modelo de importação que o próprio app oferece", () => {
    const rows = parseCsv(CSV_TEMPLATE);
    expect(rows).toHaveLength(1);
    expect(rows[0].sku).toBe("EXEMPLO-MOCHILA");
    expect(rows[0].preco).toBe("189.90");
  });

  it("aceita aspas com vírgula, aspas duplicadas, BOM e quebra de linha CRLF", () => {
    const rows = parseCsv('﻿sku,titulo\r\nA1,"Mochila, grande ""XL"""\r\nA2,Simples\r\n');
    expect(rows).toEqual([
      { sku: "A1", titulo: 'Mochila, grande "XL"' },
      { sku: "A2", titulo: "Simples" },
    ]);
  });

  it("descarta linhas em branco e devolve vazio sem cabeçalho", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("sku,titulo\n\n,\nA,B\n")).toEqual([{ sku: "A", titulo: "B" }]);
  });
});

describe("números em formato brasileiro", () => {
  it("lê vírgula decimal e ponto de milhar", () => {
    expect(parseDecimal("1.234,56")).toBe(1234.56);
    expect(parseDecimal("R$ 10,5")).toBe(10.5);
    expect(parseDecimal("89.90")).toBe(89.9);
    expect(parseDecimal("")).toBe(0);
  });

  it("rejeita texto que não é número em vez de gravar NaN", () => {
    expect(() => parseDecimal("abc")).toThrow("Número inválido.");
  });

  it("converte reais em centavos e pontos percentuais em bps sem erro de ponto flutuante", () => {
    expect(parseMoney("0,29")).toBe(29);
    expect(parseMoney("1.005,10")).toBe(100510);
    expect(parseBps("16%")).toBe(1600);
    expect(moneyToInput(18990)).toBe("189,90");
    expect(bpsToInput(1650)).toBe("16,50");
    expect(bpsToInput(1600)).toBe("16");
  });

  it("formata centavos como moeda e trata valor inválido como zero", () => {
    expect(formatBRL(18990).replace(/\s/g, " ")).toBe("R$ 189,90");
    expect(formatBRL(Number.NaN).replace(/\s/g, " ")).toBe("R$ 0,00");
  });
});

describe("suggestPrice", () => {
  const base: PriceInput = {
    costCents: 10_000,
    freightCents: 0,
    commissionBps: 1600,
    taxBps: 800,
    marginBps: 1600,
    markupBps: 0,
    floorCents: 0,
    round90: false,
    promoPct: 0,
    promoStart: null,
    promoEnd: null,
  };

  it("cobre custo, comissão, imposto e margem: a margem líquida bate com a pedida", () => {
    const r = suggestPrice(base);
    // 40% de custos percentuais => preço = custo / 0,6
    expect(r.suggestedCents).toBe(16667);
    expect(r.commissionCents).toBe(Math.round((16667 * 1600) / 10_000));
    expect(r.marginCents).toBe(r.suggestedCents - 10_000 - r.commissionCents - r.taxCents);
    expect(r.marginCents / r.suggestedCents).toBeGreaterThan(0.15);
  });

  it("respeita o piso quando o cálculo dá menos que ele", () => {
    expect(suggestPrice({ ...base, costCents: 100, floorCents: 1990 }).suggestedCents).toBe(1990);
  });

  it("termina em ,90 quando pedido e nunca fica abaixo do preço calculado", () => {
    const r = suggestPrice({ ...base, round90: true });
    expect(r.suggestedCents % 100).toBe(90);
    expect(r.suggestedCents).toBeGreaterThanOrEqual(16667);
  });

  it("aplica a promoção só dentro da janela de datas", () => {
    const promo = { ...base, promoPct: 10, promoStart: "2026-01-10", promoEnd: "2026-01-20" };
    const inside = suggestPrice({ ...promo, now: "2026-01-15" });
    const outside = suggestPrice({ ...promo, now: "2026-02-01" });
    expect(inside.promoActive).toBe(true);
    expect(inside.suggestedCents).toBeLessThan(inside.listCents);
    expect(outside.promoActive).toBe(false);
    expect(outside.suggestedCents).toBe(outside.listCents);
  });

  it("limita a soma das taxas a 80% para não dividir por zero ou por negativo", () => {
    const r = suggestPrice({ ...base, commissionBps: 6000, taxBps: 3000, marginBps: 3000 });
    expect(Number.isFinite(r.suggestedCents)).toBe(true);
    expect(r.suggestedCents).toBeGreaterThan(0);
  });
});
