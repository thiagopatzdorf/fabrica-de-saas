import { beforeAll, describe, expect, it, vi } from "vitest";

// Adaptador determinístico no lugar do simulado (que tem latência e falha aleatórias).
const adapterState = { fail: false };
vi.mock("../src/lib/hub/adapters.server", () => {
  const ok = (externalId: string) => ({ ok: true as const, externalId });
  const adapter = () => ({
    publish: async (i: { sku: string }) =>
      adapterState.fail ? { ok: false as const, error: "canal fora do ar" } : ok(`EXT-${i.sku}`),
    updatePrice: async (i: { externalId: string }) => ok(i.externalId),
    updateStock: async (i: { externalId: string }) => ok(i.externalId),
    pullOrders: async () => ok("PULL"),
    pushTracking: async (i: { externalId: string }) => ok(i.externalId),
    answerQuestion: async (i: { externalId: string }) => ok(i.externalId || "Q"),
  });
  return { getAdapter: adapter, probeChannel: async () => ({ ok: true as const }) };
});

type Db = typeof import("../src/lib/hub/db.server");
let db: Db;

const newProduct = (sku: string, over: Record<string, unknown> = {}) => ({
  kind: "simple" as const,
  sku,
  ean: "",
  title: `Produto ${sku}`,
  description: "",
  brand: "",
  ncm: "",
  weightG: 100,
  heightCm: 1,
  widthCm: 1,
  lengthCm: 1,
  costCents: 1000,
  priceCents: 2500,
  stockPhysical: 10,
  stockSafety: 2,
  categoryId: null,
  aliases: [],
  components: [],
  photoUrl: "",
  ...over,
});

beforeAll(async () => {
  delete process.env.DATABASE_URL; // PGlite em memória
  db = await import("../src/lib/hub/db.server");
});

describe("isolamento entre organizações", () => {
  it("cada usuário recebe a própria organização de demonstração, com os mesmos 24 itens", async () => {
    const a = await db.catalog("user-a");
    const b = await db.catalog("user-b");
    expect(a.products).toHaveLength(24);
    expect(b.products).toHaveLength(24);
    const idsA = new Set(a.products.map((p) => p.id));
    expect(b.products.some((p) => idsA.has(p.id))).toBe(false);
  });

  it("produto criado por um usuário não aparece no catálogo do outro nem abre por id", async () => {
    const created = await db.createProduct("user-a", newProduct("SO-DO-A"));
    const catB = await db.catalog("user-b");
    expect(catB.products.some((p) => p.sku === "SO-DO-A")).toBe(false);
    await expect(db.productDetail("user-b", created.id)).rejects.toThrow();
    await expect(db.productDetail("user-a", created.id)).resolves.toBeTruthy();
  });

  it("o mesmo SKU pode existir em duas organizações, mas não duas vezes na mesma", async () => {
    await db.createProduct("user-a", newProduct("REPETIDO"));
    await expect(db.createProduct("user-a", newProduct("repetido"))).rejects.toThrow(
      "Já existe um SKU com esse código.",
    );
    await expect(db.createProduct("user-b", newProduct("REPETIDO"))).resolves.toHaveProperty("id");
  });

  it("HUB_SEED_DEMO=false cria a organização vazia, sem a Oficina Norte", async () => {
    process.env.HUB_SEED_DEMO = "false";
    try {
      const empty = await db.catalog("user-vazio");
      expect(empty.products).toHaveLength(0);
      expect((await db.connectors("user-vazio")).accounts).toHaveLength(0);
    } finally {
      delete process.env.HUB_SEED_DEMO;
    }
  });
});

