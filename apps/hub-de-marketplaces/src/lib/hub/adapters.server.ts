import type { ChannelId } from "./channels";

export type ListingKind = "simple" | "variation" | "catalog";

export type AdapterOk = { ok: true; externalId: string };
export type AdapterFail = { ok: false; error: string };
export type AdapterResult = AdapterOk | AdapterFail;

export interface ChannelAdapter {
  publish(input: {
    sku: string;
    title: string;
    priceCents: number;
    stock: number;
    kind: ListingKind;
  }): Promise<AdapterResult>;
  updatePrice(input: { externalId: string; sku: string; priceCents: number }): Promise<AdapterResult>;
  updateStock(input: { externalId: string; sku: string; stock: number }): Promise<AdapterResult>;
  pullOrders(): Promise<AdapterResult>;
  pushTracking(input: { externalId: string; tracking: string; carrier: string }): Promise<AdapterResult>;
  answerQuestion(input: { externalId: string; body: string }): Promise<AdapterResult>;
}

async function wait(): Promise<void> {
  const ms = 160 + Math.floor(Math.random() * 280);
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function flake(action: string): string | null {
  if (Math.random() < 0.05) return `Falha ocasional ao ${action}. O canal não confirmou.`;
  return null;
}

function externalId(channel: ChannelId, sku: string, current?: string | null): string {
  if (current) return current;
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${channel.toUpperCase()}-${sku}-${n}`;
}

function createAdapter(channel: ChannelId): ChannelAdapter {
  return {
    async publish(input) {
      await wait();
      const error = flake("publicar");
      if (error) return { ok: false, error };
      return { ok: true, externalId: externalId(channel, input.sku) };
    },
    async updatePrice(input) {
      await wait();
      const error = flake("atualizar preço");
      if (error) return { ok: false, error };
      return { ok: true, externalId: externalId(channel, input.sku, input.externalId) };
    },
    async updateStock(input) {
      await wait();
      const error = flake("atualizar estoque");
      if (error) return { ok: false, error };
      return { ok: true, externalId: externalId(channel, input.sku, input.externalId) };
    },
    async pullOrders() {
      await wait();
      const error = flake("puxar pedidos");
      if (error) return { ok: false, error };
      return { ok: true, externalId: externalId(channel, "ORDER") };
    },
    async pushTracking(input) {
      await wait();
      const error = flake("enviar rastreio");
      if (error) return { ok: false, error };
      return { ok: true, externalId: input.externalId };
    },
    async answerQuestion(input) {
      await wait();
      const error = flake("responder");
      if (error) return { ok: false, error };
      return { ok: true, externalId: input.externalId || externalId(channel, "Q") };
    },
  };
}

const cache = new Map<ChannelId, ChannelAdapter>();

export function getAdapter(channel: ChannelId): ChannelAdapter {
  // OAuth real fica em oauth.ts, de propósito fora daqui.
  const found = cache.get(channel);
  if (found) return found;
  const created = createAdapter(channel);
  cache.set(channel, created);
  return created;
}

export async function probeChannel(): Promise<{ ok: true } | { ok: false; error: string }> {
  await wait();
  if (Math.random() < 0.28) return { ok: false, error: "Timeout do conector. Sem resposta do canal." };
  return { ok: true };
}
