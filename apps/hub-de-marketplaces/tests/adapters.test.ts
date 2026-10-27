import { afterEach, describe, expect, it, vi } from "vitest";
import { CHANNELS } from "../src/lib/hub/channels";
import { getAdapter, probeChannel } from "../src/lib/hub/adapters.server";

// Os adaptadores atuais são SIMULADOS (latência e falha aleatórias). Estes testes
// travam o CONTRATO que um adaptador real também precisa cumprir.

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function run<T>(p: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return p;
}

describe("contrato do adaptador de canal", () => {
  it("existe um adaptador para cada canal do catálogo e ele é reaproveitado", () => {
    for (const channel of CHANNELS) {
      expect(getAdapter(channel.id)).toBe(getAdapter(channel.id));
    }
  });

  it("publicar devolve ok com o id externo prefixado pelo canal", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const r = await run(
      getAdapter("ml").publish({ sku: "SKU-1", title: "T", priceCents: 1000, stock: 3, kind: "simple" }),
    );
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.externalId).toMatch(/^ML-SKU-1-\d{4}$/);
  });

  it("atualizar preço e estoque mantém o id externo já existente", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const a = getAdapter("shopee");
    const price = await run(a.updatePrice({ externalId: "SHOPEE-X-1", sku: "X", priceCents: 500 }));
    const stock = await run(a.updateStock({ externalId: "SHOPEE-X-1", sku: "X", stock: 4 }));
    expect(price).toEqual({ ok: true, externalId: "SHOPEE-X-1" });
    expect(stock).toEqual({ ok: true, externalId: "SHOPEE-X-1" });
  });

  it("falha do canal volta como { ok: false, error } e nunca como exceção", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.01); // abaixo do limiar de falha
    const r = await run(getAdapter("amazon").updateStock({ externalId: "e", sku: "X", stock: 1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/atualizar estoque/);
  });

  it("a sonda de conexão pode falhar por timeout simulado", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    expect(await run(probeChannel())).toMatchObject({ ok: false });
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    expect(await run(probeChannel())).toEqual({ ok: true });
  });
});