describe("estoque", () => {
  it("importa CSV e normaliza o SKU para maiúsculas", async () => {
    const csv =
      "sku,titulo,preco,custo,estoque,seguranca,categoria,tipo\nimp-1,Item importado,19.90,9.90,7,1,Mochilas,simples\n";
    await db.importCsv("user-csv", csv);
    const cat = await db.catalog("user-csv");
    const item = cat.products.find((p) => p.sku === "IMP-1");
    expect(item).toBeTruthy();
    expect(item?.available).toBe(7);
    expect(item?.priceCents).toBe(1990);
  });

  it("ajuste que deixaria o estoque negativo é recusado e o saldo não muda", async () => {
    const { id } = await db.createProduct("user-est", newProduct("EST-1", { stockPhysical: 3 }));
    const adj = await db.queueAdjustment("user-est", { productId: id, delta: -5, reason: "perda" });
    await expect(db.applyAdjustment("user-est", adj.id)).rejects.toThrow("Estoque não fica negativo.");
    const item = (await db.catalog("user-est")).products.find((p) => p.id === id);
    expect(item?.available).toBe(3);
  });

  it("ajuste aplicado soma ao físico e não pode ser aplicado duas vezes", async () => {
    const { id } = await db.createProduct("user-est", newProduct("EST-2", { stockPhysical: 3 }));
    const adj = await db.queueAdjustment("user-est", { productId: id, delta: 4, reason: "entrada" });
    await db.applyAdjustment("user-est", adj.id);
    await expect(db.applyAdjustment("user-est", adj.id)).rejects.toThrow("já saiu da fila");
    const item = (await db.catalog("user-est")).products.find((p) => p.id === id);
    expect(item?.available).toBe(7);
  });

  it("não deixa ajustar o estoque de produto de outra organização", async () => {
    const { id } = await db.createProduct("user-a", newProduct("ALHEIO"));
    await expect(db.queueAdjustment("user-b", { productId: id, delta: 1, reason: "x" })).rejects.toThrow(
      "Produto não está no catálogo.",
    );
  });
});

describe("pedidos", () => {
  async function connectedAccount(userId: string) {
    const accounts = (await db.connectors(userId)).accounts;
    return accounts.find((a) => a.status === "connected" && a.channel === "ml")!;
  }

  it("publicar num canal fora do ar vira anúncio com erro, sem lançar exceção", async () => {
    const { id } = await db.createProduct("user-pub", newProduct("PUB-ERRO"));
    const account = await connectedAccount("user-pub");
    adapterState.fail = true;
    try {
      const res = await db.publish("user-pub", {
        productId: id,
        kind: "simple",
        title: "Anúncio",
        targets: [{ accountId: account.id, priceCents: 2500 }],
      });
      expect(res.results[0].ok).toBe(false);
    } finally {
      adapterState.fail = false;
    }
  });

  it("anúncio sem categoria mapeada fica em revisão e não chama o canal", async () => {
    const { id } = await db.createProduct("user-pub2", newProduct("PUB-SEM-MAPA"));
    const account = await connectedAccount("user-pub2");
    const res = await db.publish("user-pub2", {
      productId: id,
      kind: "simple",
      title: "Sem mapa",
      targets: [{ accountId: account.id, priceCents: 2500 }],
    });
    expect(res.results[0]).toMatchObject({ ok: false, error: "O SKU está sem categoria interna." });
  });

  it("venda simulada reserva 1 unidade do saldo e o cancelamento devolve", async () => {
    const user = "user-venda";
    const { listings } = (await db.listings(user)) as { listings: { id: string; sku: string; status: string }[] };
    const live = listings.find((l) => l.status === "published")!;
    expect(live).toBeTruthy();
    const availableOf = async () =>
      (await db.catalog(user)).products.find((p) => p.sku === live.sku)!.available;

    const before = await availableOf();
    const sale = await db.mockSale(user, live.id);
    expect(await availableOf()).toBe(before - 1);

    const { orders } = (await db.orders(user)) as { orders: { id: string; number: string; status: string }[] };
    const order = orders.find((o) => o.number === sale.orderNumber)!;
    expect(order.status).toBe("paid");

    const res = await db.bulkOrders(user, { ids: [order.id], action: "cancel" });
    expect(res.errors).toEqual([]);
    expect(await availableOf()).toBe(before);
  });

  it("pagar pedido que já está pago é recusado com mensagem, sem derrubar o lote", async () => {
    const user = "user-venda";
    const { orders } = (await db.orders(user)) as { orders: { id: string; status: string }[] };
    const paid = orders.find((o) => o.status === "paid")!;
    const res = await db.bulkOrders(user, { ids: [paid.id], action: "pay" });
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toMatch(/não está aguardando pagamento/);
  });
});
